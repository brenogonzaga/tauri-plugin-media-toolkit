import AVFoundation
import SwiftRs
import Tauri
import UIKit
import WebKit
import UniformTypeIdentifiers
import MobileCoreServices

// MARK: - Argument Classes

class GetMediaInfoArgs: Decodable {
    let filePath: String
}

class TrimConfig: Decodable {
    let inputPath: String
    let outputPath: String
    let startMs: Int64
    let endMs: Int64
    let format: String?
    let audioQuality: String?
    let videoQuality: String?
    let preserveQuality: Bool?
}

class ConvertConfig: Decodable {
    let inputPath: String
    let outputPath: String
    let format: String
    let audioQuality: String?
    let videoQuality: String?
}

class ExtractAudioConfig: Decodable {
    let inputPath: String
    let outputPath: String
    let format: String
    let audioQuality: String?
}

class PlayConfig: Decodable {
    let filePath: String
    let volume: Float?
}

class SeekConfig: Decodable {
    let positionMs: Int64
}

class SetVolumeArgs: Decodable {
    let volume: Float
}

// MARK: - Plugin Implementation

class MediaEditorPlugin: Plugin, UIDocumentPickerDelegate {
    private var audioPlayer: AVAudioPlayer?
    private var videoPlayer: AVPlayer?
    private var currentVolume: Float = 1.0
    private var isUsingVideoPlayer: Bool = false
    private var filePickerCompletion: ((URL?) -> Void)?
    
    override init() {
        super.init()
        NSLog("[MediaEditor] ============================================")
        NSLog("[MediaEditor] PLUGIN INIT")
        NSLog("[MediaEditor]   iOS Version: \(UIDevice.current.systemVersion)")
        NSLog("[MediaEditor]   Device: \(UIDevice.current.model)")
        NSLog("[MediaEditor] ============================================")
    }
    
    @objc public func getMediaInfo(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] ============================================")
        NSLog("[MediaEditor] getMediaInfo() CALLED")
        
        let args = try invoke.parseArgs(GetMediaInfoArgs.self)
        
        NSLog("[MediaEditor]   FilePath: \(args.filePath)")
        
        let url = URL(fileURLWithPath: args.filePath)
        
        guard FileManager.default.fileExists(atPath: args.filePath) else {
            NSLog("[MediaEditor] Error: File not found: \(args.filePath)")
            invoke.reject("File not found: \(args.filePath)")
            return
        }
        
        let asset = AVAsset(url: url)
        
        let fileAttributes = try FileManager.default.attributesOfItem(atPath: args.filePath)
        let fileSize = fileAttributes[.size] as? Int64 ?? 0
        
        let duration = CMTimeGetSeconds(asset.duration)
        // Validate duration before converting to Int64 to prevent crash with NaN/Infinity
        let durationMs: Int64
        if duration.isNaN || duration.isInfinite {
            durationMs = 0
        } else {
            durationMs = Int64(duration * 1000)
        }
        
        var mediaType = "unknown"
        var hasAudio = false
        var hasVideo = false
        var audioCodec: String?
        var videoCodec: String?
        var sampleRate: Int?
        var channels: Int?
        var audioBitrate: Int?
        var width: Int?
        var height: Int?
        var frameRate: Double?
        var videoBitrate: Int?
        
        let audioTracks = asset.tracks(withMediaType: .audio)
        if !audioTracks.isEmpty {
            hasAudio = true
            mediaType = "audio"
            
            if let audioTrack = audioTracks.first {
                if let formatDescriptions = audioTrack.formatDescriptions as? [CMFormatDescription],
                   let formatDesc = formatDescriptions.first {
                    let audioStreamBasicDescription = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)?.pointee
                    sampleRate = Int(audioStreamBasicDescription?.mSampleRate ?? 0)
                    channels = Int(audioStreamBasicDescription?.mChannelsPerFrame ?? 0)
                    
                    let fourCC = CMFormatDescriptionGetMediaSubType(formatDesc)
                    audioCodec = fourCCToString(fourCC)
                }
                
                audioBitrate = Int(audioTrack.estimatedDataRate)
            }
        }
        
        let videoTracks = asset.tracks(withMediaType: .video)
        if !videoTracks.isEmpty {
            hasVideo = true
            mediaType = "video"
            
            if let videoTrack = videoTracks.first {
                let size = videoTrack.naturalSize
                width = Int(size.width)
                height = Int(size.height)
                frameRate = Double(videoTrack.nominalFrameRate)
                videoBitrate = Int(videoTrack.estimatedDataRate)
                
                if let formatDescriptions = videoTrack.formatDescriptions as? [CMFormatDescription],
                   let formatDesc = formatDescriptions.first {
                    let fourCC = CMFormatDescriptionGetMediaSubType(formatDesc)
                    videoCodec = fourCCToString(fourCC)
                }
            }
        }
        
        let format = url.pathExtension.lowercased()
        
        var result: [String: Any] = [
            "path": args.filePath,
            "mediaType": mediaType,
            "durationMs": durationMs,
            "fileSize": fileSize,
            "format": format,
            "hasAudio": hasAudio,
            "hasVideo": hasVideo
        ]
        
        if let audioCodec = audioCodec { result["audioCodec"] = audioCodec }
        if let videoCodec = videoCodec { result["videoCodec"] = videoCodec }
        if let sampleRate = sampleRate { result["sampleRate"] = sampleRate }
        if let channels = channels { result["channels"] = channels }
        if let audioBitrate = audioBitrate { result["audioBitrate"] = audioBitrate }
        if let width = width { result["width"] = width }
        if let height = height { result["height"] = height }
        if let frameRate = frameRate { result["frameRate"] = frameRate }
        if let videoBitrate = videoBitrate { result["videoBitrate"] = videoBitrate }
        
        NSLog("[MediaEditor] Media info: type=\(mediaType), duration=\(durationMs)ms, size=\(fileSize) bytes")
        
        invoke.resolve(result)
    }
    
    @objc public func trim(_ invoke: Invoke) throws {
        let config = try invoke.parseArgs(TrimConfig.self)
        
        NSLog("[MediaEditor] Trim: input=\(config.inputPath), output=\(config.outputPath), start=\(config.startMs)ms, end=\(config.endMs)ms")
        
        // Validate time ranges first
        guard config.startMs >= 0 else {
            invoke.reject("Invalid start time: cannot be negative")
            return
        }
        guard config.endMs >= 0 else {
            invoke.reject("Invalid end time: cannot be negative")
            return
        }
        guard config.startMs < config.endMs else {
            invoke.reject("Invalid time range: start time must be less than end time")
            return
        }
        
        let inputUrl = URL(fileURLWithPath: config.inputPath)
        
        guard FileManager.default.fileExists(atPath: config.inputPath) else {
            NSLog("[MediaEditor] Error: Input file not found: \(config.inputPath)")
            invoke.reject("Input file not found: \(config.inputPath)")
            return
        }
        
        let outputFormat = config.format ?? inputUrl.pathExtension
        
        // iOS converts MP3/AAC to M4A, so adjust format
        let actualFormat: String
        if outputFormat.lowercased() == "mp3" || outputFormat.lowercased() == "aac" {
            actualFormat = "m4a"
            NSLog("[MediaEditor] Format \(outputFormat) not supported for export, converting to m4a")
        } else {
            actualFormat = outputFormat
        }
        
        var outputPath = config.outputPath
        
        NSLog("[MediaEditor] Output format: \(outputFormat) -> actual: \(actualFormat)")
        NSLog("[MediaEditor] Output path before: \(outputPath)")
        
        // Remove file:// scheme if present
        if outputPath.hasPrefix("file://") {
            outputPath = String(outputPath.dropFirst(7)) // Remove "file://"
            NSLog("[MediaEditor] Removed file:// scheme: \(outputPath)")
        }
        
        // Decode URI components (spaces, special chars)
        if let decodedPath = outputPath.removingPercentEncoding {
            outputPath = decodedPath
            NSLog("[MediaEditor] Decoded URI: \(outputPath)")
        }
        
        // Remove existing extension and add correct one
        let url = URL(fileURLWithPath: outputPath)
        let pathWithoutExt = url.deletingPathExtension().path
        outputPath = "\(pathWithoutExt).\(actualFormat)"
        NSLog("[MediaEditor] Output path with extension: \(outputPath)")
        
        // Ensure absolute path for iOS
        if !outputPath.hasPrefix("/") {
            let tempDir = FileManager.default.temporaryDirectory.path
            outputPath = "\(tempDir)/\(outputPath)"
            NSLog("[MediaEditor] Converted to absolute path: \(outputPath)")
        }
        
        let outputUrl = URL(fileURLWithPath: outputPath)
        
        let directory = outputUrl.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        
        try? FileManager.default.removeItem(at: outputUrl)
        
        let asset = AVAsset(url: inputUrl)
        
        // Validate time range
        let assetDuration = CMTimeGetSeconds(asset.duration)
        NSLog("[MediaEditor] Asset duration: \(assetDuration) seconds")
        
        guard !assetDuration.isNaN && !assetDuration.isInfinite && assetDuration > 0 else {
            NSLog("[MediaEditor] Error: Invalid duration - isNaN: \(assetDuration.isNaN), isInfinite: \(assetDuration.isInfinite)")
            invoke.reject("Invalid or corrupted media file: cannot determine duration")
            return
        }
        
        // Validate end time against file duration
        let endTimeSeconds = Double(config.endMs) / 1000.0
        if endTimeSeconds > assetDuration {
            invoke.reject("Invalid end time: \(String(format: "%.2f", endTimeSeconds))s exceeds file duration of \(String(format: "%.2f", assetDuration))s")
            return
        }
        
        let startTime = CMTime(value: config.startMs, timescale: 1000)
        let endTime = CMTime(value: config.endMs, timescale: 1000)
        let timeRange = CMTimeRange(start: startTime, end: endTime)
        
        // Validate time range
        guard CMTimeCompare(startTime, endTime) < 0 else {
            invoke.reject("Invalid time range: start time must be before end time")
            return
        }
        
        guard let fileType = getAVFileType(for: actualFormat) else {
            invoke.reject("Unsupported output format: \(actualFormat). iOS supports: mp4, m4v, m4a, mov, wav, aiff, caf")
            return
        }
        
        // Use appropriate preset based on format
        let preset: String
        let audioFormats = ["m4a", "wav", "aiff", "caf"]
        if audioFormats.contains(actualFormat.lowercased()) {
            preset = AVAssetExportPresetAppleM4A
        } else {
            preset = AVAssetExportPresetPassthrough
        }
        
        NSLog("[MediaEditor] Creating export session with preset: \(preset)")
        NSLog("[MediaEditor] File type: \(fileType.rawValue)")
        
        guard let exportSession = AVAssetExportSession(asset: asset, presetName: preset) else {
            NSLog("[MediaEditor] Error: Failed to create export session for format: \(actualFormat)")
            invoke.reject("Failed to create export session for format: \(actualFormat)")
            return
        }
        
        exportSession.outputURL = outputUrl
        exportSession.outputFileType = fileType
        exportSession.timeRange = timeRange
        
        NSLog("[MediaEditor] Starting export to: \(outputPath)")
        
        // Capture output path for completion handler
        let finalOutputPath = outputPath
        let expectedDuration = config.endMs - config.startMs
        
        // Setup progress monitoring timer
        var progressTimer: Timer?
        progressTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            let progress = exportSession.progress * 100
            NSLog("[MediaEditor] Trim progress: \(progress)%")
            self?.trigger("progress", data: [
                "operation": "trim",
                "progress": Int(progress)
            ] as JSObject)
            
            // Stop timer when complete
            if exportSession.progress >= 1.0 || exportSession.status != .exporting {
                timer.invalidate()
            }
        }
        
        // Use async export without blocking - completion handler will resolve/reject
        exportSession.exportAsynchronously { [weak self] in
            DispatchQueue.main.async {
                // Stop progress timer
                progressTimer?.invalidate()
                progressTimer = nil
                
                NSLog("[MediaEditor] Export completed with status: \(exportSession.status.rawValue)")
                
                switch exportSession.status {
                case .completed:
                    // Verify output file exists and has content
                    guard FileManager.default.fileExists(atPath: finalOutputPath) else {
                        NSLog("[MediaEditor] Error: Output file not found at: \(finalOutputPath)")
                        invoke.reject("Output file was not created at: \(finalOutputPath)")
                        return
                    }
                    
                    let fileAttributes = try? FileManager.default.attributesOfItem(atPath: finalOutputPath)
                    let fileSize = fileAttributes?[.size] as? Int64 ?? 0
                    
                    NSLog("[MediaEditor] Output file size: \(fileSize) bytes")
                    
                    if fileSize == 0 {
                        NSLog("[MediaEditor] Error: Output file is empty")
                        invoke.reject("Output file is empty (0 bytes)")
                        return
                    }
                    
                    NSLog("[MediaEditor] Trim completed successfully: \(finalOutputPath) (\(fileSize) bytes)")
                    
                    invoke.resolve([
                        "success": true,
                        "outputPath": finalOutputPath,
                        "durationMs": expectedDuration,
                        "fileSize": fileSize
                    ])
                    
                case .failed:
                    let errorMsg = exportSession.error?.localizedDescription ?? "Unknown error"
                    NSLog("[MediaEditor] Error: Export failed - \(errorMsg)")
                    if let error = exportSession.error {
                        NSLog("[MediaEditor] Error details: \(error)")
                    }
                    invoke.reject("Export failed: \(errorMsg)")
                    
                case .cancelled:
                    NSLog("[MediaEditor] Export was cancelled")
                    invoke.reject("Export was cancelled")
                    
                default:
                    NSLog("[MediaEditor] Error: Export status not completed: \(exportSession.status.rawValue)")
                    invoke.reject("Export did not complete successfully. Status: \(exportSession.status.rawValue)")
                }
            }
        }
    }
    
    @objc public func convert(_ invoke: Invoke) throws {
        let config = try invoke.parseArgs(ConvertConfig.self)
        
        NSLog("[MediaEditor] Convert: input=\(config.inputPath), output=\(config.outputPath), format=\(config.format)")
        
        let inputUrl = URL(fileURLWithPath: config.inputPath)
        
        guard FileManager.default.fileExists(atPath: config.inputPath) else {
            NSLog("[MediaEditor] Error: Input file not found: \(config.inputPath)")
            invoke.reject("Input file not found: \(config.inputPath)")
            return
        }
        
        // iOS converts MP3/AAC to M4A - track warning for response
        let actualFormat: String
        var formatWarning: String? = nil
        if config.format.lowercased() == "mp3" || config.format.lowercased() == "aac" {
            actualFormat = "m4a"
            formatWarning = "iOS does not support direct \(config.format.uppercased()) export. Converted to M4A (AAC) format instead."
            NSLog("[MediaEditor] Format \(config.format) not supported for export, converting to m4a")
        } else {
            actualFormat = config.format
        }
        
        var outputPath = config.outputPath
        
        NSLog("[MediaEditor] Output format: \(config.format) -> actual: \(actualFormat)")
        NSLog("[MediaEditor] Output path before: \(outputPath)")
        
        // Remove file:// scheme if present
        if outputPath.hasPrefix("file://") {
            outputPath = String(outputPath.dropFirst(7))
            NSLog("[MediaEditor] Removed file:// scheme: \(outputPath)")
        }
        
        // Decode URI components
        if let decodedPath = outputPath.removingPercentEncoding {
            outputPath = decodedPath
            NSLog("[MediaEditor] Decoded URI: \(outputPath)")
        }
        
        // Remove existing extension and add correct one
        let urlForPath = URL(fileURLWithPath: outputPath)
        let pathWithoutExt = urlForPath.deletingPathExtension().path
        outputPath = "\(pathWithoutExt).\(actualFormat)"
        NSLog("[MediaEditor] Output path with extension: \(outputPath)")
        
        // Ensure absolute path for iOS
        if !outputPath.hasPrefix("/") {
            let tempDir = FileManager.default.temporaryDirectory.path
            outputPath = "\(tempDir)/\(outputPath)"
            NSLog("[MediaEditor] Converted to absolute path: \(outputPath)")
        }
        
        let outputUrl = URL(fileURLWithPath: outputPath)
        
        let directory = outputUrl.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        
        try? FileManager.default.removeItem(at: outputUrl)
        
        let asset = AVAsset(url: inputUrl)
        let duration = CMTimeGetSeconds(asset.duration)
        
        NSLog("[MediaEditor] Asset duration: \(duration) seconds")
        
        let durationMs: Int64
        if duration.isNaN || duration.isInfinite {
            NSLog("[MediaEditor] Warning: Invalid duration, using 0")
            durationMs = 0
        } else {
            durationMs = Int64(duration * 1000)
        }
        
        guard let fileType = getAVFileType(for: actualFormat) else {
            NSLog("[MediaEditor] Error: Unsupported format: \(actualFormat)")
            invoke.reject("Unsupported output format: \(actualFormat). iOS supports: mp4, m4v, m4a, mov, wav, aiff, caf")
            return
        }
        
        let preset = getExportPreset(for: actualFormat, audioQuality: config.audioQuality, videoQuality: config.videoQuality)
        
        NSLog("[MediaEditor] Creating export session with preset: \(preset)")
        NSLog("[MediaEditor] File type: \(fileType.rawValue)")
        
        guard let exportSession = AVAssetExportSession(asset: asset, presetName: preset) else {
            NSLog("[MediaEditor] Error: Failed to create export session")
            invoke.reject("Failed to create export session")
            return
        }
        
        exportSession.outputURL = outputUrl
        exportSession.outputFileType = fileType
        
        NSLog("[MediaEditor] Starting export to: \(outputPath)")
        
        // Capture values for completion handler
        let finalOutputPath = outputPath
        let finalDurationMs = durationMs
        
        // Setup progress monitoring timer for convert
        var progressTimerConvert: Timer?
        progressTimerConvert = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            let progress = exportSession.progress * 100
            NSLog("[MediaEditor] Convert progress: \(progress)%")
            self?.trigger("progress", data: [
                "operation": "convert",
                "progress": Int(progress)
            ] as JSObject)
            
            if exportSession.progress >= 1.0 || exportSession.status != .exporting {
                timer.invalidate()
            }
        }
        
        // Use async export without blocking
        exportSession.exportAsynchronously { [weak self] in
            DispatchQueue.main.async {
                // Stop progress timer
                progressTimerConvert?.invalidate()
                progressTimerConvert = nil
                
                NSLog("[MediaEditor] Export completed with status: \(exportSession.status.rawValue)")
                
                switch exportSession.status {
                case .completed:
                    guard FileManager.default.fileExists(atPath: finalOutputPath) else {
                        NSLog("[MediaEditor] Error: Output file not found at: \(finalOutputPath)")
                        invoke.reject("Output file was not created at: \(finalOutputPath)")
                        return
                    }
                    
                    let fileAttributes = try? FileManager.default.attributesOfItem(atPath: finalOutputPath)
                    let fileSize = fileAttributes?[.size] as? Int64 ?? 0
                    
                    NSLog("[MediaEditor] Output file size: \(fileSize) bytes")
                    
                    if fileSize == 0 {
                        NSLog("[MediaEditor] Error: Output file is empty")
                        invoke.reject("Output file is empty (0 bytes)")
                        return
                    }
                    
                    NSLog("[MediaEditor] Convert completed successfully: \(finalOutputPath) (\(fileSize) bytes)")
                    
                    var response: JSObject = [
                        "success": true,
                        "outputPath": finalOutputPath,
                        "durationMs": Double(finalDurationMs),
                        "fileSize": Double(fileSize)
                    ]
                    
                    if let warning = formatWarning {
                        response["warning"] = warning
                    }
                    
                    invoke.resolve(response)
                    
                case .failed:
                    let errorMsg = exportSession.error?.localizedDescription ?? "Unknown error"
                    NSLog("[MediaEditor] Error: Export failed - \(errorMsg)")
                    if let error = exportSession.error {
                        NSLog("[MediaEditor] Error details: \(error)")
                    }
                    invoke.reject("Export failed: \(errorMsg)")
                    
                case .cancelled:
                    NSLog("[MediaEditor] Export was cancelled")
                    invoke.reject("Export was cancelled")
                    
                default:
                    NSLog("[MediaEditor] Error: Export status not completed: \(exportSession.status.rawValue)")
                    invoke.reject("Export did not complete successfully. Status: \(exportSession.status.rawValue)")
                }
            }
        }
    }
    
    @objc public func extractAudio(_ invoke: Invoke) throws {
        let config = try invoke.parseArgs(ExtractAudioConfig.self)
        
        NSLog("[MediaEditor] ExtractAudio: input=\(config.inputPath), output=\(config.outputPath), format=\(config.format)")
        
        let inputUrl = URL(fileURLWithPath: config.inputPath)
        
        guard FileManager.default.fileExists(atPath: config.inputPath) else {
            NSLog("[MediaEditor] Error: Input file not found: \(config.inputPath)")
            invoke.reject("Input file not found: \(config.inputPath)")
            return
        }
        
        // iOS converts MP3/AAC to M4A - track warning for response
        let actualFormat: String
        var formatWarning: String? = nil
        if config.format.lowercased() == "mp3" || config.format.lowercased() == "aac" {
            actualFormat = "m4a"
            formatWarning = "iOS does not support direct \(config.format.uppercased()) export. Extracted to M4A (AAC) format instead."
            NSLog("[MediaEditor] Format \(config.format) not supported for export, converting to m4a")
        } else {
            actualFormat = config.format
        }
        
        var outputPath = config.outputPath
        
        NSLog("[MediaEditor] Output format: \(config.format) -> actual: \(actualFormat)")
        NSLog("[MediaEditor] Output path before: \(outputPath)")
        
        // Remove file:// scheme if present
        if outputPath.hasPrefix("file://") {
            outputPath = String(outputPath.dropFirst(7))
            NSLog("[MediaEditor] Removed file:// scheme: \(outputPath)")
        }
        
        // Decode URI components
        if let decodedPath = outputPath.removingPercentEncoding {
            outputPath = decodedPath
            NSLog("[MediaEditor] Decoded URI: \(outputPath)")
        }
        
        // Remove existing extension and add correct one
        let urlForPath = URL(fileURLWithPath: outputPath)
        let pathWithoutExt = urlForPath.deletingPathExtension().path
        outputPath = "\(pathWithoutExt).\(actualFormat)"
        NSLog("[MediaEditor] Output path with extension: \(outputPath)")
        
        // Ensure absolute path for iOS
        if !outputPath.hasPrefix("/") {
            let tempDir = FileManager.default.temporaryDirectory.path
            outputPath = "\(tempDir)/\(outputPath)"
            NSLog("[MediaEditor] Converted to absolute path: \(outputPath)")
        }
        
        let outputUrl = URL(fileURLWithPath: outputPath)
        
        let directory = outputUrl.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        
        try? FileManager.default.removeItem(at: outputUrl)
        
        guard let fileType = getAVFileType(for: actualFormat) else {
            NSLog("[MediaEditor] Error: Unsupported format: \(actualFormat)")
            invoke.reject("Unsupported output format: \(actualFormat). iOS supports: m4a, wav, aiff, caf for audio")
            return
        }
        
        let asset = AVAsset(url: inputUrl)
        
        let audioTracks = asset.tracks(withMediaType: .audio)
        guard !audioTracks.isEmpty else {
            NSLog("[MediaEditor] Error: No audio track found")
            invoke.reject("No audio track found in input file")
            return
        }
        
        let duration = CMTimeGetSeconds(asset.duration)
        
        NSLog("[MediaEditor] Asset duration: \(duration) seconds")
        
        let durationMs: Int64
        if duration.isNaN || duration.isInfinite {
            NSLog("[MediaEditor] Warning: Invalid duration, using 0")
            durationMs = 0
        } else {
            durationMs = Int64(duration * 1000)
        }
        
        NSLog("[MediaEditor] Creating export session with preset: AVAssetExportPresetAppleM4A")
        NSLog("[MediaEditor] File type: \(fileType.rawValue)")
        
        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            NSLog("[MediaEditor] Error: Failed to create export session")
            invoke.reject("Failed to create export session")
            return
        }
        
        exportSession.outputURL = outputUrl
        exportSession.outputFileType = fileType
        
        NSLog("[MediaEditor] Starting export to: \(outputPath)")
        
        // Capture values for completion handler
        let finalOutputPath = outputPath
        let finalDurationMs = durationMs
        
        // Setup progress monitoring timer for extractAudio
        var progressTimerExtract: Timer?
        progressTimerExtract = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            let progress = exportSession.progress * 100
            NSLog("[MediaEditor] ExtractAudio progress: \(progress)%")
            self?.trigger("progress", data: [
                "operation": "extractAudio",
                "progress": Int(progress)
            ] as JSObject)
            
            if exportSession.progress >= 1.0 || exportSession.status != .exporting {
                timer.invalidate()
            }
        }
        
        // Use async export without blocking
        exportSession.exportAsynchronously { [weak self] in
            DispatchQueue.main.async {
                // Stop progress timer
                progressTimerExtract?.invalidate()
                progressTimerExtract = nil
                
                NSLog("[MediaEditor] Export completed with status: \(exportSession.status.rawValue)")
                
                switch exportSession.status {
                case .completed:
                    guard FileManager.default.fileExists(atPath: finalOutputPath) else {
                        NSLog("[MediaEditor] Error: Output file not found at: \(finalOutputPath)")
                        invoke.reject("Output file was not created at: \(finalOutputPath)")
                        return
                    }
                    
                    let fileAttributes = try? FileManager.default.attributesOfItem(atPath: finalOutputPath)
                    let fileSize = fileAttributes?[.size] as? Int64 ?? 0
                    
                    NSLog("[MediaEditor] Output file size: \(fileSize) bytes")
                    
                    if fileSize == 0 {
                        NSLog("[MediaEditor] Error: Output file is empty")
                        invoke.reject("Output file is empty (0 bytes)")
                        return
                    }
                    
                    NSLog("[MediaEditor] ExtractAudio completed successfully: \(finalOutputPath) (\(fileSize) bytes)")
                    
                    var response: JSObject = [
                        "success": true,
                        "outputPath": finalOutputPath,
                        "durationMs": Double(finalDurationMs),
                        "fileSize": Double(fileSize)
                    ]
                    
                    if let warning = formatWarning {
                        response["warning"] = warning
                    }
                    
                    invoke.resolve(response)
                    
                case .failed:
                    let errorMsg = exportSession.error?.localizedDescription ?? "Unknown error"
                    NSLog("[MediaEditor] Error: Export failed - \(errorMsg)")
                    if let error = exportSession.error {
                        NSLog("[MediaEditor] Error details: \(error)")
                    }
                    invoke.reject("Export failed: \(errorMsg)")
                    
                case .cancelled:
                    NSLog("[MediaEditor] Export was cancelled")
                    invoke.reject("Export was cancelled")
                    
                default:
                    NSLog("[MediaEditor] Error: Export status not completed: \(exportSession.status.rawValue)")
                    invoke.reject("Export did not complete successfully. Status: \(exportSession.status.rawValue)")
                }
            }
        }
    }
    
    @objc public func play(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] ============================================")
        NSLog("[MediaEditor] play() CALLED")
        
        let config = try invoke.parseArgs(PlayConfig.self)
        NSLog("[MediaEditor]   FilePath: \(config.filePath)")
        NSLog("[MediaEditor]   Volume: \(config.volume ?? currentVolume)")
        
        guard FileManager.default.fileExists(atPath: config.filePath) else {
            NSLog("[MediaEditor]   ERROR: File not found")
            invoke.reject("File not found: \(config.filePath)")
            return
        }
        
        stopPlayback()
        NSLog("[MediaEditor]   Previous playback stopped")
        
        let url = URL(fileURLWithPath: config.filePath)
        let volume = config.volume ?? currentVolume
        currentVolume = volume
        
        let asset = AVAsset(url: url)
        let videoTracks = asset.tracks(withMediaType: .video)
        NSLog("[MediaEditor]   Video tracks: \(videoTracks.count)")
        
        if videoTracks.isEmpty {
            NSLog("[MediaEditor]   Using AVAudioPlayer")
            do {
                audioPlayer = try AVAudioPlayer(contentsOf: url)
                audioPlayer?.volume = volume
                audioPlayer?.play()
                isUsingVideoPlayer = false
                NSLog("[MediaEditor]   Audio playback started")
            } catch {
                NSLog("[MediaEditor]   ERROR: \(error.localizedDescription)")
                invoke.reject("Failed to play audio: \(error.localizedDescription)")
                return
            }
        } else {
            NSLog("[MediaEditor]   Using AVPlayer")
            let playerItem = AVPlayerItem(url: url)
            videoPlayer = AVPlayer(playerItem: playerItem)
            videoPlayer?.volume = volume
            videoPlayer?.play()
            isUsingVideoPlayer = true
            NSLog("[MediaEditor]   Video playback started")
        }
        
        invoke.resolve([:])
    }
    
    @objc public func pause(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] pause() CALLED - isUsingVideoPlayer: \(isUsingVideoPlayer)")
        if isUsingVideoPlayer {
            videoPlayer?.pause()
        } else {
            audioPlayer?.pause()
        }
        NSLog("[MediaEditor]   Paused")
        invoke.resolve([:])
    }
    
    @objc public func resume(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] resume() CALLED - isUsingVideoPlayer: \(isUsingVideoPlayer)")
        if isUsingVideoPlayer {
            videoPlayer?.play()
        } else {
            audioPlayer?.play()
        }
        NSLog("[MediaEditor]   Resumed")
        invoke.resolve([:])
    }
    
    @objc public func stop(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] stop() CALLED")
        stopPlayback()
        NSLog("[MediaEditor]   Stopped")
        // Resolve with no payload (Unit) to match the expected return type on the JS/TS side
        invoke.resolve()
    }
    
    @objc public func seek(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] seek() CALLED")
        
        let config = try invoke.parseArgs(SeekConfig.self)
        let positionMs = config.positionMs
        NSLog("[MediaEditor]   Position: \(positionMs)ms")
        
        let time = CMTime(value: positionMs, timescale: 1000)
        
        if isUsingVideoPlayer {
            videoPlayer?.seek(to: time)
            NSLog("[MediaEditor]   Video player seeked")
        } else {
            audioPlayer?.currentTime = TimeInterval(positionMs) / 1000.0
            NSLog("[MediaEditor]   Audio player seeked")
        }
        
        invoke.resolve([:])
    }
    
    @objc public func getPlaybackStatus(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] getPlaybackStatus() CALLED")
        
        var isPlaying = false
        var isPaused = false
        var currentPositionMs: Int64 = 0
        var durationMs: Int64 = 0
        
        if isUsingVideoPlayer {
            if let player = videoPlayer {
                isPlaying = player.rate > 0
                isPaused = player.rate == 0 && CMTimeGetSeconds(player.currentTime()) > 0
                
                let currentTime = CMTimeGetSeconds(player.currentTime())
                if !currentTime.isNaN && !currentTime.isInfinite {
                    currentPositionMs = Int64(currentTime * 1000)
                }
                
                if let duration = player.currentItem?.duration {
                    let durationSecs = CMTimeGetSeconds(duration)
                    if !durationSecs.isNaN && !durationSecs.isInfinite {
                        durationMs = Int64(durationSecs * 1000)
                    }
                }
            }
        } else {
            if let player = audioPlayer {
                isPlaying = player.isPlaying
                isPaused = !player.isPlaying && player.currentTime > 0
                
                let currentTime = player.currentTime
                if !currentTime.isNaN && !currentTime.isInfinite {
                    currentPositionMs = Int64(currentTime * 1000)
                }
                
                let duration = player.duration
                if !duration.isNaN && !duration.isInfinite {
                    durationMs = Int64(duration * 1000)
                }
            }
        }
        
        NSLog("[MediaEditor]   isPlaying: \(isPlaying), isPaused: \(isPaused)")
        NSLog("[MediaEditor]   Position: \(currentPositionMs)ms / \(durationMs)ms")
        
        invoke.resolve([
            "isPlaying": isPlaying,
            "isPaused": isPaused,
            "currentPositionMs": currentPositionMs,
            "durationMs": durationMs,
            "volume": currentVolume
        ])
    }
    
    @objc public func setVolume(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] setVolume() CALLED")
        
        let args = try invoke.parseArgs(SetVolumeArgs.self)
        let newVolume = min(max(args.volume, 0), 1)
        NSLog("[MediaEditor]   Volume: \(args.volume) -> \(newVolume) (clamped)")
        
        currentVolume = newVolume
        
        if isUsingVideoPlayer {
            videoPlayer?.volume = currentVolume
        } else {
            audioPlayer?.volume = currentVolume
        }
        
        invoke.resolve([:])
    }
    
    // MARK: - Helper Methods
    
    private func stopPlayback() {
        NSLog("[MediaEditor] stopPlayback() - stopping audio and video players")
        audioPlayer?.stop()
        audioPlayer = nil
        videoPlayer?.pause()
        videoPlayer = nil
    }
    
    private func fourCCToString(_ fourCC: FourCharCode) -> String {
        let bytes = [
            Character(UnicodeScalar((fourCC >> 24) & 0xFF)!),
            Character(UnicodeScalar((fourCC >> 16) & 0xFF)!),
            Character(UnicodeScalar((fourCC >> 8) & 0xFF)!),
            Character(UnicodeScalar(fourCC & 0xFF)!)
        ]
        return String(bytes).trimmingCharacters(in: .whitespaces)
    }
    
    private func getAVFileType(for format: String) -> AVFileType? {
        // iOS AVAssetExportSession only supports these formats
        switch format.lowercased() {
        case "mp4", "m4v":
            return .mp4
        case "m4a", "mp3", "aac": // Convert mp3/aac to m4a on iOS
            return .m4a
        case "mov":
            return .mov
        case "wav":
            return .wav
        case "aiff", "aif":
            return .aiff
        case "caf":
            return .caf
        default:
            return nil // Unsupported format
        }
    }
    
    private func getExportPreset(for format: String, audioQuality: String?, videoQuality: String?) -> String {
        let audioFormats = ["mp3", "m4a", "aac", "wav", "flac", "ogg"]
        if audioFormats.contains(format.lowercased()) {
            return AVAssetExportPresetAppleM4A
        }
        
        switch videoQuality?.lowercased() {
        case "low":
            return AVAssetExportPresetLowQuality
        case "medium":
            return AVAssetExportPresetMediumQuality
        case "high":
            return AVAssetExportPresetHighestQuality
        case "original":
            return AVAssetExportPresetPassthrough
        default:
            return AVAssetExportPresetMediumQuality
        }
    }
    
    // MARK: - Native File Picker
    
    @objc public func selectMediaFile(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] Opening native file picker")
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                invoke.reject("Plugin instance not available")
                return
            }
            
            var types: [UTType] = []
            if #available(iOS 14.0, *) {
                types = [UTType.movie, UTType.audio, UTType.video, UTType.mpeg4Movie, UTType.quickTimeMovie, UTType.mp3, UTType.wav, UTType.aiff]
            }
            
            let picker: UIDocumentPickerViewController
            if #available(iOS 14.0, *) {
                picker = UIDocumentPickerViewController(forOpeningContentTypes: types)
            } else {
                let legacyTypes = [
                    kUTTypeMovie as String,
                    kUTTypeAudio as String,
                    kUTTypeVideo as String,
                    kUTTypeMPEG4 as String,
                    kUTTypeQuickTimeMovie as String,
                    kUTTypeMP3 as String,
                    kUTTypeWaveformAudio as String
                ]
                picker = UIDocumentPickerViewController(documentTypes: legacyTypes, in: .import)
            }
            
            picker.delegate = self
            picker.allowsMultipleSelection = false
            
            self.filePickerCompletion = { [weak self] url in
                if let url = url {
                    // Copy to app's cache directory for reliable access
                    let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
                    let destinationURL = cacheDir.appendingPathComponent(url.lastPathComponent)
                    
                    do {
                        // Remove existing file if present
                        if FileManager.default.fileExists(atPath: destinationURL.path) {
                            try FileManager.default.removeItem(at: destinationURL)
                        }
                        
                        // Start accessing security-scoped resource
                        let accessing = url.startAccessingSecurityScopedResource()
                        defer {
                            if accessing {
                                url.stopAccessingSecurityScopedResource()
                            }
                        }
                        
                        try FileManager.default.copyItem(at: url, to: destinationURL)
                        
                        NSLog("[MediaEditor] File copied to cache: \(destinationURL.path)")
                        
                        invoke.resolve([
                            "success": true,
                            "filePath": destinationURL.path
                        ])
                    } catch {
                        NSLog("[MediaEditor] Error copying file: \(error.localizedDescription)")
                        invoke.reject("Failed to copy file: \(error.localizedDescription)")
                    }
                } else {
                    invoke.reject("File selection cancelled")
                }
                self?.filePickerCompletion = nil
            }
            
            // Get the root view controller using modern API (iOS 15+)
            // Fallback to deprecated API for older iOS versions
            var viewController: UIViewController?
            if #available(iOS 15.0, *) {
                // Use the first connected window scene's key window
                viewController = UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .flatMap { $0.windows }
                    .first { $0.isKeyWindow }?
                    .rootViewController
            } else {
                // Fallback for older iOS versions
                viewController = UIApplication.shared.windows.first?.rootViewController
            }
            
            guard let rootViewController = viewController else {
                invoke.reject("No root view controller available")
                return
            }
            
            var topController = rootViewController
            while let presented = topController.presentedViewController {
                topController = presented
            }
            
            topController.present(picker, animated: true)
        }
    }
    
    // MARK: - UIDocumentPickerDelegate
    
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        filePickerCompletion?(urls.first)
    }
    
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        filePickerCompletion?(nil)
    }
    
    // MARK: - Permission Methods
    
    @objc public func checkPermission(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] checkPermission() CALLED")
        // iOS doesn't require explicit permission for media file access via document picker
        // Photo library access would require PHPhotoLibrary authorization
        NSLog("[MediaEditor]   Media access via document picker - no permission required")
        invoke.resolve([
            "granted": true,
            "canRequest": true
        ])
    }
    
    @objc public func requestPermission(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] requestPermission() CALLED")
        // iOS doesn't require explicit permission for media file access via document picker
        NSLog("[MediaEditor]   Media access via document picker - no permission required")
        invoke.resolve([
            "granted": true,
            "canRequest": true
        ])
    }
    
    // MARK: - Cache Management
    
    @objc public func cleanupCache(_ invoke: Invoke) throws {
        NSLog("[MediaEditor] ============================================")
        NSLog("[MediaEditor] cleanupCache() CALLED")
        
        let cacheDir = FileManager.default.temporaryDirectory.appendingPathComponent("media_editor_cache")
        NSLog("[MediaEditor]   Cache dir: \(cacheDir.path)")
        
        var filesDeleted: Int = 0
        var bytesFreed: UInt64 = 0
        
        do {
            if FileManager.default.fileExists(atPath: cacheDir.path) {
                let contents = try FileManager.default.contentsOfDirectory(atPath: cacheDir.path)
                NSLog("[MediaEditor]   Files in cache: \(contents.count)")
                
                for file in contents {
                    let filePath = cacheDir.appendingPathComponent(file)
                    
                    do {
                        let attributes = try FileManager.default.attributesOfItem(atPath: filePath.path)
                        if let fileSize = attributes[.size] as? UInt64 {
                            bytesFreed += fileSize
                        }
                        
                        try FileManager.default.removeItem(at: filePath)
                        filesDeleted += 1
                        NSLog("[MediaEditor]   Deleted: \(file)")
                    } catch {
                        NSLog("[MediaEditor]   ERROR deleting \(file): \(error.localizedDescription)")
                    }
                }
            } else {
                NSLog("[MediaEditor]   Cache directory does not exist")
            }
            
            NSLog("[MediaEditor]   Cleanup complete: \(filesDeleted) files, \(bytesFreed) bytes freed")
            invoke.resolve([
                "success": true,
                "filesDeleted": filesDeleted,
                "bytesFreed": bytesFreed
            ])
        } catch {
            NSLog("[MediaEditor]   ERROR cleaning cache: \(error.localizedDescription)")
            invoke.resolve([
                "success": false,
                "filesDeleted": 0,
                "bytesFreed": 0
            ])
        }
    }
}

@_cdecl("init_plugin_media_editor")
func initPlugin() -> Plugin {
    return MediaEditorPlugin()
}
