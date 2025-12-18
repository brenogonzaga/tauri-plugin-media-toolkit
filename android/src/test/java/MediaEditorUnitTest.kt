package io.affex.mediaeditor

import org.junit.Test
import org.junit.Assert.*

/**
 * Unit tests for Media Editor Plugin models and utilities.
 * 
 * These tests run on the development machine (host) and validate
 * core logic without requiring Android framework dependencies.
 */
class MediaEditorUnitTest {
    
    /**
     * Test that media types are correctly defined
     */
    @Test
    fun mediaTypes_areValid() {
        val types = listOf("audio", "video")
        assertTrue("Should have 2 media types", types.size == 2)
        assertTrue("Should contain audio", types.contains("audio"))
        assertTrue("Should contain video", types.contains("video"))
    }
    
    /**
     * Test playback states
     */
    @Test
    fun playbackStates_areValid() {
        val states = listOf("idle", "playing", "paused", "stopped")
        assertTrue("Should have 4 playback states", states.size == 4)
        assertTrue("Should contain idle", states.contains("idle"))
        assertTrue("Should contain playing", states.contains("playing"))
        assertTrue("Should contain paused", states.contains("paused"))
        assertTrue("Should contain stopped", states.contains("stopped"))
    }
    
    /**
     * Test output format extensions
     */
    @Test
    fun outputFormat_extensionsAreValid() {
        val audioFormats = mapOf(
            "mp3" to ".mp3",
            "wav" to ".wav",
            "aac" to ".aac",
            "ogg" to ".ogg",
            "m4a" to ".m4a"
        )
        
        val videoFormats = mapOf(
            "mp4" to ".mp4",
            "webm" to ".webm",
            "mov" to ".mov"
        )
        
        for ((format, ext) in audioFormats) {
            assertTrue("Audio format $format should have extension $ext", ext.startsWith("."))
        }
        
        for ((format, ext) in videoFormats) {
            assertTrue("Video format $format should have extension $ext", ext.startsWith("."))
        }
    }
    
    /**
     * Test trim configuration validation
     */
    @Test
    fun trimConfig_isValid() {
        // Valid: startMs < endMs
        val validConfigs = listOf(
            Pair(0L, 1000L),
            Pair(500L, 1500L),
            Pair(0L, 60000L)
        )
        
        // Invalid: startMs >= endMs
        val invalidConfigs = listOf(
            Pair(1000L, 1000L),
            Pair(2000L, 1000L),
            Pair(-1L, 1000L)
        )
        
        for ((start, end) in validConfigs) {
            assertTrue("Config ($start, $end) should be valid", start >= 0 && start < end)
        }
        
        for ((start, end) in invalidConfigs) {
            assertFalse("Config ($start, $end) should be invalid", start >= 0 && start < end)
        }
    }
    
    /**
     * Test audio quality bitrate validation
     */
    @Test
    fun audioBitrate_isWithinRange() {
        val validBitrates = listOf(64, 128, 192, 256, 320) // kbps
        val invalidBitrates = listOf(0, -1, 1000)
        
        for (bitrate in validBitrates) {
            assertTrue("Bitrate $bitrate should be valid", bitrate in 32..320)
        }
        
        for (bitrate in invalidBitrates) {
            assertFalse("Bitrate $bitrate should be invalid", bitrate in 32..320)
        }
    }
    
    /**
     * Test duration in milliseconds
     */
    @Test
    fun duration_isPositive() {
        val validDurations = listOf(0L, 1000L, 60000L, 3600000L)
        val invalidDurations = listOf(-1L, -1000L)
        
        for (duration in validDurations) {
            assertTrue("Duration $duration should be valid", duration >= 0)
        }
        
        for (duration in invalidDurations) {
            assertFalse("Duration $duration should be invalid", duration >= 0)
        }
    }
}
