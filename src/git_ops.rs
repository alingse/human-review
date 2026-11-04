use anyhow::Result;
use git2::{Delta, Diff, Repository};
use std::cell::RefCell;
use std::fs;
use std::path::Path;

use crate::models::{FileData, InputType, LineData};

/// Default number of context lines for diff
const DIFF_CONTEXT_LINES: u32 = 3;

/// Extract file lines from a FileData vector
pub fn extract_file_lines(files: Vec<FileData>) -> std::collections::HashMap<String, Vec<String>> {
    files
        .into_iter()
        .map(|file| {
            let lines: Vec<String> = file.lines.iter().map(|l| l.content.clone()).collect();
            (file.path, lines)
        })
        .collect()
}

/// Parse user input into InputType
pub fn parse_input(input: &str) -> Result<InputType> {
    if input == "diff" {
        return Ok(InputType::WorkingTreeDiff);
    }

    if Path::new(input).exists() {
        return Ok(InputType::FileContent {
            path: input.to_string(),
        });
    }

    if let Ok(repo) = Repository::discover(".") {
        if repo.revparse_single(input).is_ok() {
            return Ok(InputType::CommitDiff {
                commit: input.to_string(),
            });
        }
    }

    Err(anyhow::anyhow!(
        "Unable to parse input: {}. Please provide: commit hash, file path, or 'diff'",
        input
    ))
}

/// Create diff options with default settings
fn create_diff_options() -> git2::DiffOptions {
    let mut opts = git2::DiffOptions::new();
    opts.include_unmodified(false);
    opts.context_lines(DIFF_CONTEXT_LINES);
    opts
}

/// Get working tree diff (including staged and unstaged changes)
pub fn get_working_tree_diff() -> Result<Vec<FileData>> {
    let repo = Repository::discover(".")?;
    let head_tree = get_head_tree(&repo)?;

    let result = match head_tree {
        Some(tree) => get_diff_with_head(&repo, &tree)?,
        None => get_untracked_files(&repo)?,
    };

    let mut files: Vec<FileData> = result;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

/// Get the HEAD commit tree if it exists
fn get_head_tree(repo: &Repository) -> Result<Option<git2::Tree<'_>>> {
    match repo.head() {
        Ok(head) => {
            let commit = head.peel_to_commit()?;
            Ok(Some(commit.tree()?))
        }
        Err(_) => Ok(None),
    }
}

/// Get diff when HEAD exists (merge staged and unstaged changes)
fn get_diff_with_head(repo: &Repository, tree: &git2::Tree) -> Result<Vec<FileData>> {
    let mut opts = create_diff_options();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    opts.show_untracked_content(true);
    let diff = repo.diff_tree_to_workdir_with_index(Some(tree), Some(&mut opts))?;
    diff_to_file_data(repo, &diff, true)
}

fn is_markdown(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown" | "mkd"
            )
        })
        .unwrap_or(false)
}

fn markdown_blob(repo: &Repository, id: git2::Oid) -> Option<String> {
    let blob = repo.find_blob(id).ok()?;
    std::str::from_utf8(blob.content()).ok().map(str::to_owned)
}

/// Get untracked files when HEAD doesn't exist
fn get_untracked_files(repo: &Repository) -> Result<Vec<FileData>> {
    let mut files = Vec::new();
    let statuses = repo.statuses(None)?;

    for entry in statuses.iter() {
        let status = entry.status();

        let is_relevant = status.is_index_new()
            || status.is_wt_new()
            || status.is_index_modified()
            || status.is_wt_modified();

        let is_deleted = status.is_index_deleted() || status.is_wt_deleted();

        if is_relevant && !is_deleted {
            if let Some(path) = entry.path() {
                if let Ok(content) =
                    fs::read_to_string(repo.workdir().unwrap_or(Path::new(".")).join(path))
                {
                    let lines = enumerate_file_lines(&content, Some("added"));
                    files.push(FileData {
                        path: path.to_string(),
                        status: "added".to_string(),
                        lines,
                        markdown: is_markdown(path).then_some(content),
                        original_markdown: None,
                    });
                }
            }
        }
    }

    Ok(files)
}

/// Get commit diff
pub fn get_commit_diff(commit_hash: &str) -> Result<Vec<FileData>> {
    let repo = Repository::discover(".")?;
    let obj = repo.revparse_single(commit_hash)?;
    let commit = obj.peel_to_commit()?;

    let parent_tree = if commit.parent_count() > 0 {
        let parent = commit.parent(0)?;
        Some(parent.tree()?)
    } else {
        None
    };

    let commit_tree = commit.tree()?;
    let mut diff_opts = create_diff_options();

    let diff = repo.diff_tree_to_tree(
        parent_tree.as_ref(),
        Some(&commit_tree),
        Some(&mut diff_opts),
    )?;

    diff_to_file_data(&repo, &diff, false)
}

/// Get file content
pub fn get_file_content(path: &str) -> Result<Vec<FileData>> {
    let content = fs::read_to_string(path)?;
    let lines = enumerate_file_lines(&content, None);

    Ok(vec![FileData {
        path: path.to_string(),
        status: "view".to_string(),
        lines,
        markdown: is_markdown(path).then_some(content),
        original_markdown: None,
    }])
}

/// Enumerate file content into LineData
fn enumerate_file_lines(content: &str, line_type: Option<&str>) -> Vec<LineData> {
    content
        .lines()
        .enumerate()
        .map(|(i, line)| LineData {
            number: (i + 1) as u32,
            content: line.to_string(),
            type_: line_type.map(|t| t.to_string()),
        })
        .collect()
}

/// Convert git2 Diff to FileData
fn diff_to_file_data(repo: &Repository, diff: &Diff, from_workdir: bool) -> Result<Vec<FileData>> {
    let files_map: RefCell<std::collections::HashMap<String, FileData>> =
        RefCell::new(std::collections::HashMap::new());

    diff.foreach(
        &mut |delta, _progress| {
            let path = delta
                .new_file()
                .path()
                .and_then(|p| p.to_str())
                .unwrap_or("binary")
                .to_string();

            let status = match delta.status() {
                Delta::Added | Delta::Untracked => "added",
                Delta::Deleted => "deleted",
                Delta::Modified | Delta::Renamed | Delta::Copied => "modified",
                _ => "modified",
            };

            let (markdown, original_markdown) = if is_markdown(&path) {
                let current = if delta.status() == Delta::Deleted {
                    None
                } else if from_workdir {
                    repo.workdir()
                        .and_then(|root| fs::read_to_string(root.join(&path)).ok())
                } else {
                    markdown_blob(repo, delta.new_file().id())
                };
                (current, markdown_blob(repo, delta.old_file().id()))
            } else {
                (None, None)
            };

            files_map.borrow_mut().insert(
                path.clone(),
                FileData {
                    path: path.clone(),
                    status: status.to_string(),
                    lines: Vec::new(),
                    markdown,
                    original_markdown,
                },
            );
            true
        },
        None,
        Some(&mut |_delta, _hunk| true),
        Some(&mut |delta, _hunk, line| {
            let path = delta
                .new_file()
                .path()
                .and_then(|p| p.to_str())
                .unwrap_or("binary")
                .to_string();

            if line.content().is_empty() {
                return true;
            }

            let content = std::str::from_utf8(line.content())
                .unwrap_or("")
                .trim_end()
                .to_string();

            let line_type = match line.origin() {
                '+' | '>' => Some("added"),
                '-' | '<' => Some("removed"),
                _ => None,
            };

            let is_removed = line_type == Some("removed");
            let line_num = line.new_lineno().unwrap_or_else(|| {
                if is_removed {
                    line.old_lineno().unwrap_or(0)
                } else {
                    0
                }
            });

            if let Some(file) = files_map.borrow_mut().get_mut(&path) {
                file.lines.push(LineData {
                    number: line_num,
                    content,
                    type_: line_type.map(|t| t.to_string()),
                });
            }
            true
        }),
    )?;

    Ok(files_map.into_inner().into_values().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        root: std::path::PathBuf,
        repo: Repository,
    }

    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("hrevu-{}", uuid::Uuid::new_v4()));
            let repo = Repository::init(&root).unwrap();
            Self { root, repo }
        }

        fn commit(&self, source: &str) -> git2::Oid {
            fs::write(self.root.join("plan.md"), source).unwrap();
            let mut index = self.repo.index().unwrap();
            index.add_path(Path::new("plan.md")).unwrap();
            index.write().unwrap();
            let tree = self.repo.find_tree(index.write_tree().unwrap()).unwrap();
            let signature = git2::Signature::now("Review test", "test@example.com").unwrap();
            let parent = self
                .repo
                .head()
                .ok()
                .map(|head| head.peel_to_commit().unwrap());
            let parents: Vec<_> = parent.iter().collect();
            self.repo
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    "snapshot",
                    &tree,
                    &parents,
                )
                .unwrap()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn markdown_snapshots_match_the_reviewed_version() {
        let fixture = Fixture::new();
        fixture.commit("# Original\n\nold\n");
        let reviewed = fixture.commit("# Reviewed\n\nnew\n");
        // The current disk file must not leak into a historical commit review.
        fs::write(fixture.root.join("plan.md"), "# Working copy\n").unwrap();
        let commit = fixture.repo.find_commit(reviewed).unwrap();
        let old = commit.parent(0).unwrap().tree().unwrap();
        let tree = commit.tree().unwrap();
        let diff = fixture
            .repo
            .diff_tree_to_tree(Some(&old), Some(&tree), None)
            .unwrap();
        let files = diff_to_file_data(&fixture.repo, &diff, false).unwrap();
        assert_eq!(files[0].markdown.as_deref(), Some("# Reviewed\n\nnew\n"));
        assert_eq!(
            files[0].original_markdown.as_deref(),
            Some("# Original\n\nold\n")
        );

        // Stage a different intermediate version, then edit again. The review
        // should compare HEAD directly to disk without duplicate patch rows.
        let mut index = fixture.repo.index().unwrap();
        index.add_path(Path::new("plan.md")).unwrap();
        index.write().unwrap();
        fs::write(fixture.root.join("plan.md"), "# Final\n\nfinal\n").unwrap();
        fs::write(fixture.root.join("new.md"), "# Untracked\n").unwrap();
        let files = get_diff_with_head(&fixture.repo, &tree).unwrap();
        let plan = files.iter().find(|file| file.path == "plan.md").unwrap();
        assert_eq!(plan.markdown.as_deref(), Some("# Final\n\nfinal\n"));
        assert_eq!(
            plan.original_markdown.as_deref(),
            Some("# Reviewed\n\nnew\n")
        );
        assert!(!plan
            .lines
            .iter()
            .any(|line| line.content.contains("Working copy")));
        assert_eq!(
            files
                .iter()
                .find(|file| file.path == "new.md")
                .unwrap()
                .markdown
                .as_deref(),
            Some("# Untracked\n")
        );

        fs::remove_file(fixture.root.join("plan.md")).unwrap();
        let files = get_diff_with_head(&fixture.repo, &tree).unwrap();
        let deleted = files.iter().find(|file| file.path == "plan.md").unwrap();
        assert_eq!(deleted.status, "deleted");
        assert!(deleted.markdown.is_none());
        assert_eq!(
            deleted.original_markdown.as_deref(),
            Some("# Reviewed\n\nnew\n")
        );
    }
}
