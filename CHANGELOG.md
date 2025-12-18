# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12

### Added

- Initial release of Media Editor plugin for Tauri 2.x
- Cross-platform support (Windows, macOS, Linux, iOS, Android)
- Media information retrieval (`getMediaInfo()`)
  - Duration, file size, codecs, bitrates
  - Audio: sample rate, channels
  - Video: resolution, frame rate
- Media trimming (`trim()`)
  - Cut to specific time ranges
  - Optional quality preservation (stream copy)
  - Audio/video quality presets
- Format conversion (`convert()`)
  - Support for MP3, MP4, WAV, AAC, M4A, WebM, OGG, FLAC
  - Quality presets: low, medium, high, lossless/original
- Audio extraction from video (`extractAudio()`)
- Media playback controls
  - `play()` - Start playback with volume control
  - `pause()` - Pause current playback
  - `resume()` - Resume paused playback
  - `stop()` - Stop and release resources
  - `seek()` - Jump to specific position
  - `setVolume()` - Adjust playback volume
  - `getPlaybackStatus()` - Real-time status monitoring
- TypeScript API with full type definitions
- Comprehensive documentation and examples

### Platform Implementation

#### Desktop (Windows, macOS, Linux)

- Native media APIs for processing
- Hardware acceleration support
- System codecs integration

#### Android

- MediaPlayer for playback
- MediaMetadataRetriever for metadata
- Native format support (MP3, AAC, MP4)

#### iOS

- AVFoundation framework
- AVPlayer for playback
- Native support for Apple formats (M4A, MP4)

### Quality Presets

#### Audio Quality

- Low: 96 kbps - Voice/Podcasts
- Medium: 192 kbps - General purpose
- High: 320 kbps - Music/High quality
- Lossless: Original - No re-encoding

#### Video Quality

- Low: 480p - Small file size
- Medium: 720p - Balanced
- High: 1080p - High quality
- Original: Unchanged - No re-encoding

### Requirements

- Tauri: 2.9+
- Rust: 1.77+
- Android SDK: 24+ (Android 7.0+)
- iOS: 14.0+
