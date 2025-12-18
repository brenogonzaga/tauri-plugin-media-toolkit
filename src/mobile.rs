use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::error::{Error, Result};
use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_media_editor);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<MediaEditor<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("io.affex.media_editor", "MediaEditorPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_media_editor)?;
    Ok(MediaEditor(handle))
}

/// Access to the media-editor APIs.
pub struct MediaEditor<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> MediaEditor<R> {
    pub fn get_media_info(&self, path: &str) -> Result<MediaInfo> {
        self.0
            .run_mobile_plugin("getMediaInfo", serde_json::json!({ "filePath": path }))
            .map_err(Into::into)
    }

    pub fn trim(&self, config: TrimConfig) -> Result<OperationResult> {
        self.0.run_mobile_plugin("trim", config).map_err(Into::into)
    }

    pub fn convert(&self, config: ConvertConfig) -> Result<OperationResult> {
        self.0
            .run_mobile_plugin("convert", config)
            .map_err(Into::into)
    }

    pub fn extract_audio(&self, config: ExtractAudioConfig) -> Result<OperationResult> {
        self.0
            .run_mobile_plugin("extractAudio", config)
            .map_err(Into::into)
    }

    pub fn play(&self, config: PlayConfig) -> Result<()> {
        self.0.run_mobile_plugin("play", config).map_err(Into::into)
    }

    pub fn pause(&self) -> Result<()> {
        self.0
            .run_mobile_plugin("pause", serde_json::json!({}))
            .map_err(Into::into)
    }

    pub fn resume(&self) -> Result<()> {
        self.0
            .run_mobile_plugin("resume", serde_json::json!({}))
            .map_err(Into::into)
    }

    pub fn stop(&self) -> Result<()> {
        self.0
            .run_mobile_plugin("stop", serde_json::json!({}))
            .map_err(Into::into)
    }

    pub fn seek(&self, config: SeekConfig) -> Result<()> {
        self.0.run_mobile_plugin("seek", config).map_err(Into::into)
    }

    pub fn get_playback_status(&self) -> Result<PlaybackStatus> {
        self.0
            .run_mobile_plugin("getPlaybackStatus", serde_json::json!({}))
            .map_err(Into::into)
    }

    pub fn set_volume(&self, volume: f32) -> Result<()> {
        self.0
            .run_mobile_plugin("setVolume", serde_json::json!({ "volume": volume }))
            .map_err(Into::into)
    }

    pub fn select_media_file(&self) -> Result<FileSelectionResult> {
        self.0
            .run_mobile_plugin("selectMediaFile", serde_json::json!({}))
            .map_err(Into::into)
    }

    pub fn check_permission(&self) -> Result<PermissionResponse> {
        self.0
            .run_mobile_plugin("checkPermission", serde_json::json!({}))
            .map_err(Into::into)
    }

    pub fn request_permission(&self) -> Result<PermissionResponse> {
        self.0
            .run_mobile_plugin("requestPermission", serde_json::json!({}))
            .map_err(Into::into)
    }

    pub fn cleanup_cache(&self) -> Result<CleanupResult> {
        self.0
            .run_mobile_plugin("cleanupCache", serde_json::json!({}))
            .map_err(Into::into)
    }
}

// Allow Error to be dead_code for now since it's not used in mobile bridge
#[allow(dead_code)]
fn _not_implemented() -> Error {
    Error::NotImplemented
}
