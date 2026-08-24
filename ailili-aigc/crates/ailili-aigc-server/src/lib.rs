mod config;
mod download;
mod fake;
mod retry;
mod size;
mod status;
mod text;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
};

use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use gpt_image_2_core::{show_history_job, EditRequest};
use gpt_image_2_runtime::{
    chrono_like_now, enqueue_job, job_snapshot, persist_job, unique_job_dir, JobQueueInner,
    JobSnapshotInput, QueueRuntimeHooks, QueuedJob, QueuedTask,
};
use serde::Deserialize;
use serde_json::{json, Value};

pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_PORT: u16 = 8788;
pub const DEFAULT_LISTEN: &str = "http://127.0.0.1:8788";
pub const LOCAL_MAX_PARALLEL: usize = 10;

pub const COMPAT_ROUTES: &[&str] = &[
    "POST /aigc/imageGenAsync",
    "POST /aigc/taskQuery",
    "POST /aigc/textGenAsync",
    "POST /aigc/textTaskQuery",
    "GET /health",
    "GET /aigc/jobs/{id}/outputs/{index}",
];

pub use config::{bind_runtime_paths, config_path, data_home};
pub use retry::{is_transient, retry};

pub trait JobRunner: Clone + Send + Sync + 'static {
    fn run_edit(&self, request: EditRequest, job_id: String, dir: PathBuf) -> Result<Value, Value>;
    fn run_text(&self, request: text::TextRequest, job_id: String) -> Result<Value, Value>;
}

#[derive(Clone, Default)]
pub struct GptImage2Runner;

impl JobRunner for GptImage2Runner {
    fn run_edit(&self, request: EditRequest, job_id: String, dir: PathBuf) -> Result<Value, Value> {
        gpt_image_2_runtime::run_edit_request(
            request,
            job_id,
            dir,
            false,
            "none".to_string(),
            |_, _| {},
        )
    }

    fn run_text(&self, request: text::TextRequest, job_id: String) -> Result<Value, Value> {
        text::complete(&request)
            .map(|mut payload| {
                payload["job_id"] = json!(job_id);
                payload
            })
            .map_err(|message| json!({ "message": message }))
    }
}

#[derive(Clone)]
pub struct AppState<R> {
    inner: Arc<Mutex<JobQueueInner>>,
    runner: R,
}

impl<R: JobRunner> AppState<R> {
    pub fn new(runner: R) -> Self {
        let mut inner = JobQueueInner::default();
        inner.max_parallel = LOCAL_MAX_PARALLEL;
        Self {
            inner: Arc::new(Mutex::new(inner)),
            runner,
        }
    }
}

impl AppState<GptImage2Runner> {
    pub fn gpt_image2() -> Self {
        Self::new(GptImage2Runner)
    }
}

impl<R: JobRunner> QueueRuntimeHooks for AppState<R> {
    fn emit_queue_event(&self, _job_id: &str, _event: &Value) {}

    fn run_queued_task(
        &self,
        _inner: Arc<Mutex<JobQueueInner>>,
        queued: QueuedJob,
    ) -> Result<Value, Value> {
        match queued.task {
            QueuedTask::Edit(request) => self.runner.run_edit(request, queued.id, queued.dir),
            QueuedTask::Generate(_) => Err(json!({
                "message": "text-to-image generate is not used for imageGenAsync"
            })),
        }
    }

    fn upload_completed_job_outputs(&self, job: &Value) -> Result<Value, String> {
        persist_job(job)?;
        Ok(job.clone())
    }

    fn dispatch_notifications_for_job(&self, _job: &Value) -> Vec<Value> {
        Vec::new()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageGenBody {
    prompt: String,
    #[serde(default)]
    image_urls: Vec<String>,
    #[serde(default)]
    output_num: Option<u8>,
    #[serde(default)]
    resolution: Option<String>,
    #[serde(default)]
    aspect_ratio: Option<String>,
    #[serde(default)]
    quality: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TaskQueryBody {
    #[serde(rename = "taskId")]
    task_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextGenBody {
    prompt: String,
    #[serde(default)]
    image_urls: Vec<String>,
}

pub fn router<R: JobRunner>(state: AppState<R>) -> Router {
    config::bind_runtime_paths();
    Router::new()
        .route("/health", get(health))
        .route("/aigc/imageGenAsync", post(image_gen_async::<R>))
        .route("/aigc/taskQuery", post(task_query))
        .route("/aigc/textGenAsync", post(text_gen_async::<R>))
        .route("/aigc/textTaskQuery", post(text_task_query))
        .route("/aigc/jobs/{job_id}/outputs/{index}", get(job_output))
        .with_state(state)
}

pub fn run_api_only(host: String, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    config::bind_runtime_paths();
    let fake = fake::enabled();
    if fake {
        eprintln!("ailili-aigc: AILILI_AIGC_FAKE_IMAGE is on; image jobs return a stub PNG.");
    }
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    rt.block_on(async move {
        let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
        eprintln!("ailili-aigc daemon listening on http://{host}:{port}");
        if fake {
            axum::serve(listener, router(AppState::new(fake::FakeRunner))).await?;
        } else {
            axum::serve(listener, router(AppState::gpt_image2())).await?;
        }
        Ok::<(), std::io::Error>(())
    })?;
    Ok(())
}

async fn health() -> Json<Value> {
    Json(json!({
        "ok": true,
        "service": "ailili-aigc",
        "version": env!("CARGO_PKG_VERSION"),
        "config": config::config_path().display().to_string(),
    }))
}

async fn image_gen_async<R: JobRunner>(
    State(state): State<AppState<R>>,
    Json(body): Json<ImageGenBody>,
) -> impl IntoResponse {
    match tokio::task::spawn_blocking(move || enqueue_image_job(&state, body)).await {
        Ok(Ok(task_id)) => (StatusCode::OK, Json(json!({ "taskId": task_id }))).into_response(),
        Ok(Err(message)) => (
            StatusCode::OK,
            Json(json!({
                "errcode": 400,
                "errmsg": message,
                "error": message,
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::OK,
            Json(json!({
                "errcode": 500,
                "errmsg": error.to_string(),
                "error": error.to_string(),
            })),
        )
            .into_response(),
    }
}

fn enqueue_image_job<R: JobRunner>(
    state: &AppState<R>,
    body: ImageGenBody,
) -> Result<String, String> {
    let prompt = decode_nl(body.prompt.trim());
    if prompt.is_empty() {
        return Err("prompt is required".to_string());
    }
    let urls: Vec<String> = body
        .image_urls
        .into_iter()
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty())
        .collect();
    let refs = download::fetch_refs(&urls)?;
    let output_num = body.output_num.unwrap_or(1).clamp(1, 10);
    let resolution = body.resolution.unwrap_or_else(|| "2K".to_string());
    let aspect_ratio = body.aspect_ratio.unwrap_or_else(|| "1:1".to_string());
    let size = size::map_image_size(&resolution, &aspect_ratio)?;
    let provider = config::resolve_image_provider_name()?;
    let request = EditRequest {
        prompt,
        provider: provider.clone(),
        size: Some(size),
        format: Some("png".to_string()),
        quality: body.quality.filter(|value| !value.trim().is_empty()),
        background: None,
        n: Some(output_num),
        compression: None,
        input_fidelity: None,
        moderation: None,
        storage_targets: None,
        fallback_targets: None,
        refs,
        mask: None,
        selection_hint: None,
    };
    let (id, dir) =
        unique_job_dir(config::jobs_dir(), "ailili").map_err(|error| error.to_string())?;
    let queued = QueuedJob {
        id: id.clone(),
        command: "images edit".to_string(),
        provider: provider.unwrap_or_else(|| "auto".to_string()),
        created_at: chrono_like_now(),
        dir,
        metadata: json!({ "source": "imageGenAsync" }),
        task: QueuedTask::Edit(request),
    };
    enqueue_job(state.inner.clone(), state.clone(), queued)?;
    Ok(id)
}

async fn task_query(headers: HeaderMap, Json(body): Json<TaskQueryBody>) -> impl IntoResponse {
    let task_id = body.task_id.trim();
    if task_id.is_empty() {
        return (
            StatusCode::OK,
            Json(json!({
                "errcode": 400,
                "errmsg": "taskId is required",
                "error": "taskId is required",
            })),
        )
            .into_response();
    }
    match show_history_job(task_id) {
        Ok(job) => {
            let status = status::task_status(job.get("status").and_then(Value::as_str));
            let mut result_list = Value::Null;
            let mut error_msg = Value::Null;
            if status == "SUCCESS" {
                result_list = json!(output_urls(task_id, &job, &headers));
            } else if status == "FAILED" {
                error_msg = job
                    .get("error")
                    .cloned()
                    .filter(|value| !value.is_null())
                    .map(|value| {
                        value
                            .get("message")
                            .and_then(Value::as_str)
                            .map(|message| json!(message))
                            .unwrap_or(value)
                    })
                    .unwrap_or_else(|| json!("生成失败"));
            }
            (
                StatusCode::OK,
                Json(json!({
                    "taskId": task_id,
                    "status": status,
                    "resultList": result_list,
                    "errorMsg": error_msg,
                })),
            )
                .into_response()
        }
        Err(_) => (
            StatusCode::OK,
            Json(json!({
                "taskId": task_id,
                "status": "FAILED",
                "resultList": Value::Null,
                "errorMsg": "任务不存在",
                "errcode": 10009,
            })),
        )
            .into_response(),
    }
}

async fn text_gen_async<R: JobRunner>(
    State(state): State<AppState<R>>,
    Json(body): Json<TextGenBody>,
) -> impl IntoResponse {
    match tokio::task::spawn_blocking(move || enqueue_text_job(&state, body)).await {
        Ok(Ok(task_id)) => (StatusCode::OK, Json(json!({ "taskId": task_id }))).into_response(),
        Ok(Err(message)) => (
            StatusCode::OK,
            Json(json!({
                "errcode": 400,
                "errmsg": message,
                "error": message,
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::OK,
            Json(json!({
                "errcode": 500,
                "errmsg": error.to_string(),
                "error": error.to_string(),
            })),
        )
            .into_response(),
    }
}

fn enqueue_text_job<R: JobRunner>(
    state: &AppState<R>,
    body: TextGenBody,
) -> Result<String, String> {
    let prompt = decode_nl(body.prompt.trim());
    if prompt.is_empty() {
        return Err("prompt is required".to_string());
    }
    let image_urls: Vec<String> = body
        .image_urls
        .into_iter()
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty())
        .collect();
    let (id, _dir) =
        unique_job_dir(config::jobs_dir(), "ailili-text").map_err(|error| error.to_string())?;
    let created_at = chrono_like_now();
    persist_text_job(
        &id,
        &created_at,
        "queued",
        json!({ "source": "textGenAsync", "prompt": prompt }),
        Value::Null,
    )?;
    let runner = state.runner.clone();
    let job_id = id.clone();
    let request = text::TextRequest {
        prompt: prompt.clone(),
        image_urls,
    };
    thread::spawn(move || {
        let _ = persist_text_job(
            &job_id,
            &created_at,
            "running",
            json!({ "source": "textGenAsync", "prompt": prompt }),
            Value::Null,
        );
        match runner.run_text(request, job_id.clone()) {
            Ok(payload) => {
                let metadata = json!({
                    "source": "textGenAsync",
                    "prompt": prompt,
                    "content": payload.get("content").cloned().unwrap_or(Value::Null),
                    "promptTokens": payload.get("promptTokens").cloned().unwrap_or(json!(0)),
                    "completionTokens": payload.get("completionTokens").cloned().unwrap_or(json!(0)),
                    "totalTokens": payload.get("totalTokens").cloned().unwrap_or(json!(0)),
                    "provider": payload.get("provider").cloned().unwrap_or(Value::Null),
                    "model": payload.get("model").cloned().unwrap_or(Value::Null),
                });
                let _ = persist_text_job(&job_id, &created_at, "completed", metadata, Value::Null);
            }
            Err(error) => {
                let message = error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("text generation failed");
                let _ = persist_text_job(
                    &job_id,
                    &created_at,
                    "failed",
                    json!({ "source": "textGenAsync", "prompt": prompt, "error": error }),
                    json!({ "message": message }),
                );
            }
        }
    });
    Ok(id)
}

fn persist_text_job(
    id: &str,
    created_at: &str,
    status: &str,
    metadata: Value,
    error: Value,
) -> Result<(), String> {
    let provider = metadata
        .get("provider")
        .and_then(Value::as_str)
        .unwrap_or("auto")
        .to_string();
    persist_job(&job_snapshot(JobSnapshotInput {
        id,
        command: "textgen",
        provider: &provider,
        status,
        created_at,
        metadata,
        output_path: None,
        outputs: json!([]),
        error,
    }))
}

async fn text_task_query(Json(body): Json<TaskQueryBody>) -> impl IntoResponse {
    let task_id = body.task_id.trim();
    if task_id.is_empty() {
        return (
            StatusCode::OK,
            Json(json!({
                "errcode": 400,
                "errmsg": "taskId is required",
                "error": "taskId is required",
            })),
        )
            .into_response();
    }
    match show_history_job(task_id) {
        Ok(job) => {
            let status = status::task_status(job.get("status").and_then(Value::as_str));
            let metadata = job.get("metadata").cloned().unwrap_or(Value::Null);
            let content = metadata
                .get("content")
                .cloned()
                .or_else(|| metadata.pointer("/output/content").cloned())
                .unwrap_or(Value::Null);
            let mut body = json!({
                "taskId": task_id,
                "status": status,
            });
            if status == "SUCCESS" {
                body["content"] = content;
                body["promptTokens"] = metadata.get("promptTokens").cloned().unwrap_or(json!(0));
                body["completionTokens"] = metadata
                    .get("completionTokens")
                    .cloned()
                    .unwrap_or(json!(0));
                body["totalTokens"] = metadata.get("totalTokens").cloned().unwrap_or(json!(0));
            } else if status == "FAILED" {
                body["content"] = Value::Null;
                body["errorMsg"] = job
                    .get("error")
                    .and_then(|error| error.get("message"))
                    .cloned()
                    .unwrap_or_else(|| json!("生成失败"));
            }
            (StatusCode::OK, Json(body)).into_response()
        }
        Err(_) => (
            StatusCode::OK,
            Json(json!({
                "taskId": task_id,
                "status": "FAILED",
                "content": Value::Null,
                "errorMsg": "任务不存在",
                "errcode": 10009,
            })),
        )
            .into_response(),
    }
}

async fn job_output(Path((job_id, index)): Path<(String, usize)>) -> Response {
    let job = match show_history_job(&job_id) {
        Ok(job) => job,
        Err(_) => {
            return (StatusCode::NOT_FOUND, "job not found").into_response();
        }
    };
    let Some(path) = output_path_at(&job, index) else {
        return (StatusCode::NOT_FOUND, "output not found").into_response();
    };
    match tokio::fs::read(&path).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            let file_name = std::path::Path::new(&path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("out.png");
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime.as_ref())
                .header(
                    header::CONTENT_DISPOSITION,
                    format!("inline; filename=\"{file_name}\""),
                )
                .body(axum::body::Body::from(bytes))
                .unwrap_or_else(|_| (StatusCode::INTERNAL_SERVER_ERROR, "response").into_response())
        }
        Err(_) => (StatusCode::NOT_FOUND, "file missing").into_response(),
    }
}

fn output_path_at(job: &Value, index: usize) -> Option<String> {
    job.get("outputs")
        .and_then(Value::as_array)
        .and_then(|outputs| {
            outputs.iter().find_map(|item| {
                let item_index = item.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                if item_index == index {
                    item.get("path").and_then(Value::as_str).map(str::to_string)
                } else {
                    None
                }
            })
        })
        .or_else(|| {
            if index == 0 {
                job.get("output_path")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            } else {
                None
            }
        })
}

fn output_urls(task_id: &str, job: &Value, headers: &HeaderMap) -> Vec<Value> {
    let host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("127.0.0.1:8788");
    let scheme = if host.starts_with("127.0.0.1") || host.starts_with("localhost") {
        "http"
    } else {
        "http"
    };
    let mut urls = Vec::new();
    if let Some(outputs) = job.get("outputs").and_then(Value::as_array) {
        for (fallback, item) in outputs.iter().enumerate() {
            let index = item
                .get("index")
                .and_then(Value::as_u64)
                .unwrap_or(fallback as u64);
            urls.push(json!({
                "id": format!("{task_id}-{index}"),
                "url": format!("{scheme}://{host}/aigc/jobs/{task_id}/outputs/{index}"),
                "type": "image",
            }));
        }
    } else if job.get("output_path").and_then(Value::as_str).is_some() {
        urls.push(json!({
            "id": format!("{task_id}-0"),
            "url": format!("{scheme}://{host}/aigc/jobs/{task_id}/outputs/0"),
            "type": "image",
        }));
    }
    urls
}

fn decode_nl(text: &str) -> String {
    text.replace('⏎', "\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ENV_LOCK;
    use crate::fake::{FakeRunner, TINY_PNG};
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn data_png_url() -> String {
        format!(
            "data:image/png;base64,{}",
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, TINY_PNG)
        )
    }

    async fn body_json(response: Response) -> Value {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn imagegen_async_enqueue_and_query() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEX_HOME", tmp.path());
        std::env::set_var("AILILI_AIGC_HOME", tmp.path().join("ailili"));

        let app = router(AppState::new(FakeRunner));
        let create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/aigc/imageGenAsync")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "prompt": "product on white background",
                            "imageUrls": [data_png_url()],
                            "outputNum": 1,
                            "resolution": "1K",
                            "aspectRatio": "1:1",
                            "quality": "high"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create.status(), StatusCode::OK);
        let created = body_json(create).await;
        let task_id = created
            .get("taskId")
            .and_then(Value::as_str)
            .unwrap()
            .to_string();

        let mut status = String::new();
        let mut query_body = json!({});
        for _ in 0..40 {
            let query = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/aigc/taskQuery")
                        .header("content-type", "application/json")
                        .header("host", "127.0.0.1:8788")
                        .body(Body::from(json!({ "taskId": task_id }).to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            query_body = body_json(query).await;
            status = query_body
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if status == "SUCCESS" || status == "FAILED" {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert_eq!(status, "SUCCESS", "{query_body}");
        let url = query_body["resultList"][0]["url"].as_str().unwrap();
        assert!(url.contains("/aigc/jobs/"));
        assert!(url.contains("/outputs/0"));

        let file = app
            .oneshot(
                Request::builder()
                    .uri(url.trim_start_matches("http://127.0.0.1:8788"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(file.status(), StatusCode::OK);
        let bytes = file.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&bytes[..8], &TINY_PNG[..8]);
    }

    #[tokio::test]
    async fn imagegen_async_accepts_local_file() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEX_HOME", tmp.path());
        std::env::set_var("AILILI_AIGC_HOME", tmp.path().join("ailili"));
        let image = tmp.path().join("ref.png");
        std::fs::write(&image, TINY_PNG).unwrap();

        let app = router(AppState::new(FakeRunner));
        let create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/aigc/imageGenAsync")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "prompt": "product on white background",
                            "imageUrls": [image.display().to_string()],
                            "outputNum": 1,
                            "resolution": "1K",
                            "aspectRatio": "1:1",
                            "quality": "high"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create.status(), StatusCode::OK);
        let created = body_json(create).await;
        assert!(
            created.get("taskId").and_then(Value::as_str).is_some(),
            "{created}"
        );
    }

    #[tokio::test]
    async fn imagegen_async_rejects_empty_urls() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEX_HOME", tmp.path());
        let app = router(AppState::new(FakeRunner));
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/aigc/imageGenAsync")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "prompt": "x",
                            "imageUrls": [],
                            "outputNum": 1,
                            "resolution": "1K",
                            "aspectRatio": "1:1"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = body_json(response).await;
        assert!(body.get("taskId").is_none());
        assert_eq!(body.get("errcode").and_then(Value::as_u64), Some(400));
    }

    #[tokio::test]
    async fn textgen_async_enqueue_and_query() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEX_HOME", tmp.path());
        std::env::set_var("AILILI_AIGC_HOME", tmp.path().join("ailili"));

        let app = router(AppState::new(FakeRunner));
        let create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/aigc/textGenAsync")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "prompt": "Write a product title",
                            "imageUrls": [],
                            "thinkingLevel": "minimal"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create.status(), StatusCode::OK);
        let created = body_json(create).await;
        let task_id = created
            .get("taskId")
            .and_then(Value::as_str)
            .unwrap()
            .to_string();

        let mut query_body = json!({});
        let mut status = String::new();
        for _ in 0..40 {
            let query = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/aigc/textTaskQuery")
                        .header("content-type", "application/json")
                        .body(Body::from(json!({ "taskId": task_id }).to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            query_body = body_json(query).await;
            status = query_body
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if status == "SUCCESS" || status == "FAILED" {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert_eq!(status, "SUCCESS", "{query_body}");
        assert_eq!(
            query_body.get("content").and_then(Value::as_str),
            Some("fake text: Write a product title")
        );
    }

    #[tokio::test]
    async fn textgen_async_rejects_empty_prompt() {
        let _guard = ENV_LOCK.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEX_HOME", tmp.path());
        let app = router(AppState::new(FakeRunner));
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/aigc/textGenAsync")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({ "prompt": "  ", "imageUrls": [] }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = body_json(response).await;
        assert!(body.get("taskId").is_none());
        assert_eq!(body.get("errcode").and_then(Value::as_u64), Some(400));
    }
}
