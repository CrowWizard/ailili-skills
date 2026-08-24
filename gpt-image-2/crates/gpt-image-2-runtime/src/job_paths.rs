use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

static JOB_SEQ: AtomicU64 = AtomicU64::new(1);

pub fn unique_job_dir(root: impl AsRef<Path>, prefix: &str) -> Result<(String, PathBuf), String> {
    let root = root.as_ref();
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let pid = std::process::id();
    for _ in 0..1024 {
        let seq = JOB_SEQ.fetch_add(1, Ordering::Relaxed);
        let id = format!("{prefix}-{millis}-{pid}-{seq}");
        let dir = root.join(&id);
        match fs::create_dir(&dir) {
            Ok(()) => return Ok((id, dir)),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("unable to allocate a unique job directory".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashSet, thread};

    #[test]
    fn concurrent_ids_are_unique() {
        let root = std::env::temp_dir().join(format!(
            "ailili-unique-job-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let handles: Vec<_> = (0..32)
            .map(|_| {
                let root = root.clone();
                thread::spawn(move || unique_job_dir(&root, "t").unwrap().0)
            })
            .collect();
        let ids: HashSet<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        let _ = fs::remove_dir_all(&root);
        assert_eq!(ids.len(), 32);
    }
}
