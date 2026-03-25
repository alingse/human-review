use anyhow::Result;
use git2::{Repository, StatusOptions};
use std::fs;

fn main() -> Result<()> {
    let repo = Repository::open(".")?;

    // Test 1: Check default statuses
    println!("=== Test 1: Default statuses ===");
    let statuses = repo.statuses(None)?;
    println!("Total statuses (default): {}", statuses.len());
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("?");
        let status = entry.status();
        if status.is_wt_new() {
            println!("  Untracked: {}", path);
        }
    }

    // Test 2: Check with include_untracked option
    println!("\n=== Test 2: With include_untracked ===");
    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut opts))?;
    println!("Total statuses (with opts): {}", statuses.len());
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("?");
        let status = entry.status();
        if status.is_wt_new() {
            println!("  Untracked: {}", path);

            // Try to read the file
            if let Some(workdir) = repo.workdir() {
                let full_path = workdir.join(path);
                match fs::read_to_string(&full_path) {
                    Ok(content) => {
                        let lines: Vec<&str> = content.lines().collect();
                        println!("    - Read {} lines", lines.len());
                    }
                    Err(e) => {
                        println!("    - Failed to read: {}", e);
                    }
                }
            }
        }
    }

    Ok(())
}
