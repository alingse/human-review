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
use git_ops::{parse_input, extract_file_lines};
use output::{print_summary, print_json};

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
    let input_str = input.display_title();

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
    if let Err(e) = open::that(&url) {
        warn!("Failed to open browser: {}", e);
        println!("  {}", format!("Please open {} in your browser", url).yellow());
    } else {
        println!("  {}", "Browser opened automatically".green());
    }

    println!();
    println!("{}", "Waiting for review to complete...".dimmed());
    println!("{}", "Press Ctrl+C to cancel".dimmed());
    println!();

    // 等待服务器完成并获取最终数据
    let final_data = server::wait_for_completion().await?;

    // 获取文件内容用于显示上下文
    let file_contents: HashMap<String, Vec<String>> = match &final_data.input_type {
        crate::models::InputType::FileContent { path } => {
            if let Ok(content) = std::fs::read_to_string(path) {
                let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                HashMap::from([(path.clone(), lines)])
            } else {
                HashMap::new()
            }
        }
        crate::models::InputType::CommitDiff { commit } => {
            git_ops::get_commit_diff(commit)
                .map(extract_file_lines)
                .unwrap_or_default()
        }
        crate::models::InputType::WorkingTreeDiff => {
            git_ops::get_working_tree_diff()
                .map(extract_file_lines)
                .unwrap_or_default()
        }
    };

    if args.json {
        print_json(&final_data);
    } else {
        print_summary(&final_data, &file_contents);
    }

    println!();
    println!("{}", "✓ Review complete!".bold().green());

    Ok(())
}
