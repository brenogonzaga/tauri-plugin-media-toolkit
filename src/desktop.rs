use serde::de::DeserializeOwned;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::error::{Error, Result};
use crate::models::*;

/// Cache for FFmpeg availability check
static FFMPEG_AVAILABLE: OnceLock<bool> = OnceLock::new();

/// Check if FFmpeg is installed and available
fn check_ffmpeg_available() -> bool {
    *FFMPEG_AVAILABLE.get_or_init(|| {
        let ffmpeg_ok = Command::new("ffmpeg")
            .arg("-version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        let ffprobe_ok = Command::new("ffprobe")
            .arg("-version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        let available = ffmpeg_ok && ffprobe_ok;
        if available {
            log::info!("FFmpeg and ffprobe are available");
        } else {
            log::warn!(
                "FFmpeg or ffprobe not found. Media editing features will not work on desktop."
            );
        }
        available
    })
}

/// Ensure FFmpeg is available before running operations
fn ensure_ffmpeg() -> Result<()> {
    if !check_ffmpeg_available() {
        return Err(Error::FFmpegError(
            "FFmpeg is not installed. Please install FFmpeg to use media editing features on desktop.".to_string()
        ));
    }
    Ok(())
}

pub struct MediaEditor<R: Runtime> {
    #[allow(dead_code)]
    app: AppHandle<R>,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<MediaEditor<R>> {
    // Check FFmpeg on init (logs warning if not found)
    check_ffmpeg_available();
    Ok(MediaEditor { app: app.clone() })
}

impl<R: Runtime> MediaEditor<R> {
    /// Get media information using ffprobe
    pub fn get_media_info(&self, path: &str) -> Result<MediaInfo> {
        ensure_ffmpeg()?;

        let path = Path::new(path);
        if !path.exists() {
            return Err(Error::FileNotFound(path.display().to_string()));
        }

        let file_size = fs::metadata(path)?.len();

        // Use ffprobe to get media info
        let output = Command::new("ffprobe")
            .args([
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                path.to_str().unwrap_or(""),
            ])
            .output()
            .map_err(|e| {
                Error::FFmpegError(format!(
                    "Failed to run ffprobe: {}. Make sure ffmpeg is installed.",
                    e
                ))
            })?;

        if !output.status.success() {
            return Err(Error::FFmpegError("ffprobe failed".to_string()));
        }

        let json: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| Error::FFmpegError(e.to_string()))?;

        // Parse duration
        let duration_ms = json["format"]["duration"]
            .as_str()
            .and_then(|d| d.parse::<f64>().ok())
            .map(|d| (d * 1000.0) as u64)
            .unwrap_or(0);

        let format = json["format"]["format_name"]
            .as_str()
            .unwrap_or("unknown")
            .split(',')
            .next()
            .unwrap_or("unknown")
            .to_string();

        let mut media_type = MediaType::Unknown;
        let mut audio_codec = None;
        let mut video_codec = None;
        let mut sample_rate = None;
        let mut channels = None;
        let mut audio_bitrate = None;
        let mut width = None;
        let mut height = None;
        let mut frame_rate = None;
        let mut video_bitrate = None;
        let mut has_audio = false;
        let mut has_video = false;

        if let Some(streams) = json["streams"].as_array() {
            for stream in streams {
                let codec_type = stream["codec_type"].as_str().unwrap_or("");

                match codec_type {
                    "audio" => {
                        has_audio = true;
                        if media_type == MediaType::Unknown {
                            media_type = MediaType::Audio;
                        }
                        audio_codec = stream["codec_name"].as_str().map(String::from);
                        sample_rate = stream["sample_rate"].as_str().and_then(|s| s.parse().ok());
                        channels = stream["channels"].as_u64().map(|c| c as u32);
                        audio_bitrate = stream["bit_rate"].as_str().and_then(|s| s.parse().ok());
                    }
                    "video" => {
                        has_video = true;
                        media_type = MediaType::Video;
                        video_codec = stream["codec_name"].as_str().map(String::from);
                        width = stream["width"].as_u64().map(|w| w as u32);
                        height = stream["height"].as_u64().map(|h| h as u32);
                        video_bitrate = stream["bit_rate"].as_str().and_then(|s| s.parse().ok());

                        // Parse frame rate from "30/1" format
                        if let Some(fr) = stream["r_frame_rate"].as_str() {
                            let parts: Vec<&str> = fr.split('/').collect();
                            if parts.len() == 2 {
                                if let (Ok(num), Ok(den)) =
                                    (parts[0].parse::<f64>(), parts[1].parse::<f64>())
                                {
                                    if den > 0.0 {
                                        frame_rate = Some(num / den);
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        Ok(MediaInfo {
            path: path.display().to_string(),
            media_type,
            duration_ms,
            file_size,
            format,
            has_audio,
            has_video,
            audio_codec,
            video_codec,
            sample_rate,
            channels,
            audio_bitrate,
            width,
            height,
            frame_rate,
            video_bitrate,
        })
    }

    /// Trim media file
    pub fn trim(&self, config: TrimConfig) -> Result<OperationResult> {
        let input_path = Path::new(&config.input_path);
        if !input_path.exists() {
            return Err(Error::FileNotFound(config.input_path.clone()));
        }

        // Get input info
        let info = self.get_media_info(&config.input_path)?;

        // Validate time range
        if config.start_ms >= config.end_ms {
            return Err(Error::InvalidTimeRange(
                config.start_ms,
                config.end_ms,
                info.duration_ms,
            ));
        }
        if config.end_ms > info.duration_ms {
            return Err(Error::InvalidTimeRange(
                config.start_ms,
                config.end_ms,
                info.duration_ms,
            ));
        }

        // Determine output format
        let format = config.format.unwrap_or_else(|| {
            match input_path.extension().and_then(|e| e.to_str()) {
                Some("mp3") => OutputFormat::Mp3,
                Some("mp4") | Some("m4v") => OutputFormat::Mp4,
                Some("wav") => OutputFormat::Wav,
                Some("aac") => OutputFormat::Aac,
                Some("m4a") => OutputFormat::M4a,
                Some("webm") => OutputFormat::Webm,
                Some("ogg") => OutputFormat::Ogg,
                Some("flac") => OutputFormat::Flac,
                _ => OutputFormat::Mp4,
            }
        });

        // Check if trying to convert to audio format without audio stream
        let is_audio_format = matches!(
            format,
            OutputFormat::Mp3
                | OutputFormat::Wav
                | OutputFormat::Aac
                | OutputFormat::M4a
                | OutputFormat::Ogg
                | OutputFormat::Flac
        );
        if is_audio_format && !info.has_audio {
            return Err(Error::FFmpegError(
                "Cannot convert to audio format: source file has no audio stream".to_string(),
            ));
        }

        // Build output path - avoid double extension
        let output_path_str = &config.output_path;
        let expected_ext = format.extension();
        let output_path = if output_path_str.ends_with(&format!(".{}", expected_ext)) {
            output_path_str.clone()
        } else {
            format!("{}.{}", output_path_str, expected_ext)
        };

        // Use ffmpeg CLI for trimming
        let start_sec = config.start_ms as f64 / 1000.0;
        let duration_sec = (config.end_ms - config.start_ms) as f64 / 1000.0;

        let mut cmd = Command::new("ffmpeg");
        cmd.args([
            "-y",
            "-ss",
            &format!("{:.3}", start_sec),
            "-i",
            &config.input_path,
            "-t",
            &format!("{:.3}", duration_sec),
        ]);

        // If output is audio-only format, remove video stream
        if is_audio_format {
            cmd.arg("-vn");
        }

        // Determine codec options
        // Note: Cannot use -c copy when:
        // 1. Converting from video to audio-only format
        // 2. Output format requires different codec (e.g., AAC source -> MP3 output)
        let can_stream_copy =
            config.preserve_quality && !is_audio_format && info.media_type == MediaType::Video;

        if can_stream_copy {
            cmd.args(["-c", "copy"]);
        } else {
            // Audio encoding settings
            let audio_quality = config.audio_quality.unwrap_or_default();
            let audio_bitrate = audio_quality.bitrate();

            // Set explicit audio codec based on output format
            match format {
                OutputFormat::Mp3 => {
                    cmd.args(["-c:a", "libmp3lame"]);
                    if audio_bitrate > 0 {
                        cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                    } else {
                        cmd.args(["-b:a", "192k"]); // Default MP3 bitrate
                    }
                }
                OutputFormat::Aac | OutputFormat::M4a => {
                    cmd.args(["-c:a", "aac"]);
                    if audio_bitrate > 0 {
                        cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                    }
                }
                OutputFormat::Wav => {
                    cmd.args(["-c:a", "pcm_s16le"]);
                }
                OutputFormat::Aiff => {
                    cmd.args(["-c:a", "pcm_s16be"]);
                }
                OutputFormat::Caf => {
                    cmd.args(["-c:a", "pcm_s16le"]);
                }
                OutputFormat::Flac => {
                    cmd.args(["-c:a", "flac"]);
                }
                OutputFormat::Ogg => {
                    cmd.args(["-c:a", "libvorbis"]);
                    if audio_bitrate > 0 {
                        cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                    }
                }
                OutputFormat::Webm => {
                    cmd.args(["-c:a", "libopus"]);
                    if audio_bitrate > 0 {
                        cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                    }
                }
                OutputFormat::Mp4 => {
                    // For MP4, use AAC for audio
                    if info.has_audio {
                        if config.preserve_quality {
                            cmd.args(["-c:a", "copy"]);
                        } else if audio_bitrate > 0 {
                            cmd.args([
                                "-c:a",
                                "aac",
                                "-b:a",
                                &format!("{}k", audio_bitrate / 1000),
                            ]);
                        }
                    }
                }
            }

            // Only add video encoding options if output has video
            if !is_audio_format && info.media_type == MediaType::Video {
                if config.preserve_quality {
                    // Try to preserve video quality even when re-encoding audio
                    cmd.args(["-c:v", "copy"]);
                } else {
                    let video_quality = config.video_quality.unwrap_or_default();
                    match video_quality {
                        VideoQuality::Low => {
                            cmd.args(["-crf", "28", "-preset", "fast"]);
                        }
                        VideoQuality::Medium => {
                            cmd.args(["-crf", "23", "-preset", "medium"]);
                        }
                        VideoQuality::High => {
                            cmd.args(["-crf", "18", "-preset", "slow"]);
                        }
                        VideoQuality::Original => {
                            cmd.args(["-c:v", "copy"]);
                        }
                    }
                }
            }
        }

        cmd.arg(&output_path);

        let output = cmd.output().map_err(|e| {
            Error::FFmpegError(format!(
                "Failed to run ffmpeg: {}. Make sure ffmpeg is installed.",
                e
            ))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::FFmpegError(format!("FFmpeg failed: {}", stderr)));
        }

        // Get output file info
        let output_meta = fs::metadata(&output_path)?;

        Ok(OperationResult {
            success: true,
            output_path,
            duration_ms: config.end_ms - config.start_ms,
            file_size: output_meta.len(),
            warning: None,
        })
    }

    /// Convert media file
    pub fn convert(&self, config: ConvertConfig) -> Result<OperationResult> {
        let input_path = Path::new(&config.input_path);
        if !input_path.exists() {
            return Err(Error::FileNotFound(config.input_path.clone()));
        }

        let info = self.get_media_info(&config.input_path)?;

        // Check if trying to convert to audio format without audio stream
        let is_audio_format = matches!(
            config.format,
            OutputFormat::Mp3
                | OutputFormat::Wav
                | OutputFormat::Aac
                | OutputFormat::M4a
                | OutputFormat::Ogg
                | OutputFormat::Flac
        );
        if is_audio_format && !info.has_audio {
            return Err(Error::FFmpegError(
                "Cannot convert to audio format: source file has no audio stream".to_string(),
            ));
        }

        // Build output path - avoid double extension
        let output_path_str = &config.output_path;
        let expected_ext = config.format.extension();
        let output_path = if output_path_str.ends_with(&format!(".{}", expected_ext)) {
            output_path_str.clone()
        } else {
            format!("{}.{}", output_path_str, expected_ext)
        };

        let mut cmd = Command::new("ffmpeg");
        cmd.args(["-y", "-i", &config.input_path]);

        // If output is audio-only format, remove video stream
        if is_audio_format {
            cmd.arg("-vn");
        }

        // Audio quality settings
        let audio_quality = config.audio_quality.unwrap_or_default();
        let audio_bitrate = audio_quality.bitrate();

        // Set explicit audio codec based on output format
        match config.format {
            OutputFormat::Mp3 => {
                cmd.args(["-c:a", "libmp3lame"]);
                if audio_bitrate > 0 {
                    cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                } else {
                    cmd.args(["-b:a", "192k"]);
                }
            }
            OutputFormat::Aac | OutputFormat::M4a => {
                cmd.args(["-c:a", "aac"]);
                if audio_bitrate > 0 {
                    cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                }
            }
            OutputFormat::Wav => {
                cmd.args(["-c:a", "pcm_s16le"]);
            }
            OutputFormat::Aiff => {
                cmd.args(["-c:a", "pcm_s16be"]);
            }
            OutputFormat::Caf => {
                cmd.args(["-c:a", "pcm_s16le"]);
            }
            OutputFormat::Flac => {
                cmd.args(["-c:a", "flac"]);
            }
            OutputFormat::Ogg => {
                cmd.args(["-c:a", "libvorbis"]);
                if audio_bitrate > 0 {
                    cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                }
            }
            OutputFormat::Webm => {
                cmd.args(["-c:a", "libopus"]);
                if audio_bitrate > 0 {
                    cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                }
            }
            OutputFormat::Mp4 => {
                // For MP4, use AAC for audio
                if info.has_audio && audio_bitrate > 0 {
                    cmd.args(["-c:a", "aac", "-b:a", &format!("{}k", audio_bitrate / 1000)]);
                }
            }
        }

        // Video quality (if applicable and output has video)
        if !is_audio_format && info.media_type == MediaType::Video {
            let video_quality = config.video_quality.unwrap_or_default();
            match video_quality {
                VideoQuality::Low => {
                    cmd.args(["-c:v", "libx264", "-crf", "28", "-preset", "fast"]);
                }
                VideoQuality::Medium => {
                    cmd.args(["-c:v", "libx264", "-crf", "23", "-preset", "medium"]);
                }
                VideoQuality::High => {
                    cmd.args(["-c:v", "libx264", "-crf", "18", "-preset", "slow"]);
                }
                VideoQuality::Original => {
                    cmd.args(["-c:v", "copy"]);
                }
            }
        }

        cmd.arg(&output_path);

        let output = cmd.output().map_err(|e| {
            Error::FFmpegError(format!(
                "Failed to run ffmpeg: {}. Make sure ffmpeg is installed.",
                e
            ))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::FFmpegError(format!("FFmpeg failed: {}", stderr)));
        }

        let output_info = self.get_media_info(&output_path)?;

        Ok(OperationResult {
            success: true,
            output_path,
            duration_ms: output_info.duration_ms,
            file_size: output_info.file_size,
            warning: None,
        })
    }

    /// Extract audio from video
    pub fn extract_audio(&self, config: ExtractAudioConfig) -> Result<OperationResult> {
        let input_path = Path::new(&config.input_path);
        if !input_path.exists() {
            return Err(Error::FileNotFound(config.input_path.clone()));
        }

        // Check if source has audio
        let info = self.get_media_info(&config.input_path)?;
        if !info.has_audio {
            return Err(Error::FFmpegError(
                "Cannot extract audio: source file has no audio stream".to_string(),
            ));
        }

        // Build output path - avoid double extension
        let output_path_str = &config.output_path;
        let expected_ext = config.format.extension();
        let output_path = if output_path_str.ends_with(&format!(".{}", expected_ext)) {
            output_path_str.clone()
        } else {
            format!("{}.{}", output_path_str, expected_ext)
        };

        let audio_quality = config.audio_quality.unwrap_or_default();
        let audio_bitrate = audio_quality.bitrate();

        let mut cmd = Command::new("ffmpeg");
        cmd.args(["-y", "-i", &config.input_path, "-vn"]); // -vn removes video

        // Set explicit audio codec based on output format
        match config.format {
            OutputFormat::Mp3 => {
                cmd.args(["-c:a", "libmp3lame"]);
                if audio_bitrate > 0 {
                    cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                } else {
                    cmd.args(["-b:a", "192k"]);
                }
            }
            OutputFormat::Aac | OutputFormat::M4a => {
                cmd.args(["-c:a", "aac"]);
                if audio_bitrate > 0 {
                    cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                }
            }
            OutputFormat::Wav => {
                cmd.args(["-c:a", "pcm_s16le"]);
            }
            OutputFormat::Aiff => {
                cmd.args(["-c:a", "pcm_s16be"]);
            }
            OutputFormat::Caf => {
                cmd.args(["-c:a", "pcm_s16le"]);
            }
            OutputFormat::Flac => {
                cmd.args(["-c:a", "flac"]);
            }
            OutputFormat::Ogg => {
                cmd.args(["-c:a", "libvorbis"]);
                if audio_bitrate > 0 {
                    cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                }
            }
            OutputFormat::Webm => {
                cmd.args(["-c:a", "libopus"]);
                if audio_bitrate > 0 {
                    cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                }
            }
            OutputFormat::Mp4 => {
                // For MP4 audio extraction, use AAC
                cmd.args(["-c:a", "aac"]);
                if audio_bitrate > 0 {
                    cmd.args(["-b:a", &format!("{}k", audio_bitrate / 1000)]);
                }
            }
        }

        cmd.arg(&output_path);

        let output = cmd.output().map_err(|e| {
            Error::FFmpegError(format!(
                "Failed to run ffmpeg: {}. Make sure ffmpeg is installed.",
                e
            ))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::FFmpegError(format!("FFmpeg failed: {}", stderr)));
        }

        let output_info = self.get_media_info(&output_path)?;

        Ok(OperationResult {
            success: true,
            output_path,
            duration_ms: output_info.duration_ms,
            file_size: output_info.file_size,
            warning: None,
        })
    }

    /// Start playback using ffplay
    pub fn play(&self, config: PlayConfig) -> Result<()> {
        ensure_ffmpeg()?;

        let path = Path::new(&config.file_path);
        if !path.exists() {
            return Err(Error::FileNotFound(config.file_path.clone()));
        }

        // Get media info to determine if it's audio or video
        let info = self.get_media_info(&config.file_path)?;
        let volume = config.volume.unwrap_or(1.0);

        // Use ffplay for playback
        let mut cmd = Command::new("ffplay");

        // Common args
        cmd.args([
            "-autoexit",
            "-volume",
            &format!("{}", (volume * 100.0) as u32),
        ]);

        // For audio-only files, hide the display window
        // For video files, show the video window
        if info.media_type == MediaType::Audio {
            cmd.arg("-nodisp");
        } else {
            // Add window title for video
            cmd.args(["-window_title", "Affex Media Player"]);
            // Handle video-only files (like YouTube DASH) that may not have audio
            if !info.has_audio {
                cmd.arg("-an"); // Disable audio processing
            }
        }

        // Add input file
        cmd.arg(&config.file_path);

        // Run ffplay in background
        std::thread::spawn(move || {
            let output = cmd.output();
            if let Err(e) = output {
                log::error!("ffplay error: {}", e);
            } else if let Ok(out) = output {
                if !out.status.success() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    log::error!("ffplay failed: {}", stderr);
                }
            }
        });

        log::info!("Playback started: {}", config.file_path);
        Ok(())
    }

    /// Pause playback (not supported with ffplay)
    pub fn pause(&self) -> Result<()> {
        log::warn!("Pause not supported with ffplay backend");
        Err(Error::NotImplemented)
    }

    /// Resume playback (not supported with ffplay)
    pub fn resume(&self) -> Result<()> {
        log::warn!("Resume not supported with ffplay backend");
        Err(Error::NotImplemented)
    }

    /// Stop playback (kills ffplay process)
    pub fn stop(&self) -> Result<()> {
        // Kill any running ffplay process
        #[cfg(target_os = "windows")]
        let _ = Command::new("taskkill")
            .args(["/IM", "ffplay.exe", "/F"])
            .output();

        #[cfg(not(target_os = "windows"))]
        let _ = Command::new("pkill").args(["-f", "ffplay"]).output();

        log::info!("Playback stopped");
        Ok(())
    }

    /// Seek (not supported with ffplay)
    pub fn seek(&self, _config: SeekConfig) -> Result<()> {
        log::warn!("Seek not supported with ffplay backend");
        Err(Error::NotImplemented)
    }

    /// Get playback status (limited info with ffplay)
    pub fn get_playback_status(&self) -> Result<PlaybackStatus> {
        // Check if ffplay is running
        #[cfg(not(target_os = "windows"))]
        let output = Command::new("pgrep").args(["-f", "ffplay"]).output();

        #[cfg(target_os = "windows")]
        let output = Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq ffplay.exe"])
            .output();

        let is_playing = output
            .map(|o| o.status.success() && !o.stdout.is_empty())
            .unwrap_or(false);

        Ok(PlaybackStatus {
            state: if is_playing {
                PlaybackState::Playing
            } else {
                PlaybackState::Idle
            },
            position_ms: 0,
            duration_ms: 0,
            volume: 1.0,
            file_path: None,
        })
    }

    /// Set volume (not supported with ffplay after start)
    pub fn set_volume(&self, _volume: f32) -> Result<()> {
        log::warn!("Set volume not supported with ffplay backend");
        Err(Error::NotImplemented)
    }

    /// Select media file (not supported on desktop - use dialog plugin instead)
    pub fn select_media_file(&self) -> Result<crate::models::FileSelectionResult> {
        log::warn!(
            "select_media_file is only supported on Android. Use tauri-plugin-dialog on desktop."
        );
        Err(Error::NotImplemented)
    }

    /// Check permission (always granted on desktop)
    pub fn check_permission(&self) -> Result<crate::models::PermissionResponse> {
        Ok(crate::models::PermissionResponse {
            granted: true,
            can_request: true,
        })
    }

    /// Request permission (always granted on desktop)
    pub fn request_permission(&self) -> Result<crate::models::PermissionResponse> {
        Ok(crate::models::PermissionResponse {
            granted: true,
            can_request: true,
        })
    }

    /// Cleanup cache (no-op on desktop - temp files handled by OS)
    pub fn cleanup_cache(&self) -> Result<crate::models::CleanupResult> {
        Ok(crate::models::CleanupResult {
            success: true,
            files_deleted: 0,
            bytes_freed: 0,
        })
    }
}
