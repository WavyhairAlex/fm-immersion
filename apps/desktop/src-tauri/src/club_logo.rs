//! Logos des clubs pour la gazette et le direct : pack de logos installé par le joueur dans le dossier `graphics`
//! de FM27 (ex. « FOOTBE Logos », `graphics/clubs/<identifiant>.png` et `clubs/small/<identifiant>.png`, ou un pack
//! Sortitoutsi `graphics/logos/clubs/...`). L'identifiant est l'identifiant unique du club dans le jeu.
//! Lecture locale seulement ; rien n'est embarqué dans l'appli ni téléchargé.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const MAX_DEPTH: usize = 6;
const MAX_BYTES: u64 = 4 * 1024 * 1024;

/// Dossiers où l'on ne cherche pas de logos de clubs (visages, maillots, compétitions, nations).
fn skipped(name: &str) -> bool {
    ["face", "kit", "person", "competition", "confederation", "nation", "stadium", "background"].iter().any(|w| name.contains(w))
}

/// Dossier de petites images (icônes 20 px) : pris seulement s'il n'y a rien de plus grand.
fn small(name: &str) -> bool {
    matches!(name, "small" | "icon" | "icons" | "tiny")
}

/// Index identifiant → (logo, est petit), construit une fois par dossier `graphics`.
static INDEX: Mutex<Option<(PathBuf, HashMap<String, (PathBuf, bool)>)>> = Mutex::new(None);

pub fn index_logos(graphics: &Path) -> HashMap<String, (PathBuf, bool)> {
    let mut map: HashMap<String, (PathBuf, bool)> = HashMap::new();
    // (dossier, profondeur, dans un dossier de clubs, dans un dossier de petites images)
    let mut stack = vec![(graphics.to_path_buf(), 0usize, false, false)];
    while let Some((dir, depth, in_clubs, in_small)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let path = e.path();
            let Ok(kind) = e.file_type() else { continue };
            let name = e.file_name().to_string_lossy().to_lowercase();
            if kind.is_dir() {
                if depth < MAX_DEPTH && !skipped(&name) {
                    stack.push((path, depth + 1, in_clubs || name.contains("club"), in_small || small(&name)));
                }
            } else if in_clubs {
                let Some(stem) = name.strip_suffix(".png") else { continue };
                if stem.is_empty() || stem.len() > 12 || !stem.chars().all(|c| c.is_ascii_digit()) {
                    continue;
                }
                match map.get(stem) {
                    Some((_, false)) => {}
                    Some((_, true)) if in_small => {}
                    _ => {
                        map.insert(stem.to_string(), (path, in_small));
                    }
                }
            }
        }
    }
    map
}

fn logo_path(plugin_folder: &Path, id: &str, refresh: bool) -> Option<PathBuf> {
    let graphics = crate::facepack::graphics_dir(plugin_folder)?;
    let mut guard = INDEX.lock().ok()?;
    if refresh || guard.as_ref().map(|(g, _)| g != &graphics).unwrap_or(true) {
        *guard = Some((graphics.clone(), index_logos(&graphics)));
    }
    guard.as_ref()?.1.get(id).map(|(p, _)| p.clone())
}

pub fn logo_bytes(plugin_folder: &Path, id: &str, refresh: bool) -> Option<Vec<u8>> {
    if id.is_empty() || id.len() > 12 || !id.chars().all(|c| c.is_ascii_digit()) || !plugin_folder.is_absolute() {
        return None;
    }
    let path = logo_path(plugin_folder, id, refresh)?;
    if std::fs::metadata(&path).ok()?.len() > MAX_BYTES {
        return None;
    }
    std::fs::read(path).ok()
}

/// Logo du club `id` (identifiant unique FM27) trouvé dans un pack de logos, en octets ; vide s'il n'y en a pas.
#[tauri::command]
pub fn fm_club_logo(folder: String, id: String, refresh: Option<bool>) -> tauri::ipc::Response {
    tauri::ipc::Response::new(logo_bytes(Path::new(&folder), &id, refresh.unwrap_or(false)).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trouve_les_logos_des_clubs_en_grand_d_abord() {
        let root = std::env::temp_dir().join(format!("fmi-logos-{}", std::process::id()));
        let plugin = root.join("archivix");
        let clubs = root.join("graphics").join("clubs");
        let small = clubs.join("small");
        let faces = root.join("graphics").join("sortitoutsi").join("faces");
        let nations = root.join("graphics").join("nations");
        for d in [&plugin, &small, &faces, &nations] {
            std::fs::create_dir_all(d).unwrap();
        }
        std::fs::write(small.join("1000.png"), b"petit").unwrap();
        std::fs::write(clubs.join("1000.png"), b"grand").unwrap();
        std::fs::write(small.join("2000.png"), b"seul-petit").unwrap();
        std::fs::write(faces.join("3000.png"), b"visage").unwrap();
        std::fs::write(nations.join("4000.png"), b"drapeau").unwrap();
        std::fs::write(clubs.join("config.xml"), b"<record/>").unwrap();
        assert_eq!(logo_bytes(&plugin, "1000", true).as_deref(), Some(&b"grand"[..]));
        assert_eq!(logo_bytes(&plugin, "2000", false).as_deref(), Some(&b"seul-petit"[..]));
        assert_eq!(logo_bytes(&plugin, "3000", false), None);
        assert_eq!(logo_bytes(&plugin, "4000", false), None);
        assert_eq!(logo_bytes(&plugin, "../1000", false), None);
        // Pack rangé autrement : graphics/logos/clubs/normal/<id>.png.
        let other = root.join("graphics").join("logos").join("clubs").join("normal");
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(other.join("5000.png"), b"autre").unwrap();
        assert_eq!(logo_bytes(&plugin, "5000", true).as_deref(), Some(&b"autre"[..]));
        std::fs::remove_dir_all(&root).ok();
    }
}
