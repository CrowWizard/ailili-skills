mod daemon;
mod gateway;
mod imagegen;
mod nl;
mod session;
mod textgen;

use serde_json::json;

pub fn run(argv: &[String]) -> i32 {
    let cmd = argv
        .iter()
        .skip(1)
        .find(|arg| !arg.starts_with('-'))
        .map(String::as_str)
        .unwrap_or("help");

    match cmd {
        "help" | "-h" | "--help" => {
            eprint_help();
            0
        }
        "daemon" => daemon::dispatch(argv),
        "imagegen" => imagegen::dispatch(argv),
        "textgen" => textgen::dispatch(argv),
        "version" | "--version" | "-V" => {
            println!("{}", env!("CARGO_PKG_VERSION"));
            0
        }
        other => {
            let payload = json!({
                "ok": false,
                "error": {
                    "code": "invalid_command",
                    "message": format!("Unknown command {other:?}"),
                    "detail": { "usage": "ailili-aigc daemon|imagegen|textgen" }
                }
            });
            println!(
                "{}",
                serde_json::to_string_pretty(&payload).unwrap_or_default()
            );
            2
        }
    }
}

fn eprint_help() {
    eprintln!(
        "ailili-aigc {}\n\n\
         Local AIGC gateway + skill clients.\n\n\
         Usage:\n  \
           ailili-aigc daemon start|stop|status|foreground\n  \
           ailili-aigc imagegen '<JSON>'\n  \
           ailili-aigc textgen --stdin [--content-only]\n\n\
         Gateway: AILILI_TOOL_GATEWAY (default http://127.0.0.1:8788)\n",
        env!("CARGO_PKG_VERSION")
    );
}
