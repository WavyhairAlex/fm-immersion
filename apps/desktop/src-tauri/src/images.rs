//! Images à partager (carte de fin de saison) : enregistrées dans le dossier Images du joueur, sous-dossier
//! « FM Immersion ». Rien n'est envoyé : le joueur poste ensuite le fichier où il veut.

use std::path::{Path, PathBuf};
use tauri::Manager;

const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

/// Nom de fichier sûr : lettres et chiffres ASCII, tirets ; « image » si rien ne reste.
pub fn safe_name(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out: String = out.trim_end_matches('-').chars().take(80).collect();
    if out.is_empty() { "image".into() } else { out }
}

/// Chemin libre dans `dir` : `nom.png`, sinon `nom-2.png`, `nom-3.png`…
pub fn free_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(format!("{name}.png"));
    if !first.exists() {
        return first;
    }
    (2..1000).map(|i| dir.join(format!("{name}-{i}.png"))).find(|p| !p.exists()).unwrap_or(first)
}

/// Enregistre une image PNG dessinée par l'appli et renvoie son chemin complet.
#[tauri::command]
pub fn image_save(app: tauri::AppHandle, name: String, png: Vec<u8>) -> Result<String, String> {
    if png.len() > 20 * 1024 * 1024 || !png.starts_with(&PNG_MAGIC) {
        return Err("image PNG invalide".into());
    }
    let base = app
        .path()
        .picture_dir()
        .or_else(|_| app.path().home_dir().map(|h| h.join("Pictures")))
        .map_err(|e| e.to_string())?;
    let dir = base.join("FM Immersion");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = free_path(&dir, &safe_name(&name));
    std::fs::write(&path, &png).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noms_surs() {
        assert_eq!(safe_name("carte-saison-Malženice 2026/27"), "carte-saison-mal-enice-2026-27");
        assert_eq!(safe_name("../../x"), "x");
        assert_eq!(safe_name("***"), "image");
    }

    #[test]
    fn pas_d_ecrasement() {
        let dir = std::env::temp_dir().join(format!("fmi-img-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = free_path(&dir, "carte");
        std::fs::write(&a, b"x").unwrap();
        assert_eq!(free_path(&dir, "carte").file_name().unwrap(), "carte-2.png");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
