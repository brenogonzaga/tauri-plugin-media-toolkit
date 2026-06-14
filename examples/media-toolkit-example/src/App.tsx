import { useState, useEffect, useRef } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  selectMediaFile,
  getMediaInfo,
  trim,
  convert,
  extractAudio,
  play,
  stop,
  getPlaybackStatus,
  type MediaInfo,
  type OutputFormat,
  type AudioQuality,
  type VideoQuality,
  type PlaybackStatus,
} from "tauri-plugin-media-toolkit-api";
import "./App.css";

function formatDuration(ms: number) {
  if (!isFinite(ms) || ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripExt(p: string) {
  return p.replace(/\.[^/.]+$/, "");
}

const Chevron = () => (
  <svg className="select-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

function App() {
  const [file, setFile] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(100);

  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp4");
  const [audioQuality, setAudioQuality] = useState<AudioQuality>("medium");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("medium");
  const [volume, setVolume] = useState(1.0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const statusInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    statusInterval.current = setInterval(async () => {
      try { setPlaybackStatus(await getPlaybackStatus()); } catch { /* ignore */ }
    }, 500);
    return () => { if (statusInterval.current) clearInterval(statusInterval.current); };
  }, []);

  useEffect(() => {
    if (mediaInfo) setEndTime(mediaInfo.durationMs);
  }, [mediaInfo]);

  const loadFile = async (path: string) => {
    setFile(path);
    const info = await getMediaInfo(path);
    setMediaInfo(info);
    setMediaUrl(convertFileSrc(path));
  };

  const handleSelectFile = async () => {
    try {
      setError(null);
      const result = await selectMediaFile();
      await loadFile(result.filePath);
    } catch (err) {
      setError(`Failed to select file: ${err}`);
    }
  };

  const handleOpenDialog = async () => {
    try {
      setError(null);
      let selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Media", extensions: ["mp4", "mp3", "wav", "mov", "avi", "webm"] }],
      });
      if (!selected) return;
      if (typeof selected === "string" && selected.startsWith("file://")) {
        selected = selected.replace("file://", "");
      }
      try { selected = decodeURIComponent(selected as string); } catch { /* keep original */ }
      await loadFile(selected as string);
    } catch (err) {
      setError(`Failed to open file: ${err}`);
    }
  };

  const handleTrim = async () => {
    if (!file || !mediaInfo) return setError("No file selected");
    try {
      setError(null); setSuccess(null); setProcessing(true);
      const outputPath = await save({
        defaultPath: `trimmed_${Date.now()}.${mediaInfo.format}`,
        filters: [{ name: "Media", extensions: [mediaInfo.format] }],
      });
      if (outputPath) {
        const result = await trim({
          inputPath: file,
          outputPath: stripExt(outputPath),
          startMs: startTime,
          endMs: endTime,
        });
        setSuccess(`Trimmed file saved to: ${result.outputPath}`);
      }
    } catch (err) {
      setError(`Failed to trim: ${err}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleConvert = async () => {
    if (!file) return setError("No file selected");
    try {
      setError(null); setSuccess(null); setProcessing(true);
      const outputPath = await save({
        defaultPath: `converted_${Date.now()}.${outputFormat}`,
        filters: [{ name: "Media", extensions: [outputFormat] }],
      });
      if (outputPath) {
        const result = await convert({
          inputPath: file,
          outputPath: stripExt(outputPath),
          format: outputFormat,
          audioQuality,
          videoQuality,
        });
        setSuccess(`Converted file saved to: ${result.outputPath}`);
      }
    } catch (err) {
      setError(`Failed to convert: ${err}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleExtractAudio = async () => {
    if (!file) return setError("No file selected");
    try {
      setError(null); setSuccess(null); setProcessing(true);
      const outputPath = await save({
        defaultPath: `audio_${Date.now()}.mp3`,
        filters: [{ name: "Audio", extensions: ["mp3", "wav", "aac"] }],
      });
      if (outputPath) {
        const ext = outputPath.split(".").pop() as OutputFormat ?? "mp3";
        const result = await extractAudio({
          inputPath: file,
          outputPath: stripExt(outputPath),
          format: ext,
          audioQuality,
        });
        setSuccess(`Audio extracted to: ${result.outputPath}`);
      }
    } catch (err) {
      setError(`Failed to extract audio: ${err}`);
    } finally {
      setProcessing(false);
    }
  };

  const handlePlay = async () => {
    if (!file) return setError("No file selected");
    try {
      setError(null);
      await play({ filePath: file, volume });
    } catch (err) {
      setError(`Playback failed: ${err}`);
    }
  };

  const handleStop = async () => {
    try { setError(null); await stop(); } catch (err) { setError(`Failed to stop: ${err}`); }
  };

  const isPlaying = playbackStatus?.isPlaying ?? false;
  const isVideo = mediaInfo?.hasVideo ?? false;
  const isAudio = (mediaInfo?.hasAudio ?? false) && !isVideo;
  const duration = mediaInfo?.durationMs ?? 100;

  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <h1 className="header-title">Media Toolkit</h1>
          <p className="header-subtitle">Tauri Plugin — trim, convert, extract &amp; play</p>
        </div>
      </header>

      <main className="main">
        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
            <button className="alert-close" onClick={() => setError(null)}>×</button>
          </div>
        )}
        {success && (
          <div className="alert alert-success">
            <span>{success}</span>
            <button className="alert-close" onClick={() => setSuccess(null)}>×</button>
          </div>
        )}
        {processing && (
          <div className="alert alert-info">
            <span className="spinner spinner--dark" />
            <span>Processing media…</span>
          </div>
        )}

        {/* File selection */}
        <div className="card">
          <h2 className="card-title">Select Media File</h2>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleOpenDialog}>
              ↗ Select File
            </button>
            <div className="mobile-only-wrap">
              <button className="btn btn-secondary" onClick={handleSelectFile} disabled title="selectMediaFile() — mobile only">
                Select File (Plugin)
              </button>
              <span className="badge badge--mobile">Mobile only</span>
            </div>
          </div>
          {file && <p className="file-path">{file}</p>}
        </div>

        {/* Media info */}
        {mediaInfo && (
          <div className="card">
            <h2 className="card-title">Media Information</h2>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Format</span>
                <span className="info-value">{mediaInfo.format}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Duration</span>
                <span className="info-value">{formatDuration(mediaInfo.durationMs)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">File Size</span>
                <span className="info-value">{formatFileSize(mediaInfo.fileSize)}</span>
              </div>
              {mediaInfo.width && mediaInfo.height && (
                <div className="info-item">
                  <span className="info-label">Resolution</span>
                  <span className="info-value">{mediaInfo.width}×{mediaInfo.height}</span>
                </div>
              )}
              {mediaInfo.channels && (
                <div className="info-item">
                  <span className="info-label">Channels</span>
                  <span className="info-value">{mediaInfo.channels}</span>
                </div>
              )}
              {mediaInfo.sampleRate && (
                <div className="info-item">
                  <span className="info-label">Sample Rate</span>
                  <span className="info-value">{mediaInfo.sampleRate} Hz</span>
                </div>
              )}
              {mediaInfo.frameRate && (
                <div className="info-item">
                  <span className="info-label">Frame Rate</span>
                  <span className="info-value">{mediaInfo.frameRate} fps</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preview */}
        {mediaUrl && mediaInfo && (
          <div className="card">
            <h2 className="card-title">Preview</h2>
            {isVideo ? (
              <div className="media-preview">
                <video
                  ref={videoRef}
                  src={mediaUrl}
                  controls
                  playsInline
                  onError={() =>
                    setError(`Failed to load video preview. Format: ${mediaInfo.format}. The format may not be supported by the browser.`)
                  }
                />
              </div>
            ) : isAudio ? (
              <div className="media-preview">
                <audio
                  ref={audioRef}
                  src={mediaUrl}
                  controls
                  onError={() =>
                    setError(`Failed to load audio preview. Format: ${mediaInfo.format}. The format may not be supported by the browser.`)
                  }
                />
              </div>
            ) : (
              <p className="preview-hint">Unknown media type — cannot preview.</p>
            )}
            <p className="preview-hint">
              Native HTML5 preview. Some formats may not be supported by the browser.
            </p>
          </div>
        )}

        {/* External playback */}
        {file && (
          <div className="card">
            <h2 className="card-title">External Playback</h2>

            <div className="field">
              <div className="field-row">
                <label className="field-label">Volume</label>
                <span className="field-val">{Math.round(volume * 100)}%</span>
              </div>
              <div className="playback-vol">
                <span style={{ fontSize: 16, color: "var(--text-3)" }}>🔊</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="btn-row">
              <button className="btn btn-primary" onClick={handlePlay} disabled={processing || isPlaying}>
                ▶ Play
              </button>
              <button className="btn btn-secondary" onClick={handleStop} disabled={!isPlaying}>
                ■ Stop
              </button>
            </div>

            {playbackStatus && (
              <div className="playback-status">
                <span className={`status-dot${isPlaying ? " status-dot--playing" : ""}`} />
                {isPlaying ? "Playing" : "Stopped"}
              </div>
            )}
          </div>
        )}

        {/* Trim */}
        {file && mediaInfo && (
          <div className="card">
            <h2 className="card-title">Trim</h2>

            <div className="field">
              <div className="field-row">
                <label className="field-label">Start</label>
                <span className="field-val">{formatDuration(startTime)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={100}
                value={startTime}
                onChange={(e) => setStartTime(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <div className="field-row">
                <label className="field-label">End</label>
                <span className="field-val">{formatDuration(endTime)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={100}
                value={endTime}
                onChange={(e) => setEndTime(Number(e.target.value))}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={handleTrim}
              disabled={processing || endTime <= startTime}
            >
              {processing ? <span className="spinner" /> : "✂ Trim Media"}
            </button>
          </div>
        )}

        {/* Convert */}
        {file && (
          <div className="card">
            <h2 className="card-title">Convert Format</h2>

            <div className="field">
              <label className="field-label">Output Format</label>
              <div className="select-wrap">
                <select
                  className="select"
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                >
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV</option>
                  <option value="aac">AAC</option>
                  <option value="m4a">M4A</option>
                  <option value="ogg">OGG</option>
                  <option value="flac">FLAC</option>
                </select>
                <Chevron />
              </div>
            </div>

            <div className="field">
              <label className="field-label">Audio Quality</label>
              <div className="quality-group">
                {(["low", "medium", "high"] as AudioQuality[]).map((q) => (
                  <button
                    key={q}
                    className={`quality-btn${audioQuality === q ? " quality-btn--active" : ""}`}
                    onClick={() => setAudioQuality(q)}
                  >
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {mediaInfo?.hasVideo && (
              <div className="field">
                <label className="field-label">Video Quality</label>
                <div className="quality-group">
                  {([["low", "480p"], ["medium", "720p"], ["high", "1080p"]] as [VideoQuality, string][]).map(
                    ([q, label]) => (
                      <button
                        key={q}
                        className={`quality-btn${videoQuality === q ? " quality-btn--active" : ""}`}
                        onClick={() => setVideoQuality(q)}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}

            <button className="btn btn-primary" onClick={handleConvert} disabled={processing}>
              {processing ? <span className="spinner" /> : "↔ Convert"}
            </button>
          </div>
        )}

        {/* Extract Audio */}
        {file && mediaInfo?.hasVideo && (
          <div className="card">
            <h2 className="card-title">Extract Audio</h2>

            <div className="field">
              <label className="field-label">Audio Quality</label>
              <div className="quality-group">
                {(["low", "medium", "high"] as AudioQuality[]).map((q) => (
                  <button
                    key={q}
                    className={`quality-btn${audioQuality === q ? " quality-btn--active" : ""}`}
                    onClick={() => setAudioQuality(q)}
                  >
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary" onClick={handleExtractAudio} disabled={processing}>
              {processing ? <span className="spinner" /> : "♪ Extract Audio"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
