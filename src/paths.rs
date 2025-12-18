// Path management utilities based on tauri-plugin-sql patterns
// See: https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/sql

use std::fs::create_dir_all;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

use crate::error::Error;

/// Default subdirectory for media cache within app_cache_dir
const MEDIA_CACHE_SUBDIR: &str = "media-cache";

/// Default subdirectory for processed media within app_data_dir
const MEDIA_OUTPUT_SUBDIR: &str = "media";

/// Gets the media cache directory for temporary processing files.
///
/// Uses `app_cache_dir()` as base directory - files here can be deleted anytime.
///
/// # Example
/// ```rust,ignore
/// let cache_dir = get_media_cache_dir(&app)?;
/// let temp_file = cache_dir.join("temp_output.mp4");
/// ```
pub fn get_media_cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, Error> {
    let base_path = app
        .path()
        .app_cache_dir()
        .map_err(|e| Error::InvalidPath(format!("Could not determine app cache directory: {e}")))?;

    let full_path = base_path.join(MEDIA_CACHE_SUBDIR);

    create_dir_all(&full_path).map_err(|e| {
        Error::InvalidPath(format!(
            "Could not create cache directory {}: {}",
            full_path.display(),
            e
        ))
    })?;

    Ok(full_path)
}

/// Gets the media output directory for permanent processed files.
///
/// Uses `app_data_dir()` as base directory for user data.
pub fn get_media_output_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, Error> {
    let base_path = app
        .path()
        .app_data_dir()
        .map_err(|e| Error::InvalidPath(format!("Could not determine app data directory: {e}")))?;

    let full_path = base_path.join(MEDIA_OUTPUT_SUBDIR);

    create_dir_all(&full_path).map_err(|e| {
        Error::InvalidPath(format!(
            "Could not create output directory {}: {}",
            full_path.display(),
            e
        ))
    })?;

    Ok(full_path)
}

/// Validates that a path doesn't contain path traversal attacks.
pub fn validate_path(path: &str) -> Result<(), Error> {
    let path_buf = PathBuf::from(path);

    for component in path_buf.components() {
        if let std::path::Component::ParentDir = component {
            return Err(Error::InvalidPath(
                "Path traversal not allowed (contains '..')".to_string(),
            ));
        }
    }

    Ok(())
}

/// Cleans up old cache files (older than the specified duration).
///
/// This should be called on plugin initialization to prevent cache buildup.

pub fn cleanup_old_cache<R: Runtime>(app: &AppHandle<R>, max_age_hours: u64) -> Result<u64, Error> {
    use std::time::{Duration, SystemTime};

    let cache_dir = get_media_cache_dir(app)?;
    let max_age = Duration::from_secs(max_age_hours * 3600);
    let now = SystemTime::now();
    let mut deleted_count = 0u64;

    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(age) = now.duration_since(modified) {
                        if age > max_age && metadata.is_file() {
                            if std::fs::remove_file(entry.path()).is_ok() {
                                deleted_count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(deleted_count)
}
