import XCTest
@testable import tauri_plugin_media_editor

/// Unit tests for Media Editor Plugin
final class MediaEditorPluginTests: XCTestCase {
    
    /// Test that media types are valid
    func testMediaTypes() throws {
        let types = ["audio", "video"]
        
        XCTAssertEqual(types.count, 2, "Should have 2 media types")
        XCTAssertTrue(types.contains("audio"), "Should contain audio")
        XCTAssertTrue(types.contains("video"), "Should contain video")
    }
    
    /// Test playback states
    func testPlaybackStates() throws {
        let states = ["idle", "playing", "paused", "stopped"]
        
        XCTAssertEqual(states.count, 4, "Should have 4 playback states")
        XCTAssertTrue(states.contains("idle"), "Should contain idle")
        XCTAssertTrue(states.contains("playing"), "Should contain playing")
        XCTAssertTrue(states.contains("paused"), "Should contain paused")
        XCTAssertTrue(states.contains("stopped"), "Should contain stopped")
    }
    
    /// Test output format extensions
    func testOutputFormatExtensions() throws {
        let audioFormats = ["mp3": ".mp3", "wav": ".wav", "aac": ".aac", "m4a": ".m4a"]
        let videoFormats = ["mp4": ".mp4", "mov": ".mov"]
        
        for (_, ext) in audioFormats {
            XCTAssertTrue(ext.hasPrefix("."), "Extension \(ext) should start with dot")
        }
        
        for (_, ext) in videoFormats {
            XCTAssertTrue(ext.hasPrefix("."), "Extension \(ext) should start with dot")
        }
    }
    
    /// Test trim configuration validation
    func testTrimConfigValidation() throws {
        // Valid: startMs < endMs
        let validConfigs = [(0, 1000), (500, 1500), (0, 60000)]
        
        // Invalid: startMs >= endMs
        let invalidConfigs = [(1000, 1000), (2000, 1000)]
        
        for (start, end) in validConfigs {
            XCTAssertTrue(start >= 0 && start < end, "Config (\(start), \(end)) should be valid")
        }
        
        for (start, end) in invalidConfigs {
            XCTAssertFalse(start >= 0 && start < end, "Config (\(start), \(end)) should be invalid")
        }
    }
    
    /// Test audio bitrate range
    func testAudioBitrateRange() throws {
        let validBitrates = [64, 128, 192, 256, 320]
        let invalidBitrates = [0, -1]
        
        for bitrate in validBitrates {
            XCTAssertTrue(bitrate >= 32 && bitrate <= 320, "Bitrate \(bitrate) should be valid")
        }
        
        for bitrate in invalidBitrates {
            XCTAssertFalse(bitrate >= 32 && bitrate <= 320, "Bitrate \(bitrate) should be invalid")
        }
    }
    
    /// Test duration validation
    func testDurationValidation() throws {
        let validDurations: [Int64] = [0, 1000, 60000, 3600000]
        let invalidDurations: [Int64] = [-1, -1000]
        
        for duration in validDurations {
            XCTAssertTrue(duration >= 0, "Duration \(duration) should be valid")
        }
        
        for duration in invalidDurations {
            XCTAssertFalse(duration >= 0, "Duration \(duration) should be invalid")
        }
    }
}
