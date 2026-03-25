use git2::{Repository, DiffOptions, Delta};

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
        
        println!("Total deltas: {}", diff.deltas().count());
        
        let diff2 = repo.diff_index_to_workdir(None, Some(&mut opts)).unwrap();
        diff2.foreach(&mut |delta, _| {
            let path = delta.new_file().path()
                .and_then(|p| p.to_str())
                .unwrap_or("unknown");
            let status = match delta.status() {
                Delta::Added => "ADDED",
                Delta::Modified => "MODIFIED",
                Delta::Deleted => "DELETED",
                _ => "OTHER",
            };
            println!("  [{}] {}", status, path);
            true
        }, None, None, None).ok();
    }
}
