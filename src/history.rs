use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use anyhow::{Context, Result};

use crate::models::{ReviewSession, ReviewSummary};

#[derive(Clone)]
pub struct ReviewStore {
    pub root: PathBuf,
}

impl ReviewStore {
    pub fn default_location() -> Result<Self> {
        let base = if let Some(path) = std::env::var_os("HREVU_DATA_DIR") {
            PathBuf::from(path)
        } else if let Some(path) = std::env::var_os("XDG_DATA_HOME") {
            PathBuf::from(path).join("hrevu")
        } else if let Some(path) = std::env::var_os("LOCALAPPDATA") {
            PathBuf::from(path).join("hrevu")
        } else {
            PathBuf::from(
                std::env::var_os("HOME")
                    .context("Cannot find home directory; set HREVU_DATA_DIR")?,
            )
            .join(".local/share/hrevu")
        };
        Ok(Self {
            root: base.join("reviews"),
        })
    }

    pub fn path(&self, id: &str) -> Result<PathBuf> {
        let id = uuid::Uuid::parse_str(id).context("Invalid review ID")?;
        Ok(self.root.join(format!("{id}.json")))
    }

    /// Write a complete replacement in the same directory. A failed write must
    /// leave the last acknowledged revision readable.
    pub fn save(&self, session: &ReviewSession) -> Result<()> {
        let path = self.path(&session.id)?;
        let mut directory = fs::DirBuilder::new();
        directory.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            directory.mode(0o700);
        }
        directory.create(&self.root)?;
        let temp = self
            .root
            .join(format!(".{}.{}.tmp", session.id, uuid::Uuid::new_v4()));
        let result = (|| -> Result<()> {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&temp)?;
            file.write_all(&serde_json::to_vec_pretty(session)?)?;
            file.sync_all()?;
            fs::rename(&temp, &path)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(temp);
        }
        result.with_context(|| format!("Failed to save review to {}", path.display()))
    }

    pub fn load(&self, id: &str) -> Result<ReviewSession> {
        let path = self.path(id)?;
        let session: ReviewSession = serde_json::from_slice(
            &fs::read(&path).with_context(|| format!("Cannot read review {}", path.display()))?,
        )?;
        anyhow::ensure!(session.id == id, "Review ID does not match saved record");
        Ok(session)
    }

    pub fn list(&self) -> Result<Vec<ReviewSummary>> {
        if !self.root.exists() {
            return Ok(Vec::new());
        }
        let mut sessions = Vec::new();
        for entry in fs::read_dir(&self.root)? {
            let path = entry?.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            if let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) {
                match self.load(id) {
                    Ok(session) => sessions.push(ReviewSummary::from(session)),
                    Err(error) => {
                        tracing::warn!("Cannot list saved review {}: {error}", path.display())
                    }
                }
            }
        }
        sessions.sort_by_key(|session| std::cmp::Reverse(session.updated_at));
        Ok(sessions)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::models::*;
    use chrono::Utc;

    pub struct Fixture {
        pub store: ReviewStore,
        pub session: ReviewSession,
    }
    impl Fixture {
        pub fn new() -> Self {
            let now = Utc::now();
            Self {
                store: ReviewStore {
                    root: std::env::temp_dir()
                        .join(format!("hrevu-history-{}", uuid::Uuid::new_v4())),
                },
                session: ReviewSession {
                    id: uuid::Uuid::new_v4().to_string(),
                    cwd: PathBuf::from("/original/project"),
                    updated_at: now,
                    data: ReviewData {
                        input_type: InputType::FileContent {
                            path: "missing.md".into(),
                        },
                        input: "File: missing.md".into(),
                        comments: Vec::new(),
                        created_at: now,
                        status: ReviewStatus::InProgress,
                    },
                    snapshot_note: None,
                    files: vec![FileData {
                        path: "missing.md".into(),
                        status: "view".into(),
                        lines: vec![LineData {
                            number: 1,
                            content: "# Frozen content".into(),
                            type_: None,
                        }],
                        markdown: Some("# Frozen content".into()),
                        original_markdown: None,
                    }],
                },
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            if self.store.root.is_dir() {
                let _ = fs::remove_dir_all(&self.store.root);
            } else {
                let _ = fs::remove_file(&self.store.root);
            }
        }
    }

    #[test]
    fn history_round_trips_snapshots_without_the_source_file() {
        let fixture = Fixture::new();
        fixture.store.save(&fixture.session).unwrap();
        let mut changed = fixture.session.clone();
        changed.data.comments.push(Comment::new(
            Some("missing.md".into()),
            Some(1),
            Some(2),
            "Feedback".into(),
        ));
        changed.updated_at += chrono::Duration::seconds(1);
        fixture.store.save(&changed).unwrap();
        let reopened = ReviewStore {
            root: fixture.store.root.clone(),
        }
        .load(&changed.id)
        .unwrap();
        assert_eq!(
            reopened.files[0].markdown.as_deref(),
            Some("# Frozen content")
        );
        assert_eq!(reopened.data.comments[0].text, "Feedback");
        assert_eq!(reopened.data.comments[0].column, Some(2));
        assert_eq!(fixture.store.list().unwrap()[0].comment_count, 1);
        assert_eq!(fs::read_dir(&fixture.store.root).unwrap().count(), 1);
        assert!(fixture.store.load("../outside").is_err());
    }
}
