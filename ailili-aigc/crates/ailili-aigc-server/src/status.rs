pub fn task_status(internal: Option<&str>) -> &'static str {
    match internal {
        Some("completed") => "SUCCESS",
        Some("failed") | Some("canceled") | Some("cancelled") => "FAILED",
        _ => "PROCESSING",
    }
}

#[cfg(test)]
mod tests {
    use super::task_status;

    #[test]
    fn maps_queue_status() {
        assert_eq!(task_status(Some("queued")), "PROCESSING");
        assert_eq!(task_status(Some("running")), "PROCESSING");
        assert_eq!(task_status(Some("uploading")), "PROCESSING");
        assert_eq!(task_status(Some("completed")), "SUCCESS");
        assert_eq!(task_status(Some("failed")), "FAILED");
        assert_eq!(task_status(None), "PROCESSING");
    }
}
