use git2::{Repository, DiffOptions};

fn main() {
    let repo = Repository::discover(".").unwrap();

    // Test 1: default options (no untracked)
    let mut opts1 = DiffOptions::new();
    let diff1 = repo.diff_index_to_workdir(None, Some(&mut opts1));
    println!("Default options: {:?} files", diff1.map(|d| d.deltas().count()).unwrap_or(0));

    // Test 2: with include_untracked
    let mut opts2 = DiffOptions::new();
    opts2.include_untracked(true);
    opts2.recurse_untracked_dirs(true);
    let diff2 = repo.diff_index_to_workdir(None, Some(&mut opts2));
    println!("With include_untracked: {:?} files", diff2.map(|d| d.deltas().count()).unwrap_or(0));

    // Check what files are in each
    if let Ok(diff) = repo.diff_index_to_workdir(None, Some(&mut opts2)) {
        println!("\nFiles with include_untracked:");
        diff.foreach(&mut |delta, _| {
            let status = delta.status();
            if let Some(path) = delta.new_file().path() {
                println!("  - {:?} (status={:?})", path, status);
            }
            true
        }, None, None, None).ok();
    }
}
