use anyhow::Result;
use clap::Parser;
use colored::Colorize;
use tracing::{info, warn};
use chrono::Utc;
use std::collections::HashMap;

mod cli;
mod server;
mod git_ops;
mod models;
mod routes;
mod output;
mod static_assets;

use cli::Args;
use git_ops::parse_input;
use output::print_summary;

#[tokio::main]
async fn main() -> Result<()> {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let args = Args::parse();

    // 解析输入
    let input = parse_input(&args.input)?;
    info!("Parsed input: {:?}", input);

    // 创建数据
    let input_str = match &input {
        crate::models::InputType::CommitDiff { commit } => format!("Commit: {}", commit),
        crate::models::InputType::FileContent { path } => format!("File: {}", path),
        crate::models::InputType::WorkingTreeDiff => "Working Tree Diff".to_string(),
    };

    let data = crate::models::ReviewData {
        input_type: input.clone(),
        input: input_str,
        comments: Vec::new(),
        created_at: Utc::now(),
        status: crate::models::ReviewStatus::InProgress,
    };

    println!();
    println!("{}", "▶ Starting hrevu...".bold().cyan());
    println!("  Target: {}", data.input);
    println!();

    // 启动服务器
    let port = server::run(args.port, data).await?;
    let url = format!("http://localhost:{}", port);

    println!("  Server: {}", url.dimmed());
    println!();

    // 打开浏览器
    if !args.no_browser {
        if let Err(e) = open::that(&url) {
            warn!("Failed to open browser: {}", e);
            println!("  {}", format!("Please open {} in your browser", url).yellow());
        } else {
            println!("  {}", "Browser opened automatically".green());
        }
    } else {
        println!("  {}", format!("Open {} in your browser", url).yellow());
    }

    println!();
    println!("{}", "Waiting for review to complete...".dimmed());
    println!("{}", "Press Ctrl+C to cancel".dimmed());
    println!();

    // 等待服务器完成并获取最终数据
    let final_data = server::wait_for_completion().await?;

    // 获取文件内容用于显示上下文
    let mut file_contents: HashMap<String, Vec<String>> = HashMap::new();
    match &final_data.input_type {
        crate::models::InputType::FileContent { path } => {
            if let Ok(content) = std::fs::read_to_string(path) {
                let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                file_contents.insert(path.clone(), lines);
            }
        }
        crate::models::InputType::CommitDiff { commit } => {
            if let Ok(files) = git_ops::get_commit_diff(commit) {
                for file in files {
                    let lines: Vec<String> = file.lines.iter().map(|l| l.content.clone()).collect();
                    file_contents.insert(file.path, lines);
                }
            }
        }
        crate::models::InputType::WorkingTreeDiff => {
            if let Ok(files) = git_ops::get_working_tree_diff() {
                for file in files {
                    let lines: Vec<String> = file.lines.iter().map(|l| l.content.clone()).collect();
                    file_contents.insert(file.path, lines);
                }
            }
        }
    }

    print_summary(&final_data, &file_contents);

    println!();
    println!("{}", "✓ Review complete!".bold().green());

    Ok(())
}
