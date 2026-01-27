use anyhow::Result;
use git2::{Repository, Diff, Delta};
use std::path::Path;
use std::fs;
use std::cell::RefCell;

use crate::models::{InputType, FileData, LineData};

/// 从 FileData 向量中提取文件的行内容
pub fn extract_file_lines(files: Vec<FileData>) -> std::collections::HashMap<String, Vec<String>> {
    files
        .into_iter()
        .map(|file| {
            let lines: Vec<String> = file.lines.iter().map(|l| l.content.clone()).collect();
            (file.path, lines)
        })
        .collect()
}

/// 解析输入
pub fn parse_input(input: &str) -> Result<InputType> {
    // 检查是否是 "diff" 关键字
    if input == "diff" {
        return Ok(InputType::WorkingTreeDiff);
    }

    // 检查是否是文件路径
    if Path::new(input).exists() {
        return Ok(InputType::FileContent {
            path: input.to_string(),
        });
    }

    // 尝试解析为 commit hash
    if let Ok(repo) = Repository::discover(".") {
        if repo.revparse_single(input).is_ok() {
            return Ok(InputType::CommitDiff {
                commit: input.to_string(),
            });
        }
    }

    Err(anyhow::anyhow!(
        "无法解析输入: {}. 请提供: commit hash, 文件路径, 或 'diff'",
        input
    ))
}

/// 获取工作区 diff（包括已暂存和未暂存）
pub fn get_working_tree_diff() -> Result<Vec<FileData>> {
    let repo = Repository::discover(".")?;

    // 检查是否有 HEAD
    let head_tree = if let Ok(head) = repo.head() {
        let head_commit = head.peel_to_commit()?;
        Some(head_commit.tree()?)
    } else {
        None
    };

    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.include_unmodified(false);
    diff_opts.recurse_untracked_dirs(true);
    diff_opts.context_lines(3);

    let result = if let Some(tree) = head_tree {
        // 有 HEAD 的情况：合并已暂存和未暂存的变更
        let mut cached_opts = git2::DiffOptions::new();
        cached_opts.include_unmodified(false);
        cached_opts.context_lines(3);

        // 已暂存的变更 (HEAD vs Index, 类似于 --cached)
        let cached_diff = repo.diff_tree_to_index(Some(&tree), None, Some(&mut cached_opts))?;

        // 未暂存的变更 (Index vs Workdir)
        let workdir_diff = repo.diff_index_to_workdir(None, Some(&mut diff_opts))?;

        // 合并两个 diff
        let mut merged_files = std::collections::HashMap::new();
        for file in diff_to_file_data(&cached_diff, &repo)? {
            merged_files.insert(file.path.clone(), file);
        }
        for file in diff_to_file_data(&workdir_diff, &repo)? {
            if let Some(existing) = merged_files.get_mut(&file.path) {
                // 文件同时存在于两个 diff 中，合并行
                existing.lines.extend(file.lines);
            } else {
                merged_files.insert(file.path.clone(), file);
            }
        }

        merged_files.into_values().collect()
    } else {
        // 没有 HEAD，显示所有未跟踪文件
        get_untracked_files(&repo)?
    };

    // 按路径排序
    let mut files: Vec<FileData> = result;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

/// 获取未跟踪文件
fn get_untracked_files(repo: &Repository) -> Result<Vec<FileData>> {
    let mut files = Vec::new();

    let statuses = repo.statuses(None)?;
    for entry in statuses.iter() {
        let status = entry.status();
        // 在没有 HEAD 的情况下，处理所有有变更的文件
        // 包括新增、修改、删除等状态
        if status.is_index_new() || status.is_wt_new() || status.is_index_modified() || status.is_wt_modified() {
            if let Some(path) = entry.path() {
                // 跳过已删除的文件（在索引中标记为删除）
                if status.is_index_deleted() || status.is_wt_deleted() {
                    continue;
                }
                let content = fs::read_to_string(path)?;
                let lines: Vec<LineData> = content
                    .lines()
                    .enumerate()
                    .map(|(i, line)| LineData {
                        number: (i + 1) as u32,
                        content: line.to_string(),
                        type_: Some("added".to_string()),
                    })
                    .collect();

                files.push(FileData {
                    path: path.to_string(),
                    status: "added".to_string(),
                    lines,
                });
            }
        }
    }

    Ok(files)
}

/// 获取 commit diff
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

    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.context_lines(3);

    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), Some(&mut diff_opts))?;

    diff_to_file_data(&diff, &repo)
}

/// 获取文件内容
pub fn get_file_content(path: &str) -> Result<Vec<FileData>> {
    let content = fs::read_to_string(path)?;
    let lines: Vec<LineData> = content
        .lines()
        .enumerate()
        .map(|(i, line)| LineData {
            number: (i + 1) as u32,
            content: line.to_string(),
            type_: None,
        })
        .collect();

    Ok(vec![FileData {
        path: path.to_string(),
        status: "view".to_string(),
        lines,
    }])
}

/// 将 git2 Diff 转换为 FileData
fn diff_to_file_data(diff: &Diff, _repo: &Repository) -> Result<Vec<FileData>> {
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
            // Process hunk header if needed
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

            // 跳过二进制文件
            if line.content().is_empty() {
                return true;
            }

            let content = std::str::from_utf8(line.content())
                .unwrap_or("")
                .trim_end()
                .to_string();

            let (line_num, line_type) = match line.origin() {
                '+' | '>' => (line.new_lineno().unwrap_or(0), Some("added".to_string())),
                '-' | '<' => (
                    line.old_lineno().unwrap_or(0),
                    Some("removed".to_string()),
                ),
                _ => (line.new_lineno().unwrap_or(0), None),
            };

            if let Some(file) = files_map.borrow_mut().get_mut(&path) {
                // 显示所有行，包括上下文行（line_type 为 None 表示上下文）
                file.lines.push(LineData {
                    number: line_num,
                    content,
                    type_: line_type,
                });
            }
            true
        }),
    )?;

    Ok(files_map.into_inner().into_values().collect())
}
