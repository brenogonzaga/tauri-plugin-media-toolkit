package io.affex.media_editor

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Permission
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer

@InvokeArg
class GetMediaInfoArgs {
    var filePath: String = ""
}

@InvokeArg
class TrimConfig {
    var inputPath: String = ""
    var outputPath: String = ""
    var startMs: Long = 0
    var endMs: Long = 0
    var format: String? = null
    var audioQuality: String? = null
    var videoQuality: String? = null
    var preserveQuality: Boolean? = null
}

@InvokeArg
class ConvertConfig {
    var inputPath: String = ""
    var outputPath: String = ""
    var format: String = ""
    var audioQuality: String? = null
    var videoQuality: String? = null
}

@InvokeArg
class ExtractAudioConfig {
    var inputPath: String = ""
    var outputPath: String = ""
    var format: String = ""
    var audioQuality: String? = null
}

@InvokeArg
class PlayConfig {
    var filePath: String = ""
    var volume: Float? = null
}

@InvokeArg
class SeekConfig {
    var positionMs: Long = 0
}

@InvokeArg
class SetVolumeArgs {
    var volume: Float = 1.0f
}

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.READ_EXTERNAL_STORAGE], alias = "storage"),
        Permission(strings = [Manifest.permission.READ_MEDIA_VIDEO], alias = "video"),
        Permission(strings = [Manifest.permission.READ_MEDIA_AUDIO], alias = "audio")
    ]
)
class MediaEditorPlugin(private val activity: Activity) : Plugin(activity) {
    private var mediaPlayer: MediaPlayer? = null
    private var currentVolume: Float = 1.0f
    private var pendingPermissionInvoke: Invoke? = null

    companion object {
        private const val TAG = "MediaEditorPlugin"
        private const val PERMISSION_REQUEST_CODE = 2001
    }
    
    init {
        Log.d(TAG, "============================================")
        Log.d(TAG, "MediaEditorPlugin INIT")
        Log.d(TAG, "  Package: ${activity.packageName}")
        Log.d(TAG, "  Android SDK: ${Build.VERSION.SDK_INT}")
        Log.d(TAG, "  Cache dir: ${activity.cacheDir.absolutePath}")
        Log.d(TAG, "  Required permissions: ${getRequiredPermissions().joinToString()}")
        Log.d(TAG, "============================================")
    }
    
    /**
     * Check if media permissions are granted.
     * On Android 13+ (API 33), requires READ_MEDIA_VIDEO and READ_MEDIA_AUDIO.
     * On older versions, requires READ_EXTERNAL_STORAGE.
     */
    @Command
    fun checkPermission(invoke: Invoke) {
        Log.d(TAG, "checkPermission() CALLED")
        val granted = hasMediaPermissions()
        val canRequest = !granted && canRequestMediaPermissions()
        
        Log.d(TAG, "  Permissions granted: $granted")
        Log.d(TAG, "  Can request: $canRequest")
        getRequiredPermissions().forEach { perm ->
            val status = ContextCompat.checkSelfPermission(activity, perm)
            Log.d(TAG, "    $perm: ${if (status == PackageManager.PERMISSION_GRANTED) "GRANTED" else "DENIED"}")
        }
        
        val ret = JSObject()
        ret.put("granted", granted)
        ret.put("canRequest", canRequest)
        invoke.resolve(ret)
    }
    
    /**
     * Request media permissions from the user.
     * Waits for the user to respond before resolving.
     */
    @Command
    fun requestPermission(invoke: Invoke) {
        if (hasMediaPermissions()) {
            val ret = JSObject()
            ret.put("granted", true)
            ret.put("canRequest", false)
            invoke.resolve(ret)
            return
        }
        
        // Store invoke to resolve after user responds
        pendingPermissionInvoke = invoke
        
        val permissions = getRequiredPermissions()
        ActivityCompat.requestPermissions(activity, permissions, PERMISSION_REQUEST_CODE)
        // Don't resolve here - wait for onRequestPermissionsResult
    }
    
    /**
     * Handle permission request results.
     * Uses Tauri's PermissionState system instead of deprecated onRequestPermissionsResult.
     */
    @Deprecated("Use PermissionState from Tauri instead")
    private fun handlePermissionResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        
        if (requestCode == PERMISSION_REQUEST_CODE) {
            val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            
            pendingPermissionInvoke?.let { invoke ->
                val ret = JSObject()
                ret.put("granted", granted)
                ret.put("canRequest", !granted && canRequestMediaPermissions())
                invoke.resolve(ret)
                Log.i(TAG, "Permission request result: granted=$granted")
            }
            pendingPermissionInvoke = null
        }
    }
    
    /**
     * Check if all required media permissions are granted.
     */
    private fun hasMediaPermissions(): Boolean {
        return getRequiredPermissions().all {
            ContextCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED
        }
    }
    
    /**
     * Check if we can request permissions (not permanently denied).
     */
    private fun canRequestMediaPermissions(): Boolean {
        return getRequiredPermissions().any {
            !ActivityCompat.shouldShowRequestPermissionRationale(activity, it) ||
            ContextCompat.checkSelfPermission(activity, it) != PackageManager.PERMISSION_GRANTED
        }
    }
    
    /**
     * Get the required permissions based on Android version.
     */
    private fun getRequiredPermissions(): Array<String> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+ (API 33)
            arrayOf(
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_AUDIO
            )
        } else {
            // Android 12 and below
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }

    /**
     * Select a media file - returns the file path directly (copied to cache)
     * This is a better alternative to Tauri's dialog plugin for Android
     */
    @Command
    fun selectMediaFile(invoke: Invoke) {
        try {
            Log.d(TAG, "selectMediaFile: Opening file picker")
            
            activity.runOnUiThread {
                try {
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                            "video/*",
                            "audio/*"
                        ))
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    
                    startActivityForResult(invoke, intent, "onFilePickerResult")
                    Log.d(TAG, "selectMediaFile: File picker launched")
                } catch (e: Exception) {
                    Log.e(TAG, "Error opening file picker on UI thread", e)
                    invoke.reject("Failed to open file picker: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error opening file picker", e)
            invoke.reject("Failed to open file picker: ${e.message}")
        }
    }

    @ActivityCallback
    fun onFilePickerResult(invoke: Invoke, result: ActivityResult) {
        Log.d(TAG, "onFilePickerResult: resultCode=${result.resultCode}, data=${result.data}")
        
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            Log.d(TAG, "File selection cancelled or no data")
            invoke.reject("File selection cancelled")
            return
        }

        try {
            val uri = result.data?.data
            if (uri == null) {
                Log.e(TAG, "No URI in result data")
                invoke.reject("No file selected")
                return
            }

            Log.d(TAG, "File selected: $uri")
            
            // Copy to cache and return the path
            val filePath = resolveFilePath(uri.toString())
            Log.d(TAG, "File resolved to: $filePath")
            
            val result = JSObject()
            result.put("filePath", filePath)
            result.put("success", true)
            
            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error processing selected file", e)
            invoke.reject("Failed to process file: ${e.message}")
        }
    }

    /**
     * Convert Content URI to file path by copying to cache
     * This is the most reliable way to access files from content:// URIs
     * because it doesn't depend on temporary permissions
     */
    private fun resolveFilePath(uriString: String): String {
        // If already a file path, return it
        if (!uriString.startsWith("content://")) {
            return uriString
        }

        val uri = Uri.parse(uriString)
        Log.d(TAG, "Resolving Content URI: $uri")

        try {
            // Get filename from URI
            val fileName = getFileNameFromUri(uri) ?: "media_${System.currentTimeMillis()}"
            val cacheFile = File(activity.cacheDir, fileName)
            
            // Copy file to cache directory
            activity.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(cacheFile).use { output ->
                    input.copyTo(output)
                }
            } ?: throw Exception("Could not open input stream for URI")
            
            Log.d(TAG, "File copied to cache: ${cacheFile.absolutePath} (${cacheFile.length()} bytes)")
            return cacheFile.absolutePath
            
        } catch (e: Exception) {
            Log.e(TAG, "Error resolving URI: ${e.message}", e)
            throw Exception("Failed to access file: ${e.message}")
        }
    }

    /**
     * Get filename from Content URI
     */
    private fun getFileNameFromUri(uri: Uri): String? {
        var fileName: String? = null
        activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex != -1) {
                    fileName = cursor.getString(nameIndex)
                }
            }
        }
        return fileName
    }

    @Command
    fun getMediaInfo(invoke: Invoke) {
        val args = invoke.parseArgs(GetMediaInfoArgs::class.java)
        val originalPath = args.filePath

        Log.i(TAG, "============================================")
        Log.i(TAG, "getMediaInfo() CALLED")
        Log.d(TAG, "  Original path: $originalPath")

        try {
            // Resolve to file path (copies content:// URIs to cache)
            val filePath = resolveFilePath(originalPath)
            Log.d(TAG, "  Resolved path: $filePath")
            
            val file = File(filePath)
            
            if (!file.exists()) {
                Log.e(TAG, "  File not found: $filePath")
                invoke.reject("File not found: $filePath")
                return
            }
            
            Log.d(TAG, "  File exists: true, size: ${file.length()} bytes")
            
            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(filePath)
            Log.d(TAG, "  MediaMetadataRetriever initialized")

            val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            val hasVideo = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes"
            val hasAudio = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
            val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
            val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
            val bitrate = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toLongOrNull()
            val mimeType = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE) ?: "unknown"

            var frameRate: Double? = null
            if (hasVideo) {
                val frameRateStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)
                frameRate = frameRateStr?.toDoubleOrNull()
            }

            var sampleRate: Int? = null
            var channels: Int? = null
            var audioCodec: String? = null
            var videoCodec: String? = null

            val extractor = MediaExtractor()
            extractor.setDataSource(filePath)

            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue

                if (mime.startsWith("audio/")) {
                    audioCodec = mime.removePrefix("audio/")
                    sampleRate = format.getIntegerOrNull(MediaFormat.KEY_SAMPLE_RATE)
                    channels = format.getIntegerOrNull(MediaFormat.KEY_CHANNEL_COUNT)
                } else if (mime.startsWith("video/")) {
                    videoCodec = mime.removePrefix("video/")
                }
            }
            extractor.release()
            retriever.release()

            val mediaType = when {
                hasVideo -> "video"
                hasAudio -> "audio"
                else -> "unknown"
            }

            val fileSize = file.length()
            val format = file.extension.ifEmpty { 
                mimeType.split("/").lastOrNull() ?: "unknown"
            }

            val result = JSObject()
            result.put("path", originalPath)
            result.put("mediaType", mediaType)
            result.put("durationMs", durationMs)
            result.put("fileSize", fileSize)
            result.put("format", format)
            result.put("hasAudio", hasAudio)
            result.put("hasVideo", hasVideo)
            audioCodec?.let { result.put("audioCodec", it) }
            videoCodec?.let { result.put("videoCodec", it) }
            sampleRate?.let { result.put("sampleRate", it) }
            channels?.let { result.put("channels", it) }
            bitrate?.let { result.put("audioBitrate", it) }
            width?.let { result.put("width", it) }
            height?.let { result.put("height", it) }
            frameRate?.let { result.put("frameRate", it) }
            bitrate?.let { result.put("videoBitrate", it) }

            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting media info", e)
            invoke.reject("Failed to get media info: ${e.message}")
        }
    }

    @Command
    fun trim(invoke: Invoke) {
        val config = invoke.parseArgs(TrimConfig::class.java)

        Log.i(TAG, "============================================")
        Log.i(TAG, "trim() CALLED")
        Log.d(TAG, "  Input: ${config.inputPath}")
        Log.d(TAG, "  Output: ${config.outputPath}")
        Log.d(TAG, "  Range: ${config.startMs}ms - ${config.endMs}ms")
        Log.d(TAG, "  Format: ${config.format ?: "auto"}")
        Log.d(TAG, "  preserveQuality: ${config.preserveQuality}")

        try {
            
            // Validate time ranges
            if (config.startMs < 0) {
                invoke.reject("Invalid start time: cannot be negative")
                return
            }
            if (config.endMs < 0) {
                invoke.reject("Invalid end time: cannot be negative")
                return
            }
            if (config.startMs >= config.endMs) {
                invoke.reject("Invalid time range: start time must be less than end time")
                return
            }
            
            // Resolve content:// URI to file path (copies to cache if needed)
            val inputPath = resolveFilePath(config.inputPath)
            Log.d(TAG, "Resolved input path: $inputPath")
            
            val inputFile = File(inputPath)
            if (!inputFile.exists()) {
                invoke.reject("Input file not found: $inputPath")
                return
            }
            
            // Validate end time against file duration
            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(inputPath)
            val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            retriever.release()
            
            if (config.endMs > durationMs) {
                invoke.reject("Invalid end time: ${"%.2f".format(config.endMs / 1000.0)}s exceeds file duration of ${"%.2f".format(durationMs / 1000.0)}s")
                return
            }

            val outputFormat = config.format ?: inputFile.extension
            val outputPath = if (config.outputPath.endsWith(".$outputFormat")) {
                config.outputPath
            } else {
                "${config.outputPath}.$outputFormat"
            }
            val outputFile = File(outputPath)

            outputFile.parentFile?.mkdirs()

            val extractor = MediaExtractor()
            extractor.setDataSource(inputPath)

            val muxerFormat = when (outputFormat.lowercase()) {
                "mp4", "m4a", "aac" -> MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
                "webm" -> MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM
                "3gp" -> MediaMuxer.OutputFormat.MUXER_OUTPUT_3GPP
                else -> MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
            }

            val muxer = MediaMuxer(outputPath, muxerFormat)
            
            val trackIndexMap = mutableMapOf<Int, Int>()
            var hasVideoTrack = false
            var hasAudioTrack = false

            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue

                if (mime.startsWith("audio/")) {
                    hasAudioTrack = true
                    val newTrackIndex = muxer.addTrack(format)
                    trackIndexMap[i] = newTrackIndex
                } else if (mime.startsWith("video/")) {
                    hasVideoTrack = true
                    val newTrackIndex = muxer.addTrack(format)
                    trackIndexMap[i] = newTrackIndex
                }
            }

            if (trackIndexMap.isEmpty()) {
                extractor.release()
                muxer.release()
                invoke.reject("No valid tracks found in input file")
                return
            }

            muxer.start()

            val bufferSize = 1024 * 1024 // 1MB buffer
            val buffer = ByteBuffer.allocate(bufferSize)
            val bufferInfo = android.media.MediaCodec.BufferInfo()

            val startTimeUs = config.startMs * 1000
            val endTimeUs = config.endMs * 1000
            val totalDurationUs = endTimeUs - startTimeUs

            for ((extractorTrackIndex, muxerTrackIndex) in trackIndexMap) {
                extractor.selectTrack(extractorTrackIndex)
                extractor.seekTo(startTimeUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)

                var lastProgressEmitted = -1

                while (true) {
                    buffer.clear()
                    val sampleSize = extractor.readSampleData(buffer, 0)
                    
                    if (sampleSize < 0) break

                    val sampleTimeUs = extractor.sampleTime
                    if (sampleTimeUs > endTimeUs) break

                    if (sampleTimeUs >= startTimeUs) {
                        bufferInfo.offset = 0
                        bufferInfo.size = sampleSize
                        bufferInfo.presentationTimeUs = sampleTimeUs - startTimeUs
                        bufferInfo.flags = extractor.sampleFlags

                        muxer.writeSampleData(muxerTrackIndex, buffer, bufferInfo)
                        
                        // Emit progress event
                        if (totalDurationUs > 0) {
                            val progress = ((sampleTimeUs - startTimeUs) * 100 / totalDurationUs).toInt()
                            if (progress != lastProgressEmitted && progress <= 100) {
                                lastProgressEmitted = progress
                                val progressEvent = JSObject()
                                progressEvent.put("operation", "trim")
                                progressEvent.put("progress", progress)
                                trigger("progress", progressEvent)
                            }
                        }
                    }

                    if (!extractor.advance()) break
                }

                extractor.unselectTrack(extractorTrackIndex)
            }

            muxer.stop()
            muxer.release()
            extractor.release()

            val result = JSObject()
            result.put("success", true)
            result.put("outputPath", outputPath)
            result.put("durationMs", config.endMs - config.startMs)
            result.put("fileSize", outputFile.length())

            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error trimming media", e)
            invoke.reject("Failed to trim: ${e.message}")
        }
    }

    @Command
    fun convert(invoke: Invoke) {
        val config = invoke.parseArgs(ConvertConfig::class.java)

        Log.i(TAG, "============================================")
        Log.i(TAG, "convert() CALLED")
        Log.d(TAG, "  Input: ${config.inputPath}")
        Log.d(TAG, "  Output: ${config.outputPath}")
        Log.d(TAG, "  Format: ${config.format}")
        Log.d(TAG, "  Audio quality: ${config.audioQuality}")
        Log.d(TAG, "  Video quality: ${config.videoQuality}")

        try {
            
            // Resolve content:// URI to file path (copies to cache if needed)
            val inputPath = resolveFilePath(config.inputPath)
            Log.d(TAG, "Resolved input path: $inputPath")
            
            val inputFile = File(inputPath)
            if (!inputFile.exists()) {
                invoke.reject("Input file not found: $inputPath")
                return
            }

            val outputPath = if (config.outputPath.endsWith(".${config.format}")) {
                config.outputPath
            } else {
                "${config.outputPath}.${config.format}"
            }
            val outputFile = File(outputPath)
            outputFile.parentFile?.mkdirs()

            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(inputPath)
            val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            retriever.release()

            val extractor = MediaExtractor()
            extractor.setDataSource(inputPath)

            val muxerFormat = when (config.format.lowercase()) {
                "mp4", "m4a", "aac" -> MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
                "webm" -> MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM
                "3gp" -> MediaMuxer.OutputFormat.MUXER_OUTPUT_3GPP
                else -> MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
            }

            val muxer = MediaMuxer(outputPath, muxerFormat)
            val trackIndexMap = mutableMapOf<Int, Int>()

            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue

                if (mime.startsWith("audio/") || mime.startsWith("video/")) {
                    val newTrackIndex = muxer.addTrack(format)
                    trackIndexMap[i] = newTrackIndex
                }
            }

            muxer.start()

            val bufferSize = 1024 * 1024
            val buffer = ByteBuffer.allocate(bufferSize)
            val bufferInfo = android.media.MediaCodec.BufferInfo()
            val totalDurationUs = durationMs * 1000

            for ((extractorTrackIndex, muxerTrackIndex) in trackIndexMap) {
                extractor.selectTrack(extractorTrackIndex)
                extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC)

                var lastProgressEmitted = -1

                while (true) {
                    buffer.clear()
                    val sampleSize = extractor.readSampleData(buffer, 0)
                    if (sampleSize < 0) break

                    bufferInfo.offset = 0
                    bufferInfo.size = sampleSize
                    bufferInfo.presentationTimeUs = extractor.sampleTime
                    bufferInfo.flags = extractor.sampleFlags

                    muxer.writeSampleData(muxerTrackIndex, buffer, bufferInfo)

                    // Emit progress event
                    if (totalDurationUs > 0) {
                        val progress = (extractor.sampleTime * 100 / totalDurationUs).toInt()
                        if (progress != lastProgressEmitted && progress <= 100) {
                            lastProgressEmitted = progress
                            val progressEvent = JSObject()
                            progressEvent.put("operation", "convert")
                            progressEvent.put("progress", progress)
                            trigger("progress", progressEvent)
                        }
                    }

                    if (!extractor.advance()) break
                }

                extractor.unselectTrack(extractorTrackIndex)
            }

            muxer.stop()
            muxer.release()
            extractor.release()

            val result = JSObject()
            result.put("success", true)
            result.put("outputPath", outputPath)
            result.put("durationMs", durationMs)
            result.put("fileSize", outputFile.length())

            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error converting media", e)
            invoke.reject("Failed to convert: ${e.message}")
        }
    }

    @Command
    fun extractAudio(invoke: Invoke) {
        val config = invoke.parseArgs(ExtractAudioConfig::class.java)

        Log.i(TAG, "============================================")
        Log.i(TAG, "extractAudio() CALLED")
        Log.d(TAG, "  Input: ${config.inputPath}")
        Log.d(TAG, "  Output: ${config.outputPath}")
        Log.d(TAG, "  Format: ${config.format}")
        Log.d(TAG, "  Audio quality: ${config.audioQuality}")

        try {
            
            // Resolve content:// URI to file path (copies to cache if needed)
            val inputPath = resolveFilePath(config.inputPath)
            Log.d(TAG, "Resolved input path: $inputPath")
            
            val inputFile = File(inputPath)
            if (!inputFile.exists()) {
                invoke.reject("Input file not found: $inputPath")
                return
            }

            val outputPath = if (config.outputPath.endsWith(".${config.format}")) {
                config.outputPath
            } else {
                "${config.outputPath}.${config.format}"
            }
            val outputFile = File(outputPath)
            outputFile.parentFile?.mkdirs()

            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(inputPath)
            val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            retriever.release()

            val extractor = MediaExtractor()
            extractor.setDataSource(inputPath)

            var audioTrackIndex = -1
            var audioFormat: MediaFormat? = null

            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                if (mime.startsWith("audio/")) {
                    audioTrackIndex = i
                    audioFormat = format
                    break
                }
            }

            if (audioTrackIndex == -1 || audioFormat == null) {
                extractor.release()
                invoke.reject("No audio track found in input file")
                return
            }

            val muxerFormat = when (config.format.lowercase()) {
                "mp4", "m4a", "aac" -> MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
                "webm", "ogg" -> MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM
                else -> MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
            }

            val muxer = MediaMuxer(outputPath, muxerFormat)
            val muxerTrackIndex = muxer.addTrack(audioFormat)

            muxer.start()
            extractor.selectTrack(audioTrackIndex)
            extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC)

            val bufferSize = 1024 * 1024
            val buffer = ByteBuffer.allocate(bufferSize)
            val bufferInfo = android.media.MediaCodec.BufferInfo()
            val totalDurationUs = durationMs * 1000
            var lastProgressEmitted = -1

            while (true) {
                buffer.clear()
                val sampleSize = extractor.readSampleData(buffer, 0)
                if (sampleSize < 0) break

                bufferInfo.offset = 0
                bufferInfo.size = sampleSize
                bufferInfo.presentationTimeUs = extractor.sampleTime
                bufferInfo.flags = extractor.sampleFlags

                muxer.writeSampleData(muxerTrackIndex, buffer, bufferInfo)

                // Emit progress event
                if (totalDurationUs > 0) {
                    val progress = (extractor.sampleTime * 100 / totalDurationUs).toInt()
                    if (progress != lastProgressEmitted && progress <= 100) {
                        lastProgressEmitted = progress
                        val progressEvent = JSObject()
                        progressEvent.put("operation", "extractAudio")
                        progressEvent.put("progress", progress)
                        trigger("progress", progressEvent)
                    }
                }

                if (!extractor.advance()) break
            }

            muxer.stop()
            muxer.release()
            extractor.release()

            val result = JSObject()
            result.put("success", true)
            result.put("outputPath", outputPath)
            result.put("durationMs", durationMs)
            result.put("fileSize", outputFile.length())

            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error extracting audio", e)
            invoke.reject("Failed to extract audio: ${e.message}")
        }
    }

    @Command
    fun play(invoke: Invoke) {
        Log.i(TAG, "play() CALLED")
        try {
            val args = invoke.parseArgs(PlayConfig::class.java)
            Log.d(TAG, "  File: ${args.filePath}")
            Log.d(TAG, "  Volume: ${args.volume ?: currentVolume}")
            
            // Resolve content:// URI to file path (copies to cache if needed)
            val filePath = resolveFilePath(args.filePath)
            Log.d(TAG, "  Resolved path: $filePath")
            
            val file = File(filePath)
            if (!file.exists()) {
                Log.e(TAG, "  File not found: $filePath")
                invoke.reject("File not found: $filePath")
                return
            }
            
            mediaPlayer = MediaPlayer()
            mediaPlayer?.setDataSource(filePath)
            Log.d(TAG, "  MediaPlayer data source set")

            mediaPlayer?.prepare()
            Log.d(TAG, "  MediaPlayer prepared")
            
            val volume = args.volume ?: currentVolume
            currentVolume = volume
            mediaPlayer?.setVolume(volume, volume)
            
            mediaPlayer?.start()
            Log.i(TAG, "  Playback started")

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error playing media: ${e.message}", e)
            invoke.reject("Failed to play: ${e.message}")
        }
    }

    @Command
    fun pause(invoke: Invoke) {
        Log.i(TAG, "pause() CALLED")
        try {
            mediaPlayer?.pause()
            Log.d(TAG, "  MediaPlayer paused")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to pause: ${e.message}", e)
            invoke.reject("Failed to pause: ${e.message}")
        }
    }

    @Command
    fun resume(invoke: Invoke) {
        Log.i(TAG, "resume() CALLED")
        try {
            mediaPlayer?.start()
            Log.d(TAG, "  MediaPlayer resumed")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to resume: ${e.message}", e)
            invoke.reject("Failed to resume: ${e.message}")
        }
    }

    @Command
    fun stop(invoke: Invoke) {
        Log.i(TAG, "stop() CALLED")
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
            Log.d(TAG, "  MediaPlayer stopped and released")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop: ${e.message}", e)
            invoke.reject("Failed to stop: ${e.message}")
        }
    }

    @Command
    fun seek(invoke: Invoke) {
        val config = invoke.parseArgs(SeekConfig::class.java)
        Log.i(TAG, "seek() CALLED - position: ${config.positionMs}ms")

        try {
            mediaPlayer?.seekTo(config.positionMs.toInt())
            Log.d(TAG, "  Seeked to ${config.positionMs}ms")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to seek: ${e.message}", e)
            invoke.reject("Failed to seek: ${e.message}")
        }
    }

    @Command
    fun getPlaybackStatus(invoke: Invoke) {
        Log.d(TAG, "getPlaybackStatus() CALLED")
        try {
            val player = mediaPlayer
            
            val result = JSObject()
            if (player != null) {
                val isPlaying = try { player.isPlaying } catch (e: Exception) { false }
                val currentPos = player.currentPosition
                val duration = player.duration
                result.put("isPlaying", isPlaying)
                result.put("isPaused", !isPlaying && currentPos > 0)
                result.put("currentPositionMs", currentPos)
                result.put("durationMs", duration)
                result.put("volume", currentVolume)
                Log.d(TAG, "  Playing: $isPlaying, Position: ${currentPos}ms / ${duration}ms")
            } else {
                result.put("isPlaying", false)
                result.put("isPaused", false)
                result.put("currentPositionMs", 0)
                result.put("durationMs", 0)
                result.put("volume", currentVolume)
                Log.d(TAG, "  No active player")
            }

            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get playback status: ${e.message}", e)
            invoke.reject("Failed to get playback status: ${e.message}")
        }
    }

    @Command
    fun setVolume(invoke: Invoke) {
        val args = invoke.parseArgs(SetVolumeArgs::class.java)
        Log.i(TAG, "setVolume() CALLED - volume: ${args.volume}")

        try {
            currentVolume = args.volume.coerceIn(0f, 1f)
            mediaPlayer?.setVolume(currentVolume, currentVolume)
            Log.d(TAG, "  Volume set to $currentVolume")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set volume: ${e.message}", e)
            invoke.reject("Failed to set volume: ${e.message}")
        }
    }
    
    /**
     * Clean up old cached media files.
     * Removes files older than maxAgeMs (default 24 hours).
     */
    @Command
    fun cleanupCache(invoke: Invoke) {
        Log.i(TAG, "cleanupCache() CALLED")
        try {
            val maxAgeMs = 24 * 60 * 60 * 1000L // 24 hours
            val now = System.currentTimeMillis()
            var cleanedCount = 0
            var cleanedSize = 0L
            
            val files = activity.cacheDir.listFiles()
            Log.d(TAG, "  Cache dir: ${activity.cacheDir.absolutePath}")
            Log.d(TAG, "  Total files in cache: ${files?.size ?: 0}")
            
            files?.forEach { file ->
                val age = now - file.lastModified()
                if (file.isFile && age > maxAgeMs) {
                    val size = file.length()
                    Log.d(TAG, "  Deleting: ${file.name} (age: ${age / 1000 / 60}min, size: $size bytes)")
                    if (file.delete()) {
                        cleanedCount++
                        cleanedSize += size
                    }
                }
            }
            
            val ret = JSObject()
            ret.put("cleanedFiles", cleanedCount)
            ret.put("cleanedBytes", cleanedSize)
            invoke.resolve(ret)
            
            Log.i(TAG, "  Cache cleanup: removed $cleanedCount files ($cleanedSize bytes)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cleanup cache: ${e.message}", e)
            invoke.reject("Failed to cleanup cache: ${e.message}")
        }
    }

    override fun onDestroy() {
        Log.d(TAG, "onDestroy() CALLED")
        mediaPlayer?.release()
        mediaPlayer = null
        pendingPermissionInvoke = null
        Log.d(TAG, "  MediaPlayer released")
        super.onDestroy()
    }
}

// Helper extension function for MediaFormat
private fun MediaFormat.getIntegerOrNull(key: String): Int? {
    return try {
        getInteger(key)
    } catch (e: Exception) {
        null
    }
}
