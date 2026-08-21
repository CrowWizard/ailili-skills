pub fn linkfox_status(internal: Option<&str>) -> &'static str {
    match internal {
        Some("completed") => "SUCCESS",
        Some("failed") | Some("canceled") | Some("cancelled") => "FAILED",
        _ => "PROCESSING",
    }
}

#[cfg(test)]
mod tests {
    use super::linkfox_status;

    #[test]
    fn maps_queue_status() {
        assert_eq!(linkfox_status(Some("queued")), "PROCESSING");
        assert_eq!(linkfox_status(Some("running")), "PROCESSING");
        assert_eq!(linkfox_status(Some("uploading")), "PROCESSING");
        assert_eq!(linkfox_status(Some("completed")), "SUCCESS");
        assert_eq!(linkfox_status(Some("failed")), "FAILED");
        assert_eq!(linkfox_status(None), "PROCESSING");
    }
}
