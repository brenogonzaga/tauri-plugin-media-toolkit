# Media Toolkit Plugin Example

Complete demonstration of the `tauri-plugin-media-toolkit` functionality using React + TypeScript + Material UI.

## Features Demonstrated

- ✅ Media file information (metadata, codecs, duration, bitrates)
- ✅ Media trimming with time range selection
- ✅ Format conversion (audio/video)
- ✅ Audio extraction from video
- ✅ Media playback with controls (play, pause, resume, stop, seek)
- ✅ Volume control
- ✅ Progress monitoring for operations
- ✅ Quality preset selection (low, medium, high, lossless)
- ✅ File selection (Android native picker)
- ✅ Permission handling
- ✅ Error handling with error type detection
- ✅ Cache cleanup
- ✅ Responsive design (mobile-friendly)

## Running the Example

### Desktop

```bash
npm install
npm run tauri dev
```

### Mobile

```bash
npm install
npm run tauri android dev
# or
npm run tauri ios dev
```

## Project Structure

```
media-toolkit-example/
├── src/
│   ├── App.tsx          # Main demo component
│   └── main.tsx         # React entry point
├── src-tauri/
│   ├── src/
│   │   └── main.rs      # Tauri setup with Media Toolkit plugin
│   ├── Cargo.toml       # Rust dependencies
│   └── capabilities/
│       └── default.json # Permissions configuration
└── package.json         # NPM dependencies
```

## Code Highlights

### Media Information Retrieval

The example shows comprehensive metadata extraction:

```typescript
const info = await getMediaInfo(filePath);

console.log(`Type: ${info.mediaType}`);
console.log(`Duration: ${info.durationMs}ms`);
console.log(`Size: ${info.fileSize} bytes`);

if (info.hasVideo) {
  console.log(`Video: ${info.width}x${info.height} @ ${info.frameRate}fps`);
  console.log(`Codec: ${info.videoCodec}, Bitrate: ${info.videoBitrate}`);
}

if (info.hasAudio) {
  console.log(`Audio: ${info.sampleRate}Hz, ${info.channels} channels`);
  console.log(`Codec: ${info.audioCodec}, Bitrate: ${info.audioBitrate}`);
}
```

### Progress Monitoring

Real-time progress tracking for long operations:

```typescript
const unlisten = await onProgress(event => {
  setProgress({
    operation: event.operation,
    percentage: event.progress,
    eta: event.estimatedTimeMs,
  });
});

// Perform operation
await convert(config);

// Clean up
unlisten();
```

### Error Handling Pattern

Structured error handling with type detection:

```typescript
try {
  await trim(config);
} catch (error) {
  const errorType = parseErrorType(String(error));

  switch (errorType) {
    case "FileNotFound":
      showError("File does not exist");
      break;
    case "PermissionDenied":
      await requestPermission();
      break;
    case "InsufficientStorage":
      await cleanupCache();
      showError("Not enough storage space");
      break;
    case "UnsupportedFormat":
      showError("Format not supported on this platform");
      break;
    default:
      showError(`Operation failed: ${error}`);
  }
}
```

### Android File Selection

Native file picker integration (Android only):

```typescript
// Android: Use native picker
const result = await selectMediaFile();
if (result.success) {
  setFilePath(result.filePath);
}

// Desktop/iOS: Use Tauri dialog
import { open } from "@tauri-apps/plugin-dialog";
const selected = await open({
  multiple: false,
  filters: [{ name: "Media", extensions: ["mp4", "mp3", "wav"] }],
});
```

## Technologies Used

- **Tauri 2.x** - Desktop/Mobile application framework
- **React 18** - UI library
- **TypeScript** - Type safety
- **Material UI 6** - Component library
- **Vite** - Build tool

## Platform-Specific Features

### Desktop (FFmpeg-based)

- Full format support (MP3, MP4, WAV, AAC, WebM, OGG, FLAC)
- Hardware acceleration
- Progress events
- Stream copy (fast trim without re-encoding)

### iOS (AVFoundation)

- Native formats (MP4, M4A, AAC)
- Limited format conversion (no WebM/OGG)
- Hardware acceleration
- Background audio playback

### Android (MediaCodec)

- Wide format support
- Native file picker integration
- Hardware acceleration
- Background playback with notification

## Features by Operation

### Media Info

- Duration, file size, format
- Audio: codec, bitrate, sample rate, channels
- Video: codec, bitrate, resolution, frame rate
- Detects media type (audio/video/unknown)

### Trim

- Cut to specific time range (milliseconds)
- Optional quality preservation (stream copy)
- Quality presets (low/medium/high/lossless)
- Progress monitoring

### Convert

- Change file format
- Quality presets for audio and video
- Codec selection
- Bitrate control

### Extract Audio

- Rip audio from video files
- Choose output format
- Quality presets
- Maintains original audio quality option

### Playback

- Play, pause, resume, stop controls
- Seek to any position
- Volume control (0.0-1.0)
- Real-time status monitoring
- Position tracking

## Learn More

- [tauri-plugin-media-toolkit Documentation](../../README.md)
- [Tauri Documentation](https://tauri.app/)
- [Material UI Documentation](https://mui.com/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [AVFoundation (iOS)](https://developer.apple.com/av-foundation/)
- [MediaCodec (Android)](https://developer.android.com/reference/android/media/MediaCodec)

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Troubleshooting

### File paths not working

**Desktop:** Use absolute paths

```typescript
const absolutePath = await resolve(relativePath);
```

**Mobile:**

- iOS: Copy files to Documents directory
- Android: Use `selectMediaFile()` which handles copying automatically

### Permission denied on mobile

**Android:**

```typescript
const perm = await requestPermission();
if (!perm.granted) {
  // Show permission rationale
}
```

**iOS:** Ensure Info.plist has required keys:

- `NSAppleMusicUsageDescription`
- `NSPhotoLibraryUsageDescription`

### Format not supported

**iOS Note:** WebM and OGG are not supported. Use:

- Video: MP4
- Audio: M4A, AAC, MP3

Check operation result for warnings:

```typescript
const result = await convert(config);
if (result.warning) {
  console.warn(result.warning);
}
```

### Operations taking too long

**Tips:**

- Use `preserveQuality: true` for trim (no re-encoding)
- Select lower quality presets for faster processing
- Monitor progress with `onProgress()` listener
- Show estimated time remaining to users
