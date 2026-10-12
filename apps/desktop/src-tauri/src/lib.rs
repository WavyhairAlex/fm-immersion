mod db;

use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Toutes les données du joueur sont dans ce fichier, sur son PC.
            // Windows : %APPDATA%\app.simloom.desktop\simloom.db
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("simloom.db"))?;
            app.manage(db::Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![db::db_query, db::db_batch])
        .run(tauri::generate_context!())
        .expect("impossible de démarrer Simloom");
}
