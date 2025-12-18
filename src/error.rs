use serde::{ser::Serializer, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Insufficient storage: required {required} bytes, available {available} bytes")]
    InsufficientStorage { required: u64, available: u64 },

    #[error("Unsupported codec: {0}")]
    UnsupportedCodec(String),

    #[error("Invalid time range: start {0}ms, end {1}ms, duration {2}ms")]
    InvalidTimeRange(u64, u64, u64),

    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),

    #[error("FFmpeg error: {0}")]
    FFmpegError(String),

    #[error("Playback error: {0}")]
    PlaybackError(String),

    #[error("Export failed: {0}")]
    ExportFailed(String),

    #[error("No audio track found")]
    NoAudioTrack,

    #[error("No video track found")]
    NoVideoTrack,

    #[error("No media loaded")]
    NoMediaLoaded,

    #[error("Operation cancelled")]
    Cancelled,

    #[error("Not implemented on this platform")]
    NotImplemented,

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[cfg(mobile)]
    #[error(transparent)]
    PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
