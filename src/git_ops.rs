use anyhow::Result;
use git2::{Repository, Diff, Delta};
use std::path::Path;
use std::fs;
use std::cell::RefCell;

use crate::models::{InputType, FileData, LineData};

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
    let mut workdir_opts = create_diff_options();
    workdir_opts.recurse_untracked_dirs(true);

    let mut cached_opts = create_diff_options();

    let cached_diff = repo.diff_tree_to_index(Some(tree), None, Some(&mut cached_opts))?;
    let workdir_diff = repo.diff_index_to_workdir(None, Some(&mut workdir_opts))?;

    merge_diffs(cached_diff, workdir_diff)
}

/// Merge two diffs into a single FileData vector
fn merge_diffs(cached_diff: Diff, workdir_diff: Diff) -> Result<Vec<FileData>> {
    let mut merged_files = std::collections::HashMap::new();

    for file in diff_to_file_data(&cached_diff)? {
        merged_files.insert(file.path.clone(), file);
    }

    for file in diff_to_file_data(&workdir_diff)? {
        if let Some(existing) = merged_files.get_mut(&file.path) {
            existing.lines.extend(file.lines);
        } else {
            merged_files.insert(file.path.clone(), file);
        }
    }

    Ok(merged_files.into_values().collect())
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
                if let Ok(content) = fs::read_to_string(path) {
                    let lines = enumerate_file_lines(&content, Some("added"));
                    files.push(FileData {
                        path: path.to_string(),
                        status: "added".to_string(),
                        lines,
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

    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), Some(&mut diff_opts))?;

    diff_to_file_data(&diff)
}

/// Get file content
pub fn get_file_content(path: &str) -> Result<Vec<FileData>> {
    let content = fs::read_to_string(path)?;
    let lines = enumerate_file_lines(&content, None);

    Ok(vec![FileData {
        path: path.to_string(),
        status: "view".to_string(),
        lines,
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
fn diff_to_file_data(diff: &Diff) -> Result<Vec<FileData>> {
    let files_map = RefCell::new(std::collections::HashMap::<String, FileData>::new());

    diff.foreach(
        &mut |delta, _progress| {
            let path = delta
                .new_file()
                .path()
                .and_then(|p| p.to_str())
                .unwrap_or("binary")
                .to_string();

            let status = match delta.status() {
                Delta::Added => "added",
                Delta::Deleted => "deleted",
                Delta::Modified | Delta::Renamed | Delta::Copied => "modified",
                _ => "modified",
            };

            files_map.borrow_mut().insert(
                path.clone(),
                FileData {
                    path: path.clone(),
                    status: status.to_string(),
                    lines: Vec::new(),
                },
            );
            true
        },
        None,
        Some(&mut |delta, _hunk| {
            let _ = delta.new_file().path();
            true
        }),
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

            let line_num = line.new_lineno().unwrap_or_else(|| {
                if line_type == Some("removed") {
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
