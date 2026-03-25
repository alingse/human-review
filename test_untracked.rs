use git2::{Repository, DiffOptions};

fn main() {
    let repo = Repository::discover(".").unwrap();
    
    let mut opts = DiffOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    
    let diff = repo.diff_index_to_workdir(None, Some(&mut opts)).unwrap();
    
    println!("Total deltas: {}", diff.deltas().count());
    
    for (i, delta) in diff.deltas().enumerate() {
        let status = delta.status();
        let old_path = delta.old_file().path().and_then(|p| p.to_str()).unwrap_or("");
        let new_path = delta.new_file().path().and_then(|p| p.to_str()).unwrap_or("");
        println!("Delta {}: status={:?}, old={:?}, new={:?}", i, status, old_path, new_path);
    }
}
