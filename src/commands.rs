use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::MediaToolkitExt;
use crate::Result;

#[command]
pub(crate) async fn get_media_info<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<MediaInfo> {
    app.media_toolkit().get_media_info(&path)
}

#[command]
pub(crate) async fn trim<R: Runtime>(
    app: AppHandle<R>,
    config: TrimConfig,
) -> Result<OperationResult> {
    app.media_toolkit().trim(config)
}

#[command]
pub(crate) async fn convert<R: Runtime>(
    app: AppHandle<R>,
    config: ConvertConfig,
) -> Result<OperationResult> {
    app.media_toolkit().convert(config)
}

#[command]
pub(crate) async fn extract_audio<R: Runtime>(
    app: AppHandle<R>,
    config: ExtractAudioConfig,
) -> Result<OperationResult> {
    app.media_toolkit().extract_audio(config)
}

#[command]
pub(crate) async fn play<R: Runtime>(app: AppHandle<R>, config: PlayConfig) -> Result<()> {
    app.media_toolkit().play(config)
}

#[command]
pub(crate) async fn pause<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.media_toolkit().pause()
}

#[command]
pub(crate) async fn resume<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.media_toolkit().resume()
}

#[command]
pub(crate) async fn stop<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.media_toolkit().stop()
}

#[command]
pub(crate) async fn seek<R: Runtime>(app: AppHandle<R>, config: SeekConfig) -> Result<()> {
    app.media_toolkit().seek(config)
}

#[command]
pub(crate) async fn get_playback_status<R: Runtime>(app: AppHandle<R>) -> Result<PlaybackStatus> {
    app.media_toolkit().get_playback_status()
}

#[command]
pub(crate) async fn set_volume<R: Runtime>(app: AppHandle<R>, volume: f32) -> Result<()> {
    app.media_toolkit().set_volume(volume)
}

#[command]
pub(crate) async fn select_media_file<R: Runtime>(
    app: AppHandle<R>,
) -> Result<crate::models::FileSelectionResult> {
    app.media_toolkit().select_media_file()
}

#[command]
pub(crate) async fn check_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<crate::models::PermissionResponse> {
    app.media_toolkit().check_permission()
}

#[command]
pub(crate) async fn request_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<crate::models::PermissionResponse> {
    app.media_toolkit().request_permission()
}

#[command]
pub(crate) async fn cleanup_cache<R: Runtime>(
    app: AppHandle<R>,
) -> Result<crate::models::CleanupResult> {
    app.media_toolkit().cleanup_cache()
}
