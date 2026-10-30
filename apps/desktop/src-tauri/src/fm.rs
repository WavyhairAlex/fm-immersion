//! Lecture de l'instantané Football Manager écrit par le plugin BepInEx.
//!
//! Le plugin (lecture seule dans le jeu) dépose `archivix-snapshot.json` dans un
//! dossier `archivix` à côté des sauvegardes. Simloom se contente de lire ce fichier,
//! jamais la sauvegarde ni la mémoire du jeu, et n'écrit rien dans ce dossier.

use serde::{Serialize, Serializer};
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Nom fixe : la commande ne peut lire aucun autre fichier.
pub const SNAPSHOT_FILE: &str = "archivix-snapshot.json";
/// Un effectif complet pèse quelques centaines de Ko ; au-delà, ce n'est pas notre fichier.
const MAX_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum FmError {
    #[error("dossier invalide")]
    InvalidFolder,
    #[error("aucun instantané dans ce dossier")]
    NotFound,
    #[error("fichier trop volumineux")]
    TooLarge,
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl Serialize for FmError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub fn read_snapshot(folder: &Path) -> Result<String, FmError> {
    if !folder.is_absolute() {
        return Err(FmError::InvalidFolder);
    }
    let path = folder.join(SNAPSHOT_FILE);
    let meta = std::fs::metadata(&path).map_err(|_| FmError::NotFound)?;
    if meta.len() > MAX_BYTES {
        return Err(FmError::TooLarge);
    }
    Ok(std::fs::read_to_string(path)?)
}

/// Contenu brut de l'instantané ; il est validé côté interface (schéma zod du module fm).
#[tauri::command]
pub fn fm_read_snapshot(folder: String) -> Result<String, FmError> {
    read_snapshot(Path::new(&folder))
}

/// Dossier par défaut : Documents\Sports Interactive\Football Manager 27\archivix.
/// Le joueur peut le changer s'il a déplacé ses données de jeu (autre disque…).
#[tauri::command]
pub fn fm_default_folder(app: tauri::AppHandle) -> Option<String> {
    let docs: PathBuf = app.path().document_dir().ok()?;
    Some(
        docs.join("Sports Interactive")
            .join("Football Manager 27")
            .join("archivix")
            .to_string_lossy()
            .into_owned(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lit_le_fichier_du_plugin() {
        let dir = std::env::temp_dir().join(format!("simloom-fm-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(SNAPSHOT_FILE), r#"{"schema":"archivix/1"}"#).unwrap();
        assert_eq!(read_snapshot(&dir).unwrap(), r#"{"schema":"archivix/1"}"#);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn refuse_un_dossier_relatif_ou_vide() {
        assert!(matches!(read_snapshot(Path::new("archivix")), Err(FmError::InvalidFolder)));
        let dir = std::env::temp_dir().join("simloom-fm-vide");
        assert!(matches!(read_snapshot(&dir), Err(FmError::NotFound)));
    }
}
