mod db;
mod fm;
mod fm_bridge;
mod fm_memory;

use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Toutes les données du joueur sont dans ce fichier, sur son PC.
            // Windows : %APPDATA%\app.fmimmersion.desktop\fm-immersion.db
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("fm-immersion.db"))?;
            app.manage(db::Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_query,
            db::db_batch,
            fm::fm_read_snapshot,
            fm::fm_read_reference,
            fm::fm_default_folder,
            fm::fm_list_saves,
            fm::fm_read_status,
            fm_bridge::fm_bridge_status,
            fm_bridge::fm_bridge_latest,
            fm_bridge::fm_bridge_install,
            fm_bridge::fm_bridge_default_game_dir,
            fm_memory::fm_memory_probe,
            fm_memory::fm_memory_find,
            fm_memory::fm_memory_search,
            fm_memory::fm_memory_abilities,
            fm_memory::fm_memory_division,
            fm_memory::fm_memory_staff
        ])
        .run(tauri::generate_context!())
        .expect("impossible de démarrer FM Immersion");
}
