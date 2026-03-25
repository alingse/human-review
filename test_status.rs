use git2::{Repository, StatusOptions};

fn main() {
    let repo = Repository::discover(".").unwrap();
    
    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    
    let statuses = repo.statuses(Some(&mut opts)).unwrap();
    
    println!("Total statuses: {}", statuses.len());
    for entry in statuses.iter() {
        let status = entry.status();
        if let Some(path) = entry.path() {
            println!("path={:?}, is_wt_new={}, is_index_new={}, bits={:?}",
                path, status.is_wt_new(), status.is_index_new(), status);
        }
    }
}
