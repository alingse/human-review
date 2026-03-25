use git2::{Repository, DiffOptions};

fn main() {
    let repo = Repository::discover(".").unwrap();
    let head = repo.head().ok();
    
    if let Some(head_ref) = head {
        let commit = head_ref.peel_to_commit().unwrap();
        let tree = commit.tree().unwrap();
        
        let mut opts = DiffOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);
        
        let diff = repo.diff_index_to_workdir(None, Some(&mut opts)).unwrap();
        
        let mut file_count = 0;
        let mut line_count = 0;
        
        diff.foreach(
            &mut |delta, _| {
                let path = delta.new_file().path()
                    .and_then(|p| p.to_str())
                    .unwrap_or("unknown");
                println!("File: {}", path);
                file_count += 1;
                true
            },
            None,
            Some(&mut |delta, hunk| {
                let path = delta.new_file().path()
                    .and_then(|p| p.to_str())
                    .unwrap_or("unknown");
                println!("  Hunk for: {}", path);
                true
            }),
            Some(&mut |delta, _hunk, line| {
                line_count += 1;
                let origin = line.origin() as char;
                let content = std::str::from_utf8(line.content()).unwrap_or("");
                println!("    Line: '{}': {}", origin, content.trim());
                true
            }),
        ).ok();
        
        println!("\nSummary: {} files, {} lines", file_count, line_count);
    }
}
