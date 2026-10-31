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
/// Repères de rôles et de styles fournis par le joueur (facultatif) : ils remplacent les repères maison.
pub const REFERENCE_FILE: &str = "simloom-roles.json";
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
    read_fixed(folder, SNAPSHOT_FILE)
}

fn read_fixed(folder: &Path, name: &str) -> Result<String, FmError> {
    if !folder.is_absolute() {
        return Err(FmError::InvalidFolder);
    }
    let path = folder.join(name);
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

/// Repères locaux (`simloom-roles.json` dans le dossier du plugin), ou rien s'il n'y en a pas.
#[tauri::command]
pub fn fm_read_reference(folder: String) -> Result<Option<String>, FmError> {
    match read_fixed(Path::new(&folder), REFERENCE_FILE) {
        Ok(s) => Ok(Some(s)),
        Err(FmError::NotFound) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Dossier par défaut : celui réglé dans le plugin s'il est installé, sinon
/// Documents\Sports Interactive\Football Manager 27\archivix.
/// Le joueur peut le changer s'il a déplacé ses données de jeu (autre disque…).
#[tauri::command]
pub fn fm_default_folder(app: tauri::AppHandle) -> Option<String> {
    if let Some(dir) = crate::fm_bridge::find_game_dir().and_then(|g| crate::fm_bridge::plugin_data_dir(&g)) {
        return Some(dir);
    }
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

    #[test]
    fn reperes_locaux_facultatifs() {
        let dir = std::env::temp_dir().join(format!("simloom-fm-ref-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let folder = dir.to_string_lossy().into_owned();
        assert_eq!(fm_read_reference(folder.clone()).unwrap(), None);
        std::fs::write(dir.join(REFERENCE_FILE), r#"{"roles":[],"styles":[]}"#).unwrap();
        assert_eq!(fm_read_reference(folder).unwrap().as_deref(), Some(r#"{"roles":[],"styles":[]}"#));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
