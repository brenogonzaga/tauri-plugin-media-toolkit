# Tauri Plugin Media Toolkit

Cross-platform media toolkit plugin for Tauri 2.x applications. Provides media editing, playback, and analysis capabilities for desktop (Windows, macOS, Linux) and mobile (iOS, Android).

## Features

- **Cross-platform**: Works on Windows, macOS, Linux, iOS, and Android
- **Media Info**: Get detailed metadata from audio/video files
- **Trim**: Cut media to specific time ranges
- **Convert**: Transform between audio/video formats
- **Extract Audio**: Rip audio tracks from video files
- **Playback**: Play, pause, resume, stop, and seek media files
- **Quality Presets**: Low, Medium, High, Lossless/Original options
- **Format Support**: MP3, MP4, WAV, AAC, M4A, WebM, OGG, FLAC

## Installation

### Rust

Add the plugin to your `Cargo.toml`:

```toml
[dependencies]
tauri-plugin-media-toolkit = "0.1"
```

### TypeScript

Install the JavaScript guest bindings:

```bash
npm install tauri-plugin-media-toolkit-api
# or
yarn add tauri-plugin-media-toolkit-api
# or
pnpm add tauri-plugin-media-toolkit-api
```

## Setup

### Register Plugin

In your Tauri app setup:

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_media_toolkit::init())
        .run(tauri::generate_context!())
        .expect("error while running application");
}
```

### Permissions

Add permissions to your `capabilities/default.json`:

```json
{
  "permissions": ["media-toolkit:default"]
}
```

For granular permissions, you can specify individual commands:

```json
{
  "permissions": [
    "media-toolkit:allow-select-media-file",
    "media-toolkit:allow-get-media-info",
    "media-toolkit:allow-trim",
    "media-toolkit:allow-convert",
    "media-toolkit:allow-extract-audio",
    "media-toolkit:allow-play",
    "media-toolkit:allow-pause",
    "media-toolkit:allow-resume",
    "media-toolkit:allow-stop",
    "media-toolkit:allow-seek",
    "media-toolkit:allow-get-playback-status",
    "media-toolkit:allow-set-volume",
    "media-toolkit:allow-check-permission",
    "media-toolkit:allow-request-permission",
    "media-toolkit:allow-cleanup-cache"
  ]
}
```

### Platform-Specific Setup

#### Android

Add to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

#### iOS

Add to `Info.plist`:

```xml
<key>NSAppleMusicUsageDescription</key>
<string>This app needs access to play audio files.</string>
```

## Usage

### Get Media Information

```typescript
import { getMediaInfo } from "tauri-plugin-media-toolkit-api";

const info = await getMediaInfo("/path/to/video.mp4");
console.log(`Type: ${info.mediaType}`);
console.log(`Duration: ${info.durationMs}ms`);
console.log(`Resolution: ${info.width}x${info.height}`);
console.log(`Audio: ${info.audioCodec}, Video: ${info.videoCodec}`);
```

### Trim Media

```typescript
import { trim } from "tauri-plugin-media-toolkit-api";

// Trim video from 10s to 30s
const result = await trim({
  inputPath: "/path/to/video.mp4",
  outputPath: "/path/to/trimmed", // without extension
  startMs: 10000,
  endMs: 30000,
  preserveQuality: true, // no re-encoding
});
console.log(`Output: ${result.outputPath}, Size: ${result.fileSize} bytes`);
```

### Convert Format

```typescript
import { convert } from "tauri-plugin-media-toolkit-api";

// Convert WebM to MP4
const result = await convert({
  inputPath: "/path/to/video.webm",
  outputPath: "/path/to/converted",
  format: "mp4",
  videoQuality: "high",
});
```

### Extract Audio from Video

```typescript
import { extractAudio } from "tauri-plugin-media-toolkit-api";

// Extract audio as MP3
const result = await extractAudio({
  inputPath: "/path/to/video.mp4",
  outputPath: "/path/to/audio",
  format: "mp3",
  audioQuality: "high",
});
```

### Playback Controls

```typescript
import {
  play,
  pause,
  resume,
  stop,
  seek,
  setVolume,
  getPlaybackStatus,
} from "tauri-plugin-media-toolkit-api";

// Start playback
await play({
  filePath: "/path/to/audio.mp3",
  volume: 0.8,
});

// Check status
const status = await getPlaybackStatus();
console.log(
  `Playing: ${status.isPlaying}, Position: ${status.currentPositionMs}ms`
);

// Control playback
await pause();
await resume();
await seek({ positionMs: 30000 }); // Seek to 30s
await setVolume(0.5); // 50% volume
await stop();
```

### Progress Monitoring

```typescript
import { onProgress } from "tauri-plugin-media-toolkit-api";

// Listen for operation progress
const unlisten = await onProgress(event => {
  console.log(`${event.operation}: ${event.progress}%`);
  if (event.estimatedTimeMs) {
    console.log(`ETA: ${event.estimatedTimeMs}ms`);
  }
});

// Start a long operation
await convert({
  inputPath: "/path/to/large-video.mp4",
  outputPath: "/path/to/converted",
  format: "webm",
});

// Clean up listener
unlisten();
```

### Error Handling

```typescript
import { trim, parseErrorType } from "tauri-plugin-media-toolkit-api";

try {
  await trim(config);
} catch (error) {
  const errorType = parseErrorType(String(error));
  switch (errorType) {
    case "FileNotFound":
      console.error("Input file does not exist");
      break;
    case "PermissionDenied":
      console.error("No permission to access file");
      break;
    case "InsufficientStorage":
      console.error("Not enough disk space");
      break;
    case "UnsupportedFormat":
      console.error("Format not supported on this platform");
      break;
    default:
      console.error("Unknown error:", error);
  }
}
```

## API Reference

### Core Functions

#### `getMediaInfo(filePath: string): Promise<MediaInfo>`

Get detailed metadata from a media file.

**Returns:**

- `mediaType`: "audio" | "video" | "unknown"
- `durationMs`: Duration in milliseconds
- `fileSize`: Size in bytes
- `format`: File extension
- `audioCodec`, `videoCodec`: Codec names
- `width`, `height`, `frameRate`: Video properties
- `sampleRate`, `channels`, `audioBitrate`: Audio properties

#### `trim(config: TrimConfig): Promise<OperationResult>`

Cut media to a specific time range.

**Config:**

- `inputPath`: Source file path
- `outputPath`: Destination (without extension)
- `startMs`, `endMs`: Time range in milliseconds
- `format`: Output format (optional, defaults to input)
- `preserveQuality`: Stream copy without re-encoding (default: false)
- `audioQuality`, `videoQuality`: Quality presets

#### `convert(config: ConvertConfig): Promise<OperationResult>`

Convert media to a different format.

**Config:**

- `inputPath`: Source file path
- `outputPath`: Destination (without extension)
- `format`: Target format (mp3, mp4, wav, etc.)
- `audioQuality`, `videoQuality`: Quality presets

#### `extractAudio(config: ExtractAudioConfig): Promise<OperationResult>`

Extract audio track from video.

**Config:**

- `inputPath`: Source video path
- `outputPath`: Destination (without extension)
- `format`: Audio format (mp3, wav, aac, etc.)
- `audioQuality`: Quality preset

### Playback Functions

#### `play(config: PlayConfig): Promise<void>`

Start media playback.

**Config:**

- `filePath`: Media file path
- `volume`: Volume level (0.0-1.0, default: 1.0)

#### `pause(): Promise<void>`

Pause current playback.

#### `resume(): Promise<void>`

Resume paused playback.

#### `stop(): Promise<void>`

Stop playback and release resources.

#### `seek(config: SeekConfig): Promise<void>`

Seek to specific position.

**Config:**

- `positionMs`: Target position in milliseconds

#### `setVolume(volume: number): Promise<void>`

Set playback volume (0.0 = mute, 1.0 = full).

#### `getPlaybackStatus(): Promise<PlaybackStatus>`

Get current playback status.

**Returns:**

- `isPlaying`: Whether currently playing
- `isPaused`: Whether paused
- `currentPositionMs`: Current position
- `durationMs`: Total duration
- `volume`: Current volume level

### Utility Functions

#### `selectMediaFile(): Promise<FileSelectionResult>` (Android only)

Open native file picker and copy selected file to cache.

#### `checkPermission(): Promise<PermissionResponse>`

Check storage permission status.

#### `requestPermission(): Promise<PermissionResponse>`

Request storage permissions.

#### `cleanupCache(): Promise<CleanupResult>`

Clean up temporary media files.

#### `onProgress(handler: (event: ProgressEvent) => void): Promise<UnlistenFn>`

Listen for operation progress events.

#### `parseErrorType(error: string): MediaEditorErrorType`

Parse error message to determine error type.

### Types

#### MediaInfo

```typescript
interface MediaInfo {
  path: string;
  mediaType: "audio" | "video" | "unknown";
  durationMs: number;
  fileSize: number;
  format: string;
  hasAudio: boolean;
  hasVideo: boolean;
  audioCodec?: string;
  videoCodec?: string;
  sampleRate?: number;
  channels?: number;
  audioBitrate?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  videoBitrate?: number;
}
```

#### TrimConfig

```typescript
interface TrimConfig {
  inputPath: string;
  outputPath: string; // without extension
  startMs: number;
  endMs: number;
  format?: OutputFormat;
  audioQuality?: AudioQuality;
  videoQuality?: VideoQuality;
  preserveQuality?: boolean; // stream copy, no re-encoding
}
```

#### ConvertConfig

```typescript
interface ConvertConfig {
  inputPath: string;
  outputPath: string;
  format: OutputFormat;
  audioQuality?: AudioQuality;
  videoQuality?: VideoQuality;
}
```

#### OperationResult

```typescript
interface OperationResult {
  success: boolean;
  outputPath: string;
  durationMs: number;
  fileSize: number;
}
```

#### PlaybackStatus

```typescript
interface PlaybackStatus {
  isPlaying: boolean;
  isPaused: boolean;
  currentPositionMs: number;
  durationMs: number;
  volume: number;
}
```

### Quality Presets

#### Audio Quality

| Preset     | Bitrate  | Use Case           |
| ---------- | -------- | ------------------ |
| `low`      | 96 kbps  | Voice/Podcasts     |
| `medium`   | 192 kbps | General purpose    |
| `high`     | 320 kbps | Music/High quality |
| `lossless` | Original | No re-encoding     |

#### Video Quality

| Preset     | Resolution | Use Case        |
| ---------- | ---------- | --------------- |
| `low`      | 480p       | Small file size |
| `medium`   | 720p       | Balanced        |
| `high`     | 1080p      | High quality    |
| `original` | Unchanged  | No re-encoding  |

### Output Formats

- **Audio**: `mp3`, `wav`, `aac`, `m4a`, `ogg`, `flac`
- **Video**: `mp4`, `webm`

## Feature Support Matrix

| Feature         | Windows | macOS | Linux | iOS | Android |
| --------------- | ------- | ----- | ----- | --- | ------- |
| Get Media Info  | ✅      | ✅    | ✅    | ✅  | ✅      |
| Trim            | ✅      | ✅    | ✅    | ✅  | ✅      |
| Convert         | ✅      | ✅    | ✅    | ⚠️  | ✅      |
| Extract Audio   | ✅      | ✅    | ✅    | ✅  | ✅      |
| Playback        | ✅      | ✅    | ✅    | ✅  | ✅      |
| Progress Events | ✅      | ✅    | ✅    | ⚠️  | ✅      |
| File Picker     | ❌      | ❌    | ❌    | ❌  | ✅      |
| Hardware Accel  | ✅      | ✅    | ✅    | ✅  | ✅      |

**Legend:**

- ✅ Full support
- ⚠️ Limited support (iOS format conversion has restrictions)
- ❌ Not available

## Platform Implementation

### Desktop (Windows, macOS, Linux)

- Uses platform-native media APIs
- Full format support via system codecs
- Hardware acceleration when available

### Android

- Uses `MediaPlayer` for playback
- Uses `MediaMetadataRetriever` for metadata
- Native format support (MP3, AAC, MP4, etc.)

### iOS

- Uses `AVFoundation` for all operations
- Uses `AVPlayer` for playback
- Native support for Apple formats (M4A, MP4, etc.)

## Troubleshooting

### "File not found" errors

**Desktop:**

- Ensure absolute paths are used
- Check file permissions
- Verify file exists: `fs.existsSync(path)`

**Mobile:**

- iOS: Files must be in app's Documents or tmp directory
- Android: Use `selectMediaFile()` to properly copy files from external storage

### "Permission denied" errors

**Android:**

```typescript
const perm = await requestPermission();
if (!perm.granted) {
  console.error("Storage permission required");
  return;
}
```

**iOS:**
Add required keys to Info.plist:

```xml
<key>NSAppleMusicUsageDescription</key>
<string>Access media files</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Access photo library</string>
```

### "Unsupported format" errors

**iOS Limitations:**

- iOS does not support WebM or OGG natively
- Use MP4 (video) or M4A/AAC (audio) for best compatibility
- Check `result.warning` for iOS-specific messages

**Android:**

- Most formats supported via MediaCodec
- Very old devices may have limited codec support

### Conversion/Trim taking too long

**Tips:**

- Use `preserveQuality: true` for trim when possible (stream copy, no re-encoding)
- Lower quality presets for faster processing: `videoQuality: "low"`
- Monitor progress with `onProgress()` listener
- For very large files (>1GB), consider warning users about processing time

### "Insufficient storage" errors

**Desktop:**

```typescript
// Check available space before operations
const info = await getMediaInfo(inputPath);
const estimatedSize = info.fileSize * 1.5; // Estimate output size
// Compare with available disk space
```

**Mobile:**

- Clean up old files: `await cleanupCache()`
- Check device storage in system settings

### Playback not working

**Checklist:**

- ✅ File format is supported on platform
- ✅ File path is correct and accessible
- ✅ Volume is not set to 0
- ✅ No other app is using audio exclusively
- ✅ Check `getPlaybackStatus()` for current state

**Debug:**

```typescript
const status = await getPlaybackStatus();
console.log("Playing:", status.isPlaying);
console.log("Paused:", status.isPaused);
console.log("Position:", status.currentPositionMs);
```

### Audio extracted from video has no sound

**Solution:** Verify video has audio track:

```typescript
const info = await getMediaInfo(videoPath);
if (!info.hasAudio) {
  console.error("Video has no audio track");
  return;
}
```

### Output file extension mismatch

**Note:** The plugin automatically appends the correct extension:

```typescript
// Input: outputPath = "/path/to/output"
// With format = "mp4"
// Actual output: "/path/to/output.mp4"

// Don't include extension in outputPath:
// ❌ Wrong: outputPath = "/path/to/output.mp4"
// ✅ Correct: outputPath = "/path/to/output"
```

### FFmpeg errors (Desktop only)

**Common issues:**

- Corrupted input file: Try playing in VLC first
- Invalid codec combination: Use supported formats
- Missing system codecs: Install media codecs package

**Linux:**

```bash
# Install ffmpeg and codecs
sudo apt install ffmpeg libavcodec-extra
```

## Examples

See the [examples/media-toolkit-example](./examples/media-toolkit-example) directory for a complete working demo with React + Material UI.

## Version Compatibility

| Component   | Version            |
| ----------- | ------------------ |
| Tauri       | 2.9+               |
| Rust        | 1.77+              |
| Android SDK | 24+ (Android 7.0+) |
| iOS         | 14.0+              |

## License

MIT
