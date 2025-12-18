use serde::{Deserialize, Serialize};

/// Media type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Audio,
    Video,
    Unknown,
}

/// Output format for conversion/trim
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Mp3,
    Mp4,
    Wav,
    Aac,
    M4a,
    Aiff,
    Caf,
    Webm,
    Ogg,
    Flac,
}

impl OutputFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            OutputFormat::Mp3 => "mp3",
            OutputFormat::Mp4 => "mp4",
            OutputFormat::Wav => "wav",
            OutputFormat::Aac => "aac",
            OutputFormat::M4a => "m4a",
            OutputFormat::Aiff => "aiff",
            OutputFormat::Caf => "caf",
            OutputFormat::Webm => "webm",
            OutputFormat::Ogg => "ogg",
            OutputFormat::Flac => "flac",
        }
    }
}

/// Audio quality preset
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AudioQuality {
    Low,
    #[default]
    Medium,
    High,
    Lossless,
}

impl AudioQuality {
    pub fn bitrate(&self) -> u32 {
        match self {
            AudioQuality::Low => 96_000,
            AudioQuality::Medium => 192_000,
            AudioQuality::High => 320_000,
            AudioQuality::Lossless => 0, // Use original
        }
    }
}

/// Video quality preset
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum VideoQuality {
    Low,
    #[default]
    Medium,
    High,
    Original,
}

/// Trim configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrimConfig {
    /// Input file path
    pub input_path: String,
    /// Output file path (without extension)
    pub output_path: String,
    /// Start time in milliseconds
    pub start_ms: u64,
    /// End time in milliseconds
    pub end_ms: u64,
    /// Output format (optional, defaults to same as input)
    pub format: Option<OutputFormat>,
    /// Audio quality (for audio output)
    pub audio_quality: Option<AudioQuality>,
    /// Video quality (for video output)
    pub video_quality: Option<VideoQuality>,
    /// Whether to preserve original quality (no re-encoding)
    #[serde(default)]
    pub preserve_quality: bool,
}

/// Convert configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertConfig {
    /// Input file path
    pub input_path: String,
    /// Output file path (without extension)
    pub output_path: String,
    /// Output format
    pub format: OutputFormat,
    /// Audio quality
    pub audio_quality: Option<AudioQuality>,
    /// Video quality
    pub video_quality: Option<VideoQuality>,
}

/// Extract audio configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractAudioConfig {
    /// Input video file path
    pub input_path: String,
    /// Output audio file path (without extension)
    pub output_path: String,
    /// Output format
    pub format: OutputFormat,
    /// Audio quality
    pub audio_quality: Option<AudioQuality>,
}

/// Media information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    /// File path
    pub path: String,
    /// Media type (audio/video)
    pub media_type: MediaType,
    /// Duration in milliseconds
    pub duration_ms: u64,
    /// File size in bytes
    pub file_size: u64,
    /// Format/container name
    pub format: String,
    /// Whether the file has audio stream
    pub has_audio: bool,
    /// Whether the file has video stream
    pub has_video: bool,
    /// Audio codec (if present)
    pub audio_codec: Option<String>,
    /// Video codec (if present)
    pub video_codec: Option<String>,
    /// Audio sample rate (if present)
    pub sample_rate: Option<u32>,
    /// Audio channels (if present)
    pub channels: Option<u32>,
    /// Audio bitrate in bps (if present)
    pub audio_bitrate: Option<u32>,
    /// Video width (if present)
    pub width: Option<u32>,
    /// Video height (if present)
    pub height: Option<u32>,
    /// Video frame rate (if present)
    pub frame_rate: Option<f64>,
    /// Video bitrate in bps (if present)
    pub video_bitrate: Option<u32>,
}

/// Operation result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    /// Whether the operation succeeded
    pub success: bool,
    /// Output file path
    pub output_path: String,
    /// Duration of output in milliseconds
    pub duration_ms: u64,
    /// File size in bytes
    pub file_size: u64,
    /// Warning message (e.g., format conversion on iOS)
    pub warning: Option<String>,
}

/// Playback state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackState {
    Idle,
    Playing,
    Paused,
    Stopped,
}

/// Playback status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStatus {
    /// Current state
    pub state: PlaybackState,
    /// Current position in milliseconds
    pub position_ms: u64,
    /// Total duration in milliseconds
    pub duration_ms: u64,
    /// Current volume (0.0 to 1.0)
    pub volume: f32,
    /// Currently playing file
    pub file_path: Option<String>,
}

/// Play configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayConfig {
    /// File path to play
    pub file_path: String,
    /// Start position in milliseconds (optional)
    pub start_ms: Option<u64>,
    /// Volume (0.0 to 1.0, default 1.0)
    pub volume: Option<f32>,
    /// Whether to loop
    #[serde(default)]
    pub loop_playback: bool,
}

/// Seek configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekConfig {
    /// Position to seek to in milliseconds
    pub position_ms: u64,
}

/// File selection result (Android only)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSelectionResult {
    /// Whether the selection succeeded
    pub success: bool,
    /// Path to the selected file (copied to cache on Android)
    pub file_path: String,
}

/// Permission status response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionResponse {
    /// Whether permission is granted
    pub granted: bool,
    /// Whether permission can be requested (not permanently denied)
    pub can_request: bool,
}

/// Cache cleanup result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    /// Whether cleanup succeeded
    pub success: bool,
    /// Number of files deleted
    pub files_deleted: u32,
    /// Bytes freed
    pub bytes_freed: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_type_serialization() {
        assert_eq!(
            serde_json::to_string(&MediaType::Audio).unwrap(),
            "\"audio\""
        );
        assert_eq!(
            serde_json::to_string(&MediaType::Video).unwrap(),
            "\"video\""
        );
        assert_eq!(
            serde_json::to_string(&MediaType::Unknown).unwrap(),
            "\"unknown\""
        );
    }

    #[test]
    fn test_media_type_deserialization() {
        assert_eq!(
            serde_json::from_str::<MediaType>("\"audio\"").unwrap(),
            MediaType::Audio
        );
        assert_eq!(
            serde_json::from_str::<MediaType>("\"video\"").unwrap(),
            MediaType::Video
        );
    }

    #[test]
    fn test_output_format_extension() {
        assert_eq!(OutputFormat::Mp3.extension(), "mp3");
        assert_eq!(OutputFormat::Mp4.extension(), "mp4");
        assert_eq!(OutputFormat::Wav.extension(), "wav");
        assert_eq!(OutputFormat::Flac.extension(), "flac");
    }

    #[test]
    fn test_audio_quality_bitrate() {
        assert_eq!(AudioQuality::Low.bitrate(), 96_000);
        assert_eq!(AudioQuality::Medium.bitrate(), 192_000);
        assert_eq!(AudioQuality::High.bitrate(), 320_000);
        assert_eq!(AudioQuality::Lossless.bitrate(), 0);
    }

    #[test]
    fn test_trim_config_deserialization() {
        let json = r#"{
            "inputPath": "/path/to/input.mp4",
            "outputPath": "/path/to/output",
            "startMs": 1000,
            "endMs": 5000
        }"#;

        let config: TrimConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.input_path, "/path/to/input.mp4");
        assert_eq!(config.output_path, "/path/to/output");
        assert_eq!(config.start_ms, 1000);
        assert_eq!(config.end_ms, 5000);
        assert!(config.format.is_none());
    }

    #[test]
    fn test_playback_state_serialization() {
        assert_eq!(
            serde_json::to_string(&PlaybackState::Playing).unwrap(),
            "\"playing\""
        );
        assert_eq!(
            serde_json::to_string(&PlaybackState::Paused).unwrap(),
            "\"paused\""
        );
    }
}
