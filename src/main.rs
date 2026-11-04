use anyhow::Result;
use chrono::Utc;
use clap::Parser;
use std::collections::HashMap;
use std::process::Command;
use tracing::{info, warn};

mod cli;
mod git_ops;
mod history;
mod models;
mod output;
mod routes;
mod server;
mod static_assets;

use cli::{Args, Command as ReviewCommand, ExportFormat};
use git_ops::{extract_file_lines, parse_input};
use history::ReviewStore;
use models::{ReviewSession, ReviewStatus};
use output::{print_json, print_summary};

/// Detect if running under WSL
fn is_wsl() -> bool {
    std::fs::read_to_string("/proc/version")
        .map(|v| v.contains("Microsoft") || v.contains("WSL"))
        .unwrap_or(false)
}

/// Open browser in a cross-platform way
fn open_browser(url: &str) -> Result<()> {
    if is_wsl() {
        info!("WSL detected, using Windows browser");
        let mut cmd = Command::new("cmd.exe");
        cmd.args(["/c", "start", "", url]);

        // Set current_dir to avoid UNC path errors
        let system32 = std::path::Path::new("/mnt/c/Windows/System32");
        if system32.exists() {
            cmd.current_dir(system32);
        }

        cmd.spawn()?;
    } else {
        open::that(url)?;
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();

    let args = Args::parse();
    let store = ReviewStore::default_location()?;
    let mut browsing_history = false;
    let session = match args.command {
        Some(ReviewCommand::History) if args.json => {
            println!("{}", serde_json::to_string_pretty(&store.list()?)?);
            return Ok(());
        }
        Some(ReviewCommand::Show { id }) => {
            println!("{}", serde_json::to_string_pretty(&store.load(&id)?)?);
            return Ok(());
        }
        Some(ReviewCommand::Export { id, format, output }) => {
            let session = store.load(&id)?;
            let content = match format {
                ExportFormat::Json => serde_json::to_string_pretty(&session)?,
                ExportFormat::Text => output::export_text(&session),
            };
            if let Some(path) = output {
                std::fs::write(&path, content)?;
                eprintln!("Exported review to {}", path.display());
            } else {
                println!("{content}");
            }
            return Ok(());
        }
        Some(ReviewCommand::History) => {
            browsing_history = true;
            None
        }
        Some(ReviewCommand::Resume { id }) => {
            let session = store.load(&id)?;
            anyhow::ensure!(
                session.data.status == ReviewStatus::InProgress,
                "This review is completed; use hrevu history to view it"
            );
            Some(session)
        }
        None => {
            let input = parse_input(args.input.as_deref().expect("clap requires input"))?;
            info!("Parsed input: {:?}", input);
            let files = match &input {
                models::InputType::CommitDiff { commit } => git_ops::get_commit_diff(commit)?,
                models::InputType::FileContent { path } => git_ops::get_file_content(path)?,
                models::InputType::WorkingTreeDiff => git_ops::get_working_tree_diff()?,
            };
            let now = Utc::now();
            let session = ReviewSession {
                id: uuid::Uuid::new_v4().to_string(),
                cwd: std::env::current_dir()?,
                updated_at: now,
                data: models::ReviewData {
                    input: input.display_title(),
                    input_type: input,
                    comments: Vec::new(),
                    created_at: now,
                    status: ReviewStatus::InProgress,
                },
                files,
                snapshot_note: None,
            };
            store.save(&session)?;
            Some(session)
        }
    };
    println!("\n▶ Starting hrevu...");
    if let Some(session) = &session {
        println!("  Target: {}", session.data.input);
        println!("  Review ID: {}", session.id);
        println!("  Saved: {}", store.path(&session.id)?.display());
        println!("  Read anytime: hrevu show {} --json", session.id);
    }
    let (port, state) = server::run(args.port, session, store).await?;
    let url = format!(
        "http://localhost:{}{}",
        port,
        if browsing_history { "/?history=1" } else { "/" }
    );
    println!("  Server: {url}\n");
    if !args.no_open {
        if let Err(error) = open_browser(&url) {
            warn!("Failed to open browser: {error}");
        }
    }
    if browsing_history {
        println!("Saved reviews are available in the browser. Press Ctrl+C to stop serving.");
        tokio::signal::ctrl_c().await?;
        return Ok(());
    }
    println!("Comments are saved automatically. Waiting for review completion...");
    let session = tokio::select! {
        result = server::wait_for_completion(&state) => result?,
        result = tokio::signal::ctrl_c() => {
            result?;
            println!("Review saved. Use hrevu resume <review-id> to continue.");
            return Ok(());
        }
    };
    let file_contents: HashMap<String, Vec<String>> = extract_file_lines(session.files.clone());
    if args.json {
        print_json(&session);
    } else {
        print_summary(&session.data, &file_contents);
    }
    println!("\n✓ Review complete and saved: {}", session.id);
    if !args.exit_on_complete {
        println!("History and exports remain available at {url}. Press Ctrl+C to stop serving.");
        tokio::signal::ctrl_c().await?;
    }
    Ok(())
}
