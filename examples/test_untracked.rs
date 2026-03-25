use git2::Repository;

fn main() {
    let repo = Repository::open(".").unwrap();
    let statuses = repo.statuses(None).unwrap();

    println!("Git statuses:");
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("?");
        let status = entry.status();

        println!("  {:20} - WT_NEW: {}, WT_MODIFIED: {}, INDEX_NEW: {}, INDEX_MODIFIED: {}",
            path,
            status.is_wt_new(),
            status.is_wt_modified(),
            status.is_index_new(),
            status.is_index_modified()
        );
    }
}
