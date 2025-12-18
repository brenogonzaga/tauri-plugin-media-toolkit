import {
  invoke,
  addPluginListener,
  PluginListener,
} from "@tauri-apps/api/core";

// ============ Types ============

/**
 * Type of media file
 */
export type MediaType = "audio" | "video" | "unknown";

/**
 * Supported output formats
 */
export type OutputFormat =
  | "mp3"
  | "mp4"
  | "wav"
  | "aac"
  | "m4a"
  | "webm"
  | "ogg"
  | "flac";

/**
 * Audio quality preset
 * - low: 64kbps - smallest file size
 * - medium: 128kbps - balanced quality/size
 * - high: 256kbps - high quality
 * - lossless: original quality (for WAV/FLAC)
 */
export type AudioQuality = "low" | "medium" | "high" | "lossless";

/**
 * Video quality preset
 * - low: 480p - smallest file size
 * - medium: 720p - balanced quality/size
 * - high: 1080p - high quality
 * - original: preserve original quality
 */
export type VideoQuality = "low" | "medium" | "high" | "original";

/**
 * Media file information
 */
export interface MediaInfo {
  /** Full path to the file */
  path: string;
  /** Type of media (audio, video, or unknown) */
  mediaType: MediaType;
  /** Duration in milliseconds */
  durationMs: number;
  /** File size in bytes */
  fileSize: number;
  /** File format/extension */
  format: string;
  /** Whether file contains audio stream */
  hasAudio: boolean;
  /** Whether file contains video stream */
  hasVideo: boolean;
  /** Audio codec name (e.g., "aac", "mp3") */
  audioCodec?: string;
  /** Video codec name (e.g., "h264", "vp9") */
  videoCodec?: string;
  /** Audio sample rate in Hz */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Audio bitrate in bits/second */
  audioBitrate?: number;
  /** Video width in pixels */
  width?: number;
  /** Video height in pixels */
  height?: number;
  /** Video frame rate in fps */
  frameRate?: number;
  /** Video bitrate in bits/second */
  videoBitrate?: number;
}

/**
 * Configuration for trim operation
 */
export interface TrimConfig {
  /** Path to input file */
  inputPath: string;
  /** Path for output file (without extension) */
  outputPath: string;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Output format (defaults to input format) */
  format?: OutputFormat;
  /** Audio quality preset */
  audioQuality?: AudioQuality;
  /** Video quality preset */
  videoQuality?: VideoQuality;
  /** Try to preserve original quality (stream copy) */
  preserveQuality?: boolean;
}

/**
 * Configuration for convert operation
 */
export interface ConvertConfig {
  /** Path to input file */
  inputPath: string;
  /** Path for output file (without extension) */
  outputPath: string;
  /** Target output format */
  format: OutputFormat;
  /** Audio quality preset */
  audioQuality?: AudioQuality;
  /** Video quality preset */
  videoQuality?: VideoQuality;
}

/**
 * Configuration for audio extraction
 */
export interface ExtractAudioConfig {
  /** Path to input video file */
  inputPath: string;
  /** Path for output audio file (without extension) */
  outputPath: string;
  /** Output audio format */
  format: OutputFormat;
  /** Audio quality preset */
  audioQuality?: AudioQuality;
}

/**
 * Configuration for media playback
 */
export interface PlayConfig {
  /** Path to media file */
  filePath: string;
  /** Volume level (0.0 to 1.0) */
  volume?: number;
}

/**
 * Configuration for seek operation
 */
export interface SeekConfig {
  /** Position in milliseconds */
  positionMs: number;
}

/**
 * Result of media operation (trim, convert, extract)
 */
export interface OperationResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Full path to output file */
  outputPath: string;
  /** Duration of output in milliseconds */
  durationMs: number;
  /** Size of output file in bytes */
  fileSize: number;
  /** Warning message (e.g., iOS format conversion notice) */
  warning?: string;
}

/**
 * Current playback status
 */
export interface PlaybackStatus {
  /** Whether media is currently playing */
  isPlaying: boolean;
  /** Whether playback is paused */
  isPaused: boolean;
  /** Current playback position in milliseconds */
  currentPositionMs: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Current volume level (0.0 to 1.0) */
  volume: number;
}

/**
 * Result of file selection (Android only)
 */
export interface FileSelectionResult {
  /** Whether file selection succeeded */
  success: boolean;
  /** Path to the selected file (already copied to cache) */
  filePath: string;
}

/**
 * Permission status response
 */
export interface PermissionResponse {
  /** Whether permission is granted */
  granted: boolean;
  /** Whether permission can be requested (not permanently denied) */
  canRequest: boolean;
}

/**
 * Progress event for media operations
 */
export interface ProgressEvent {
  /** Operation type: "trim", "convert", "extractAudio" */
  operation: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Estimated time remaining in milliseconds (optional) */
  estimatedTimeMs?: number;
}

/**
 * Cache cleanup result
 */
export interface CleanupResult {
  /** Whether cleanup succeeded */
  success: boolean;
  /** Number of files deleted */
  filesDeleted: number;
  /** Bytes freed */
  bytesFreed: number;
}

/**
 * Error types that can occur during media operations
 */
export type MediaEditorErrorType =
  | "FileNotFound"
  | "PermissionDenied"
  | "InsufficientStorage"
  | "UnsupportedCodec"
  | "UnsupportedFormat"
  | "InvalidTimeRange"
  | "FFmpegError"
  | "PlaybackError"
  | "ExportFailed"
  | "NoAudioTrack"
  | "NoVideoTrack"
  | "NoMediaLoaded"
  | "Cancelled"
  | "NotImplemented"
  | "Unknown";

/**
 * Parse error message to determine error type
 * @param error Error message from plugin
 * @returns MediaEditorErrorType
 */
export function parseErrorType(error: string): MediaEditorErrorType {
  const errorLower = error.toLowerCase();
  if (errorLower.includes("file not found")) return "FileNotFound";
  if (errorLower.includes("permission denied")) return "PermissionDenied";
  if (errorLower.includes("insufficient storage")) return "InsufficientStorage";
  if (errorLower.includes("unsupported codec")) return "UnsupportedCodec";
  if (errorLower.includes("unsupported format")) return "UnsupportedFormat";
  if (errorLower.includes("invalid time range")) return "InvalidTimeRange";
  if (errorLower.includes("ffmpeg")) return "FFmpegError";
  if (errorLower.includes("playback")) return "PlaybackError";
  if (errorLower.includes("export failed")) return "ExportFailed";
  if (errorLower.includes("no audio track")) return "NoAudioTrack";
  if (errorLower.includes("no video track")) return "NoVideoTrack";
  if (errorLower.includes("no media loaded")) return "NoMediaLoaded";
  if (errorLower.includes("cancelled")) return "Cancelled";
  if (errorLower.includes("not implemented")) return "NotImplemented";
  return "Unknown";
}

// ============ Functions ============

/**
 * Select a media file (Android only - better than Tauri dialog plugin)
 * Opens native file picker and returns file path directly (copied to cache)
 *
 * @returns Promise with file selection result
 *
 * @example
 * ```typescript
 * import { selectMediaFile } from "tauri-plugin-media-editor-api";
 *
 * const result = await selectMediaFile();
 * console.log(`Selected: ${result.filePath}`);
 * ```
 */
export async function selectMediaFile(): Promise<FileSelectionResult> {
  return await invoke<FileSelectionResult>(
    "plugin:media-toolkit|select_media_file"
  );
}

/**
 * Get detailed information about a media file
 *
 * @param filePath - Full path to the media file
 * @returns Promise with media information
 *
 * @example
 * ```typescript
 * import { getMediaInfo } from "tauri-plugin-media-editor-api";
 *
 * const info = await getMediaInfo("/path/to/video.mp4");
 * console.log(`Duration: ${info.durationMs}ms`);
 * console.log(`Resolution: ${info.width}x${info.height}`);
 * ```
 */
export async function getMediaInfo(path: string): Promise<MediaInfo> {
  return await invoke<MediaInfo>("plugin:media-toolkit|get_media_info", {
    path,
  });
}

/**
 * Trim a media file to a specific time range
 *
 * @param config - Trim configuration
 * @returns Promise with operation result
 *
 * @example
 * ```typescript
 * import { trim } from "tauri-plugin-media-editor-api";
 *
 * // Trim video from 10s to 30s
 * const result = await trim({
 *   inputPath: "/path/to/video.mp4",
 *   outputPath: "/path/to/trimmed",
 *   startMs: 10000,
 *   endMs: 30000,
 * });
 * console.log(`Output: ${result.outputPath}`);
 * ```
 */
export async function trim(config: TrimConfig): Promise<OperationResult> {
  return await invoke<OperationResult>("plugin:media-toolkit|trim", {
    config,
  });
}

/**
 * Convert a media file to a different format
 *
 * @param config - Convert configuration
 * @returns Promise with operation result
 *
 * @example
 * ```typescript
 * import { convert } from "tauri-plugin-media-editor-api";
 *
 * // Convert video to MP4
 * const result = await convert({
 *   inputPath: "/path/to/video.webm",
 *   outputPath: "/path/to/converted",
 *   format: "mp4",
 *   videoQuality: "high",
 * });
 * ```
 */
export async function convert(config: ConvertConfig): Promise<OperationResult> {
  return await invoke<OperationResult>("plugin:media-toolkit|convert", {
    config,
  });
}

/**
 * Extract audio track from a video file
 *
 * @param config - Extract configuration
 * @returns Promise with operation result
 *
 * @example
 * ```typescript
 * import { extractAudio } from "tauri-plugin-media-editor-api";
 *
 * // Extract audio as MP3
 * const result = await extractAudio({
 *   inputPath: "/path/to/video.mp4",
 *   outputPath: "/path/to/audio",
 *   format: "mp3",
 *   audioQuality: "high",
 * });
 * ```
 */
export async function extractAudio(
  config: ExtractAudioConfig
): Promise<OperationResult> {
  return await invoke<OperationResult>("plugin:media-toolkit|extract_audio", {
    config,
  });
}

/**
 * Start playing a media file
 *
 * @param config - Play configuration
 *
 * @example
 * ```typescript
 * import { play } from "tauri-plugin-media-editor-api";
 *
 * await play({
 *   filePath: "/path/to/audio.mp3",
 *   volume: 0.8,
 * });
 * ```
 */
export async function play(config: PlayConfig): Promise<void> {
  return await invoke<void>("plugin:media-toolkit|play", {
    config,
  });
}

/**
 * Pause the current playback
 *
 * @example
 * ```typescript
 * import { pause } from "tauri-plugin-media-editor-api";
 *
 * await pause();
 * ```
 */
export async function pause(): Promise<void> {
  return await invoke<void>("plugin:media-toolkit|pause", {});
}

/**
 * Resume paused playback
 *
 * @example
 * ```typescript
 * import { resume } from "tauri-plugin-media-editor-api";
 *
 * await resume();
 * ```
 */
export async function resume(): Promise<void> {
  return await invoke<void>("plugin:media-toolkit|resume", {});
}

/**
 * Stop playback and release resources
 *
 * @example
 * ```typescript
 * import { stop } from "tauri-plugin-media-editor-api";
 *
 * await stop();
 * ```
 */
export async function stop(): Promise<void> {
  return await invoke<void>("plugin:media-toolkit|stop", {});
}

/**
 * Seek to a specific position in the media
 *
 * @param config - Seek configuration
 *
 * @example
 * ```typescript
 * import { seek } from "tauri-plugin-media-editor-api";
 *
 * // Seek to 30 seconds
 * await seek({ positionMs: 30000 });
 * ```
 */
export async function seek(config: SeekConfig): Promise<void> {
  return await invoke<void>("plugin:media-toolkit|seek", {
    config,
  });
}

/**
 * Get current playback status
 *
 * @returns Promise with playback status
 *
 * @example
 * ```typescript
 * import { getPlaybackStatus } from "tauri-plugin-media-editor-api";
 *
 * const status = await getPlaybackStatus();
 * if (status.isPlaying) {
 *   console.log(`Position: ${status.currentPositionMs}/${status.durationMs}`);
 * }
 * ```
 */
export async function getPlaybackStatus(): Promise<PlaybackStatus> {
  return await invoke<PlaybackStatus>(
    "plugin:media-toolkit|get_playback_status",
    {}
  );
}

/**
 * Set playback volume
 *
 * @param volume - Volume level (0.0 = silent, 1.0 = max)
 *
 * @example
 * ```typescript
 * import { setVolume } from "tauri-plugin-media-editor-api";
 *
 * await setVolume(0.5); // 50% volume
 * ```
 */
export async function setVolume(volume: number): Promise<void> {
  return await invoke<void>("plugin:media-toolkit|set_volume", {
    volume,
  });
}

/**
 * Check if media permission is granted
 *
 * @returns Promise with permission status
 *
 * @example
 * ```typescript
 * import { checkPermission } from "tauri-plugin-media-editor-api";
 *
 * const permission = await checkPermission();
 * if (!permission.granted) {
 *   if (permission.canRequest) {
 *     await requestPermission();
 *   } else {
 *     // User permanently denied - show settings dialog
 *   }
 * }
 * ```
 */
export async function checkPermission(): Promise<PermissionResponse> {
  return await invoke<PermissionResponse>(
    "plugin:media-toolkit|check_permission",
    {}
  );
}

/**
 * Request media permission
 *
 * @returns Promise with permission status after request
 *
 * @example
 * ```typescript
 * import { requestPermission } from "tauri-plugin-media-editor-api";
 *
 * const permission = await requestPermission();
 * if (permission.granted) {
 *   console.log("Permission granted!");
 * }
 * ```
 */
export async function requestPermission(): Promise<PermissionResponse> {
  return await invoke<PermissionResponse>(
    "plugin:media-toolkit|request_permission",
    {}
  );
}

/**
 * Clean up cached media files to free storage space
 *
 * @returns Promise with cleanup result
 *
 * @example
 * ```typescript
 * import { cleanupCache } from "tauri-plugin-media-editor-api";
 *
 * const result = await cleanupCache();
 * console.log(`Freed ${result.bytesFreed} bytes from ${result.filesDeleted} files`);
 * ```
 */
export async function cleanupCache(): Promise<CleanupResult> {
  return await invoke<CleanupResult>("plugin:media-toolkit|cleanup_cache", {});
}

/**
 * Listen for progress updates during media operations.
 * Progress events are emitted during trim, convert, and extractAudio operations.
 *
 * @param handler - Function called with progress updates
 * @returns Promise with plugin listener that can be unlistened
 *
 * @example
 * ```typescript
 * import { onProgress, trim } from "tauri-plugin-media-editor-api";
 *
 * // Setup progress listener
 * const listener = await onProgress((event) => {
 *   console.log(`${event.operation}: ${event.progress}%`);
 * });
 *
 * // Perform operation
 * await trim({ ... });
 *
 * // Cleanup listener when done
 * listener.unregister();
 * ```
 */
export async function onProgress(
  handler: (event: ProgressEvent) => void
): Promise<PluginListener> {
  return addPluginListener<ProgressEvent>("media-editor", "progress", handler);
}
