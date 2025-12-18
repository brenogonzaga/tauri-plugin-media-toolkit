const COMMANDS: &[&str] = &[
    "select_media_file",
    "get_media_info",
    "trim",
    "convert",
    "extract_audio",
    "play",
    "pause",
    "resume",
    "stop",
    "seek",
    "get_playback_status",
    "set_volume",
    "check_permission",
    "request_permission",
    "cleanup_cache",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
