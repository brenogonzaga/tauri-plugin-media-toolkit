import { useState, useEffect, useRef, ChangeEvent } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Slider,
  Stack,
  TextField,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Divider,
  Chip,
  SelectChangeEvent,
  Container,
  Paper,
  IconButton,
} from "@mui/material";
import {
  MdContentCut,
  MdSwapHoriz,
  MdAudiotrack,
  MdInfo,
  MdFileOpen,
  MdPlayArrow,
  MdPause,
  MdStop,
  MdVolumeUp,
} from "react-icons/md";
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

function App() {
  const [file, setFile] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Trim state
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(100);

  // Convert state
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp4");
  const [audioQuality, setAudioQuality] = useState<AudioQuality>("medium");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("medium");

  // Volume
  const [volume, setVolume] = useState(1.0);

  // Refs for HTML5 media player
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const statusInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll playback status
  useEffect(() => {
    statusInterval.current = setInterval(async () => {
      try {
        const status = await getPlaybackStatus();
        setPlaybackStatus(status);
      } catch {
        // Ignore errors
      }
    }, 500);

    return () => {
      if (statusInterval.current) {
        clearInterval(statusInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mediaInfo) {
      setEndTime(mediaInfo.duration);
    }
  }, [mediaInfo]);

  const handleSelectFile = async () => {
    try {
      setError(null);
      const result = await selectMediaFile();
      const selectedFile = result.filePath;
      console.log("Selected file path:", selectedFile);
      setFile(selectedFile);
      setSuccess(`Selected file: ${selectedFile}`);

      // Get media info
      const info = await getMediaInfo(selectedFile);
      setMediaInfo(info);

      // Set media URL for preview
      const url = convertFileSrc(selectedFile);
      console.log("Converted URL for preview:", url);
      setMediaUrl(url);
    } catch (err) {
      setError(`Failed to select file: ${err}`);
      console.error(err);
    }
  };

  const handleOpenDialog = async () => {
    try {
      setError(null);
      let selectedFile = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Media",
            extensions: ["mp4", "mp3", "wav", "mov", "avi", "webm"],
          },
        ],
      });

      if (selectedFile) {
        // For Desktop file paths, remove file:// and decode
        if (
          typeof selectedFile === "string" &&
          selectedFile.startsWith("file://")
        ) {
          selectedFile = selectedFile.replace("file://", "");
        }

        // Decode URI components (handle special characters and spaces)
        try {
          selectedFile = decodeURIComponent(selectedFile as string);
        } catch {
          // If decoding fails, use the original path
        }

        console.log("Selected file path:", selectedFile);
        setFile(selectedFile as string);
        setSuccess(`Selected file: ${selectedFile}`);

        // Get media info
        const info = await getMediaInfo(selectedFile as string);
        setMediaInfo(info);

        // Set media URL for preview
        const url = convertFileSrc(selectedFile as string);
        console.log("Converted URL for preview:", url);
        setMediaUrl(url);
        setMediaInfo(info);
      }
    } catch (err) {
      setError(`Failed to open file: ${err}`);
      console.error(err);
    }
  };

  const handleTrim = async () => {
    if (!file) {
      setError("No file selected");
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setProcessing(true);

      const outputPath = await save({
        defaultPath: `trimmed_${Date.now()}.${mediaInfo?.format || "mp4"}`,
        filters: [
          {
            name: "Media",
            extensions: [mediaInfo?.format || "mp4"],
          },
        ],
      });

      if (outputPath) {
        await trim(file, outputPath, startTime, endTime);
        setSuccess(`Trimmed video saved to: ${outputPath}`);
      }
    } catch (err) {
      setError(`Failed to trim: ${err}`);
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleConvert = async () => {
    if (!file) {
      setError("No file selected");
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setProcessing(true);

      const outputPath = await save({
        defaultPath: `converted_${Date.now()}.${outputFormat}`,
        filters: [
          {
            name: "Media",
            extensions: [outputFormat],
          },
        ],
      });

      if (outputPath) {
        await convert(file, outputPath, {
          format: outputFormat,
          audioQuality,
          videoQuality,
        });
        setSuccess(`Converted media saved to: ${outputPath}`);
      }
    } catch (err) {
      setError(`Failed to convert: ${err}`);
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleExtractAudio = async () => {
    if (!file) {
      setError("No file selected");
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setProcessing(true);

      const outputPath = await save({
        defaultPath: `audio_${Date.now()}.mp3`,
        filters: [
          {
            name: "Audio",
            extensions: ["mp3", "wav", "aac"],
          },
        ],
      });

      if (outputPath) {
        await extractAudio(file, outputPath, audioQuality);
        setSuccess(`Audio extracted to: ${outputPath}`);
      }
    } catch (err) {
      setError(`Failed to extract audio: ${err}`);
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const handlePlay = async () => {
    if (!file) {
      setError("No file selected");
      return;
    }

    try {
      setError(null);
      await play({ filePath: file, volume });
      setSuccess("Playback started (external FFplay)");
    } catch (err) {
      setError(`Playback failed: ${err}`);
      console.error(err);
    }
  };

  const handleStop = async () => {
    try {
      setError(null);
      await stop();
      setSuccess("Playback stopped");
    } catch (err) {
      setError(`Failed to stop: ${err}`);
      console.error(err);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, sm: 3, md: 4 } }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          mb: { xs: 2, sm: 3 },
          borderRadius: 2,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontSize: { xs: "1.5rem", sm: "2rem", md: "2.125rem" },
            fontWeight: 700,
            mb: 1,
          }}
        >
          ✂️ Media Editor Example
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontSize: { xs: "0.875rem", sm: "1rem" },
            opacity: 0.9,
            display: { xs: "none", sm: "block" },
          }}
        >
          Test the native Media Editor plugin functionality
        </Typography>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}

      {processing && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} />
            <Typography>Processing media...</Typography>
          </Box>
        </Alert>
      )}

      <Stack spacing={{ xs: 2, sm: 3 }}>
        {/* File Selection */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Select Media File
            </Typography>
            <Stack spacing={2}>
              <Button
                variant="contained"
                startIcon={<MdFileOpen />}
                onClick={handleSelectFile}
                fullWidth
                sx={{ minHeight: { xs: 48, sm: 44 } }}
              >
                Select File (Plugin)
              </Button>
              <Button
                variant="outlined"
                startIcon={<MdFileOpen />}
                onClick={handleOpenDialog}
                fullWidth
                sx={{ minHeight: { xs: 48, sm: 44 } }}
              >
                Select File (Dialog)
              </Button>
            </Stack>

            {file && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Selected file:
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    wordBreak: "break-all",
                    fontSize: { xs: "0.75rem", sm: "0.875rem" },
                  }}
                >
                  {file}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Media Info */}
        {mediaInfo && (
          <Card>
            <CardContent>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
              >
                <MdInfo />
                <Typography variant="h6">Media Information</Typography>
              </Box>

              <Stack spacing={1}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Format:
                  </Typography>
                  <Typography variant="body1">{mediaInfo.format}</Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Duration:
                  </Typography>
                  <Typography variant="body1">
                    {formatDuration(mediaInfo.duration)}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    File Size:
                  </Typography>
                  <Typography variant="body1">
                    {formatFileSize(mediaInfo.fileSize)}
                  </Typography>
                </Box>

                {mediaInfo.resolution && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Resolution:
                    </Typography>
                    <Typography variant="body1">
                      {mediaInfo.resolution.width}x{mediaInfo.resolution.height}
                    </Typography>
                  </Box>
                )}

                {mediaInfo.audioChannels && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Audio Channels:
                    </Typography>
                    <Typography variant="body1">
                      {mediaInfo.audioChannels}
                    </Typography>
                  </Box>
                )}

                {mediaInfo.sampleRate && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Sample Rate:
                    </Typography>
                    <Typography variant="body1">
                      {mediaInfo.sampleRate} Hz
                    </Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Media Preview */}
        {mediaUrl && mediaInfo && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <MdPlayArrow
                  style={{ verticalAlign: "middle", marginRight: 8 }}
                />
                Media Preview
              </Typography>
              {mediaInfo.mediaType === "video" ? (
                <Box sx={{ width: "100%", maxWidth: 640, mx: "auto" }}>
                  <video
                    ref={videoRef}
                    src={mediaUrl}
                    controls
                    muted={false}
                    playsInline
                    style={{ width: "100%", borderRadius: 8 }}
                    onLoadedMetadata={() => {
                      console.log("Video metadata loaded successfully", {
                        videoWidth: videoRef.current?.videoWidth,
                        videoHeight: videoRef.current?.videoHeight,
                        duration: videoRef.current?.duration,
                      });
                    }}
                    onCanPlay={() => {
                      console.log("Video can play - ready to start");
                    }}
                    onError={e => {
                      console.error("Video error:", e);
                      console.error("Video error details:", {
                        error: videoRef.current?.error,
                        networkState: videoRef.current?.networkState,
                        readyState: videoRef.current?.readyState,
                        src: mediaUrl,
                      });
                      setError(
                        `Failed to load video preview. Format: ${mediaInfo.format}. The format may not be supported by the browser.`
                      );
                    }}
                  />
                </Box>
              ) : mediaInfo.mediaType === "audio" ? (
                <Box sx={{ width: "100%", maxWidth: 640, mx: "auto" }}>
                  <audio
                    ref={audioRef}
                    src={mediaUrl}
                    controls
                    style={{ width: "100%" }}
                    onLoadedMetadata={() => {
                      console.log("Audio metadata loaded successfully", {
                        duration: audioRef.current?.duration,
                      });
                    }}
                    onCanPlay={() => {
                      console.log("Audio can play - ready to start");
                    }}
                    onError={e => {
                      console.error("Audio error:", e);
                      console.error("Audio error details:", {
                        error: audioRef.current?.error,
                        networkState: audioRef.current?.networkState,
                        readyState: audioRef.current?.readyState,
                        src: mediaUrl,
                        format: mediaInfo.format,
                      });
                      setError(
                        `Failed to load audio preview. Format: ${mediaInfo.format}. The format may not be supported by the browser.`
                      );
                    }}
                  />
                </Box>
              ) : (
                <Typography color="text.secondary">
                  Unknown media type - cannot preview
                </Typography>
              )}
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: "block" }}
              >
                Use the native HTML5 player above for preview. Some formats may
                not be supported by the browser.
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* External Playback */}
        {file && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <MdPlayArrow
                  style={{ verticalAlign: "middle", marginRight: 8 }}
                />
                External Playback (FFplay)
              </Typography>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Volume: {Math.round(volume * 100)}%
                  </Typography>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <MdVolumeUp />
                    <Slider
                      value={volume}
                      onChange={(_, value) => setVolume(value as number)}
                      min={0}
                      max={1}
                      step={0.1}
                      valueLabelDisplay="auto"
                      valueLabelFormat={value => `${Math.round(value * 100)}%`}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                </Box>

                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    startIcon={<MdPlayArrow />}
                    onClick={handlePlay}
                    disabled={processing || playbackStatus?.isPlaying}
                    fullWidth
                    sx={{ minHeight: { xs: 48, sm: 44 } }}
                  >
                    Play
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<MdStop />}
                    onClick={handleStop}
                    disabled={!playbackStatus?.isPlaying}
                    fullWidth
                    sx={{ minHeight: { xs: 48, sm: 44 } }}
                  >
                    Stop
                  </Button>
                </Stack>

                {playbackStatus && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      Status: {playbackStatus.isPlaying ? "Playing" : "Stopped"}
                    </Typography>
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Trim Controls */}
        {file && mediaInfo && (
          <Card>
            <CardContent>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
              >
                <MdContentCut />
                <Typography variant="h6">Trim Media</Typography>
              </Box>

              <Stack spacing={3}>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Start Time: {formatDuration(startTime)}
                  </Typography>
                  <Slider
                    value={startTime}
                    onChange={(_, value) => setStartTime(value as number)}
                    min={0}
                    max={mediaInfo?.duration || 100}
                    step={100}
                    valueLabelDisplay="auto"
                    valueLabelFormat={formatDuration}
                  />
                </Box>

                <Box>
                  <Typography variant="body2" gutterBottom>
                    End Time: {formatDuration(endTime)}
                  </Typography>
                  <Slider
                    value={endTime}
                    onChange={(_, value) => setEndTime(value as number)}
                    min={0}
                    max={mediaInfo?.duration || 100}
                    step={100}
                    valueLabelDisplay="auto"
                    valueLabelFormat={formatDuration}
                  />
                </Box>

                <Button
                  variant="contained"
                  onClick={handleTrim}
                  disabled={processing || endTime <= startTime}
                  fullWidth
                  sx={{ minHeight: { xs: 48, sm: 44 } }}
                >
                  Trim Media
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Convert Controls */}
        {file && (
          <Card>
            <CardContent>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
              >
                <MdSwapHoriz />
                <Typography variant="h6">Convert Format</Typography>
              </Box>

              <Stack spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Output Format</InputLabel>
                  <Select
                    value={outputFormat}
                    label="Output Format"
                    onChange={(e: SelectChangeEvent) =>
                      setOutputFormat(e.target.value as OutputFormat)
                    }
                  >
                    <MenuItem value="mp4">MP4</MenuItem>
                    <MenuItem value="webm">WebM</MenuItem>
                    <MenuItem value="mov">MOV</MenuItem>
                    <MenuItem value="avi">AVI</MenuItem>
                    <MenuItem value="mp3">MP3</MenuItem>
                    <MenuItem value="wav">WAV</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Audio Quality</InputLabel>
                  <Select
                    value={audioQuality}
                    label="Audio Quality"
                    onChange={(e: SelectChangeEvent) =>
                      setAudioQuality(e.target.value as AudioQuality)
                    }
                  >
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>

                {mediaInfo?.resolution && (
                  <FormControl fullWidth>
                    <InputLabel>Video Quality</InputLabel>
                    <Select
                      value={videoQuality}
                      label="Video Quality"
                      onChange={(e: SelectChangeEvent) =>
                        setVideoQuality(e.target.value as VideoQuality)
                      }
                    >
                      <MenuItem value="low">Low (480p)</MenuItem>
                      <MenuItem value="medium">Medium (720p)</MenuItem>
                      <MenuItem value="high">High (1080p)</MenuItem>
                    </Select>
                  </FormControl>
                )}

                <Button
                  variant="contained"
                  onClick={handleConvert}
                  disabled={processing}
                  fullWidth
                  sx={{ minHeight: { xs: 48, sm: 44 } }}
                >
                  Convert
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Extract Audio */}
        {file && mediaInfo?.resolution && (
          <Card>
            <CardContent>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
              >
                <MdAudiotrack />
                <Typography variant="h6">Extract Audio</Typography>
              </Box>

              <Stack spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Audio Quality</InputLabel>
                  <Select
                    value={audioQuality}
                    label="Audio Quality"
                    onChange={(e: SelectChangeEvent) =>
                      setAudioQuality(e.target.value as AudioQuality)
                    }
                  >
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  variant="contained"
                  onClick={handleExtractAudio}
                  disabled={processing}
                  fullWidth
                  sx={{ minHeight: { xs: 48, sm: 44 } }}
                >
                  Extract Audio
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

export default App;
