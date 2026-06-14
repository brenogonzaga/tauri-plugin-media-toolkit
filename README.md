# Tauri Plugin Media Toolkit

Cross-platform media processing for Tauri 2.x. Desktop operations use FFmpeg via native platform codecs; mobile delegates to `AVFoundation` (iOS) and `MediaCodec` (Android).

## Platform Matrix

| Feature       | Windows | macOS | Linux | iOS  | Android |
| ------------- | ------- | ----- | ----- | ---- | ------- |
| Media Info    | ✅      | ✅    | ✅    | ✅   | ✅      |
| Trim          | ✅      | ✅    | ✅    | ✅   | ✅      |
| Convert       | ✅      | ✅    | ✅    | ⚠️ * | ✅      |
| Extract Audio | ✅      | ✅    | ✅    | ✅   | ✅      |
| Playback      | ✅      | ✅    | ✅    | ✅   | ✅      |
| Progress Events | ✅    | ✅    | ✅    | ⚠️ * | ✅     |
| File Picker   | —       | —     | —     | —    | ✅      |

*iOS does not support WebM or OGG. Use MP4/M4A/AAC for full cross-platform compatibility.

## Installation

### Rust

```toml
[dependencies]
tauri-plugin-media-toolkit = "0.1"
```

### TypeScript

```bash
npm install tauri-plugin-media-toolkit-api
```

## Setup

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_media_toolkit::init())
        .run(tauri::generate_context!())
        .unwrap();
}
```

### Permissions

```json
{ "permissions": ["media-toolkit:default"] }
```

Granular:

```json
{
  "permissions": [
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
    "media-toolkit:allow-cleanup-cache",
    "media-toolkit:allow-select-media-file"
  ]
}
```

### Platform Setup

**Android** — `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

**iOS** — `Info.plist`:

```xml
<key>NSAppleMusicUsageDescription</key>
<string>Needed to play audio files.</string>
```

**Linux** — FFmpeg must be installed:

```bash
sudo apt install ffmpeg          # Debian/Ubuntu
sudo dnf install ffmpeg          # Fedora
sudo pacman -S ffmpeg            # Arch
```

## Usage

### Media info

```typescript
import { getMediaInfo } from "tauri-plugin-media-toolkit-api";

const info = await getMediaInfo("/path/to/video.mp4");
// { mediaType, durationMs, width, height, audioCodec, videoCodec, sampleRate, channels, ... }
```

### Trim

```typescript
import { trim } from "tauri-plugin-media-toolkit-api";

const result = await trim({
  inputPath: "/path/to/video.mp4",
  outputPath: "/path/to/trimmed",  // extension appended automatically
  startMs: 10000,
  endMs: 30000,
  preserveQuality: true,  // stream copy — no re-encoding, much faster
});
```

### Convert

```typescript
import { convert } from "tauri-plugin-media-toolkit-api";

await convert({
  inputPath: "/path/to/video.webm",
  outputPath: "/path/to/converted",
  format: "mp4",
  videoQuality: "high",
});
```

### Extract audio

```typescript
import { extractAudio } from "tauri-plugin-media-toolkit-api";

await extractAudio({
  inputPath: "/path/to/video.mp4",
  outputPath: "/path/to/audio",
  format: "mp3",
  audioQuality: "high",
});
```

### Playback

```typescript
import {
  play, pause, resume, stop, seek, setVolume, getPlaybackStatus
} from "tauri-plugin-media-toolkit-api";

await play({ filePath: "/path/to/audio.mp3", volume: 0.8 });

const status = await getPlaybackStatus();
// { isPlaying, isPaused, currentPositionMs, durationMs, volume }

await seek({ positionMs: 30000 });
await setVolume(0.5);
await stop();
```

### Progress events

```typescript
import { onProgress } from "tauri-plugin-media-toolkit-api";

const unlisten = await onProgress(e => {
  console.log(`${e.operation}: ${e.progress}%`);
});

await convert({ inputPath, outputPath, format: "webm" });
unlisten();
```

## API Reference

### Processing

- `getMediaInfo(path)` → `MediaInfo`
- `trim(config)` → `OperationResult`
- `convert(config)` → `OperationResult`
- `extractAudio(config)` → `OperationResult`

### Playback

- `play({ filePath, volume? })` / `pause()` / `resume()` / `stop()`
- `seek({ positionMs })` / `setVolume(0.0–1.0)`
- `getPlaybackStatus()` → `{ isPlaying, isPaused, currentPositionMs, durationMs, volume }`

### Utility

- `selectMediaFile()` — Android only: opens native file picker and copies to cache
- `checkPermission()` / `requestPermission()` → `{ granted, canRequest }`
- `cleanupCache()` → `CleanupResult`
- `onProgress(handler)` → `UnlistenFn`
- `parseErrorType(error)` → `MediaEditorErrorType`

### Quality Presets

**Audio:** `low` (96 kbps) · `medium` (192 kbps) · `high` (320 kbps) · `lossless`

**Video:** `low` (480p) · `medium` (720p) · `high` (1080p) · `original`

**Formats:** MP3, MP4, WAV, AAC, M4A, WebM, OGG, FLAC *(WebM/OGG not available on iOS)*

## Troubleshooting

**iOS "Unsupported format"** — iOS has no native WebM or OGG decoder. Use MP4 for video and M4A/AAC for audio.

**Android file access fails** — files from external storage need to be copied into the app sandbox first. Use `selectMediaFile()` which handles this automatically.

**Trim is slow** — if input and output formats match, set `preserveQuality: true` to use stream copy and skip re-encoding. For large files this is the difference between seconds and minutes.

**Linux operations fail** — verify FFmpeg is installed and on `$PATH`. Some distributions split codecs into separate packages (`libavcodec-extra` on Ubuntu).

## Version Compatibility

| Component   | Minimum        |
| ----------- | -------------- |
| Tauri       | 2.9            |
| Rust        | 1.77           |
| Android SDK | 24 (Android 7) |
| iOS         | 14.0           |

## License

MIT
