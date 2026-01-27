use colored::Colorize;
use crate::models::ReviewData;
use std::collections::HashMap;

/// 打印评论摘要（终端格式）
pub fn print_summary(data: &ReviewData, file_contents: &HashMap<String, Vec<String>>) {
    println!();
    println!("{}", "═".repeat(60));
    println!("{}", "📋 Review Summary".bold().cyan());
    println!("{}", "═".repeat(60));
    println!();

    println!("{}: {}", "Input".bold(), data.input);
    println!(
        "{}: {}",
        "Created".bold(),
        data.created_at.format("%Y-%m-%d %H:%M:%S")
    );
    println!("{}: {}", "Comments".bold(), data.comments.len());
    println!();

    if data.comments.is_empty() {
        println!("{}", "No comments added.".dimmed());
        println!();
        return;
    }

    // 按文件分组
    let mut by_file: std::collections::HashMap<Option<String>, Vec<&crate::models::Comment>> =
        std::collections::HashMap::new();
    for comment in &data.comments {
        by_file.entry(comment.file.clone()).or_default().push(comment);
    }

    // 打印评论
    for (file, comments) in by_file.iter() {
        if let Some(f) = file {
            println!("\n{}", format!("📄 {}", f).bold());
        } else {
            println!("\n{}", "💬 Global Comments".bold());
        }

        for comment in comments {
            println!();
            print!("💬 ");

            if let Some(line) = comment.line {
                print!("{} {}: ", "Line".yellow(), line.to_string().yellow());
            }

            println!("{}", comment.text);

            // 显示原文内容
            if let (Some(file_path), Some(line_num)) = (&comment.file, comment.line) {
                if let Some(lines) = file_contents.get(file_path) {
                    let idx = (line_num as usize).saturating_sub(1);
                    if idx < lines.len() {
                        let content = lines[idx].trim();
                        if !content.is_empty() {
                            println!(
                                "    {} {}",
                                "▸".dimmed(),
                                content.dimmed()
                            );
                        }
                    }
                }
            }

            println!(
                "    {} {}",
                "─".dimmed(),
                comment.created_at.format("%H:%M").to_string().dimmed()
            );
        }
    }

    // 统计
    println!();
    println!("{}", "─".repeat(60).dimmed());
    println!(
        "{} {} total comments",
        "Summary:".bold(),
        data.comments.len().to_string().cyan()
    );
}
