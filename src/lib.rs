use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;
mod paths;

pub use error::{Error, Result};
pub use paths::{cleanup_old_cache, get_media_cache_dir, get_media_output_dir, validate_path};

#[cfg(desktop)]
use desktop::MediaEditor;
#[cfg(mobile)]
use mobile::MediaEditor;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the media-toolkit APIs.
pub trait MediaToolkitExt<R: Runtime> {
    fn media_toolkit(&self) -> &MediaEditor<R>;
}

impl<R: Runtime, T: Manager<R>> crate::MediaToolkitExt<R> for T {
    fn media_toolkit(&self) -> &MediaEditor<R> {
        self.state::<MediaEditor<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("media-toolkit")
        .invoke_handler(tauri::generate_handler![
            commands::get_media_info,
            commands::trim,
            commands::convert,
            commands::extract_audio,
            commands::play,
            commands::pause,
            commands::resume,
            commands::stop,
            commands::seek,
            commands::get_playback_status,
            commands::set_volume,
            commands::select_media_file,
            commands::check_permission,
            commands::request_permission,
            commands::cleanup_cache,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let media_editor = mobile::init(app, api)?;
            #[cfg(desktop)]
            let media_editor = desktop::init(app, api)?;
            app.manage(media_editor);
            Ok(())
        })
        .build()
}
