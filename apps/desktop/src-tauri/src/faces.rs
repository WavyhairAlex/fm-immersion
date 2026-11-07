//! Module « Visages photoréalistes » : état du pack de portraits dans le dossier de FM27.
//!
//! Lecture seule pour l'instant : on regarde seulement la taille de
//! `fm_Data\StreamingAssets\AddrData\portraits_assets_all.bundle` pour savoir si c'est l'original du jeu
//! ou le pack photoréaliste. L'installation en un clic (copie du bundle + correction du CRC dans
//! `catalog_info.bin`) viendra ensuite.

use serde::Serialize;
use std::path::Path;

/// Taille du bundle d'origine de FM27 (version du 29/10/2026).
pub const ORIGINAL_SIZE: u64 = 108_004_900;
/// Taille du bundle du pack photoréaliste v1.0 (release GitHub du 01/11/2026).
pub const PHOTOREAL_V1_SIZE: u64 = 526_124_666;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FacesState {
    /// Dossier de FM27 introuvable.
    NoGame,
    /// FM27 trouvé, mais pas de bundle de portraits.
    Missing,
    /// Portraits d'origine du jeu.
    Original,
    /// Pack photoréaliste v1.0 installé.
    PhotorealV1,
    /// Bundle modifié par autre chose (autre version, autre mod) ou jeu mis à jour.
    Unknown,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FacesStatus {
    pub state: FacesState,
    pub size: Option<u64>,
}

pub fn bundle_path(game: &Path) -> std::path::PathBuf {
    game.join("fm_Data").join("StreamingAssets").join("AddrData").join("portraits_assets_all.bundle")
}

pub fn state_for_size(size: u64) -> FacesState {
    match size {
        ORIGINAL_SIZE => FacesState::Original,
        PHOTOREAL_V1_SIZE => FacesState::PhotorealV1,
        _ => FacesState::Unknown,
    }
}

pub fn status(game: &Path) -> FacesStatus {
    if !(game.is_absolute() && game.join("fm.exe").is_file()) {
        return FacesStatus { state: FacesState::NoGame, size: None };
    }
    match std::fs::metadata(bundle_path(game)) {
        Ok(m) => FacesStatus { state: state_for_size(m.len()), size: Some(m.len()) },
        Err(_) => FacesStatus { state: FacesState::Missing, size: None },
    }
}

#[tauri::command]
pub fn faces_status(game_dir: String) -> FacesStatus {
    status(Path::new(&game_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconnait_les_bundles_par_leur_taille() {
        assert_eq!(state_for_size(ORIGINAL_SIZE), FacesState::Original);
        assert_eq!(state_for_size(PHOTOREAL_V1_SIZE), FacesState::PhotorealV1);
        assert_eq!(state_for_size(42), FacesState::Unknown);
    }

    #[test]
    fn dossier_sans_fm27() {
        let dir = std::env::temp_dir().join(format!("fmi-faces-vide-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(status(&dir).state, FacesState::NoGame);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fm27_sans_bundle_puis_avec_bundle() {
        let dir = std::env::temp_dir().join(format!("fmi-faces-jeu-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("fm.exe"), b"").unwrap();
        assert_eq!(status(&dir).state, FacesState::Missing);
        let bundle = bundle_path(&dir);
        std::fs::create_dir_all(bundle.parent().unwrap()).unwrap();
        std::fs::write(&bundle, b"abc").unwrap();
        let s = status(&dir);
        assert_eq!(s.state, FacesState::Unknown);
        assert_eq!(s.size, Some(3));
        std::fs::remove_dir_all(&dir).ok();
    }
}
