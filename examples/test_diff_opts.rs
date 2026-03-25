use git2::{Repository, DiffOptions};

fn main() {
    let repo = Repository::discover(".").unwrap();
    
    // Test with include_untracked
    let mut opts = DiffOptions::new();
    opts.include_untracked(true);
    
    {
        let diff = repo.diff_index_to_workdir(None, Some(&mut opts)).unwrap();
        println!("With include_untracked: {} files", diff.deltas().count());
    }
    
    // Now iterate
    {
        let diff = repo.diff_index_to_workdir(None, Some(&mut opts)).unwrap();
        println!("\nFiles with include_untracked:");
        let _ = diff.foreach(&mut |delta, _| {
            if let Some(path) = delta.new_file().path() {
                println!("  - {:?}", path);
            }
            true
        }, None, None, None);
    }
}
