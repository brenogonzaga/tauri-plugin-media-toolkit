package io.affex.mediaeditor

import android.media.MediaPlayer
import android.media.MediaMetadataRetriever
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4

import org.junit.Test
import org.junit.runner.RunWith

import org.junit.Assert.*

/**
 * Instrumented tests for Media Editor Plugin.
 * 
 * These tests run on an Android device/emulator and validate
 * functionality that requires the Android framework.
 */
@RunWith(AndroidJUnit4::class)
class MediaEditorInstrumentedTest {
    
    /**
     * Test that the package name is correct
     */
    @Test
    fun packageName_isCorrect() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("io.affex.mediaeditor.test", appContext.packageName)
    }
    
    /**
     * Test MediaPlayer can be created
     */
    @Test
    fun mediaPlayer_canBeCreated() {
        val player = MediaPlayer()
        assertNotNull("MediaPlayer should be created", player)
        player.release()
    }
    
    /**
     * Test MediaMetadataRetriever can be created
     */
    @Test
    fun metadataRetriever_canBeCreated() {
        val retriever = MediaMetadataRetriever()
        assertNotNull("MediaMetadataRetriever should be created", retriever)
        retriever.release()
    }
    
    /**
     * Test supported output formats
     */
    @Test
    fun outputFormats_areSupported() {
        val supportedMimes = listOf(
            "audio/mpeg",
            "audio/mp4",
            "audio/wav",
            "video/mp4"
        )
        
        for (mime in supportedMimes) {
            assertTrue("MIME $mime should be valid", mime.isNotEmpty())
        }
    }
}
