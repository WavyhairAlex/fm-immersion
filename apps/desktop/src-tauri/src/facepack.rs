//! Visages des joueurs pour la gazette : photos d'un facepack que le joueur a installé lui-même dans le dossier
//! `graphics` de FM27 (ex. « Cut Out Faces » de Sortitoutsi, une image `<identifiant FM>.png` par joueur).
//! À défaut, portrait photoréaliste noté par le plugin des visages (`portraits-personnes.json` dans le dossier du
//! plugin, identifiant → image PNG) pour les joueurs générés et le staff.
//! Lecture locale seulement ; rien n'est embarqué dans l'appli ni téléchargé.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Dossiers de `graphics` qui contiennent des logos (mêmes noms de fichiers numériques que les visages).
const SKIP: [&str; 6] = ["clubs", "competitions", "confederations", "nations", "logos", "kits"];
const MAX_DEPTH: usize = 6;
const MAX_BYTES: u64 = 4 * 1024 * 1024;

/// Index identifiant → image, construit une fois par dossier `graphics` (un facepack compte des milliers de fichiers).
static INDEX: Mutex<Option<(PathBuf, HashMap<String, PathBuf>)>> = Mutex::new(None);

pub fn index_faces(graphics: &Path) -> HashMap<String, PathBuf> {
    let mut map = HashMap::new();
    let mut stack = vec![(graphics.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let path = e.path();
            let Ok(kind) = e.file_type() else { continue };
            let name = e.file_name().to_string_lossy().to_lowercase();
            if kind.is_dir() {
                if depth < MAX_DEPTH && !SKIP.contains(&name.as_str()) {
                    stack.push((path, depth + 1));
                }
            } else if let Some(stem) = name.strip_suffix(".png").or_else(|| name.strip_suffix(".jpg")) {
                if !stem.is_empty() && stem.len() <= 12 && stem.chars().all(|c| c.is_ascii_digit()) {
                    map.entry(stem.to_string()).or_insert(path);
                }
            }
        }
    }
    map
}

/// Dossier `graphics` des données FM27 : à côté du dossier `archivix` du plugin.
fn graphics_dir(plugin_folder: &Path) -> Option<PathBuf> {
    let g = plugin_folder.parent()?.join("graphics");
    g.is_dir().then_some(g)
}

/// Image notée par le plugin des visages pour cette personne (`portraits-personnes.json`), seulement un PNG.
fn mapped_portrait(plugin_folder: &Path, id: &str) -> Option<PathBuf> {
    let text = std::fs::read_to_string(plugin_folder.join("portraits-personnes.json")).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let p = PathBuf::from(v.get("faces")?.get(id)?.as_str()?);
    let png = p.extension().map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false);
    (p.is_absolute() && png && p.is_file()).then_some(p)
}

fn facepack_path(plugin_folder: &Path, id: &str, refresh: bool) -> Option<PathBuf> {
    let graphics = graphics_dir(plugin_folder)?;
    let mut guard = INDEX.lock().ok()?;
    if refresh || guard.as_ref().map(|(g, _)| g != &graphics).unwrap_or(true) {
        *guard = Some((graphics.clone(), index_faces(&graphics)));
    }
    guard.as_ref()?.1.get(id).cloned()
}

pub fn face_bytes(plugin_folder: &Path, id: &str, refresh: bool) -> Option<Vec<u8>> {
    if id.is_empty() || id.len() > 12 || !id.chars().all(|c| c.is_ascii_digit()) || !plugin_folder.is_absolute() {
        return None;
    }
    let path = facepack_path(plugin_folder, id, refresh).or_else(|| mapped_portrait(plugin_folder, id))?;
    let meta = std::fs::metadata(&path).ok()?;
    if meta.len() > MAX_BYTES {
        return None;
    }
    std::fs::read(path).ok()
}

/// Photo du joueur `id` (identifiant FM) trouvée dans un facepack, en octets ; vide s'il n'y en a pas.
#[tauri::command]
pub fn fm_face(folder: String, id: String, refresh: Option<bool>) -> tauri::ipc::Response {
    tauri::ipc::Response::new(face_bytes(Path::new(&folder), &id, refresh.unwrap_or(false)).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trouve_les_visages_mais_pas_les_logos() {
        let root = std::env::temp_dir().join(format!("fmi-facepack-{}", std::process::id()));
        let plugin = root.join("archivix");
        let faces = root.join("graphics").join("sortitoutsi").join("faces");
        let clubs = root.join("graphics").join("clubs");
        std::fs::create_dir_all(&plugin).unwrap();
        std::fs::create_dir_all(&faces).unwrap();
        std::fs::create_dir_all(&clubs).unwrap();
        std::fs::write(faces.join("63036055.png"), b"face").unwrap();
        std::fs::write(clubs.join("123.png"), b"logo").unwrap();
        std::fs::write(faces.join("config.xml"), b"<record/>").unwrap();
        assert_eq!(face_bytes(&plugin, "63036055", true).as_deref(), Some(&b"face"[..]));
        assert_eq!(face_bytes(&plugin, "123", false), None);
        assert_eq!(face_bytes(&plugin, "../x", false), None);
        // Portrait généré noté par le plugin des visages (pas de facepack pour cette personne).
        let gen = root.join("portrait_male-1-2-3-4-5.png");
        std::fs::write(&gen, b"gen").unwrap();
        let map = serde_json::json!({ "schema": "fm27faces-map/1", "faces": { "2002076896": gen.to_string_lossy(), "7": root.join("x.exe").to_string_lossy() } });
        std::fs::write(plugin.join("portraits-personnes.json"), map.to_string()).unwrap();
        assert_eq!(face_bytes(&plugin, "2002076896", false).as_deref(), Some(&b"gen"[..]));
        assert_eq!(face_bytes(&plugin, "7", false), None);
        std::fs::remove_dir_all(&root).ok();
    }
}
