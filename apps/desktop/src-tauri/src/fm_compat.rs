//! Compatibilité de FM27 après une mise à jour du jeu (patch Steam, version finale) : lecture seule de fichiers.
//!
//! - empreinte de la version installée : taille et date de `game_plugin.dll`, numéro de build Steam
//!   (`steamapps/appmanifest_*.acf`) quand il est lisible ;
//! - lecture en mémoire : les motifs de `fm_memory` sont-ils retrouvés dans le module, et pour une version analysée ?
//! - plugins BepInEx : chargés ou non à la dernière partie, erreurs du journal `BepInEx/LogOutput.log`.
//!
//! Rien n'est écrit, rien n'est envoyé : l'appli compare et explique, le joueur décide.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const INSTALL_DIR: &str = "Football Manager 27";
/// Au-delà, le journal n'est pas celui de BepInEx (garde-fou de lecture).
const MAX_LOG: u64 = 64 * 1024 * 1024;
const MAX_ERRORS: usize = 5;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameBuild {
    /// Empreinte stable de la version : « taille-date » de `game_plugin.dll`.
    pub key: String,
    pub module_size: u64,
    /// Date de modification de `game_plugin.dll` (ms depuis 1970), c.-à-d. date de la mise à jour.
    pub module_modified: u64,
    pub steam_build: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MemoryCompat {
    /// Points d'entrée d'une version déjà analysée et vérifiée.
    Known,
    /// Motifs retrouvés dans une version nouvelle : la lecture devrait marcher, à confirmer en jeu.
    Patterns,
    /// Motifs introuvables : la lecture du CA/PA en mémoire ne marchera pas pour cette version.
    Broken,
    /// Pas vérifiable (module absent ou illisible).
    Unchecked,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPlugin {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogInfo {
    /// Date du journal (ms) : dernière partie lancée avec BepInEx.
    pub modified: u64,
    pub unity: Option<String>,
    pub plugins: Vec<LoadedPlugin>,
    /// Le chargement des plugins est allé au bout (« Chainloader startup complete »).
    pub started: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Compat {
    pub game_found: bool,
    pub build: Option<GameBuild>,
    pub memory: MemoryCompat,
    pub log: Option<LogInfo>,
}

fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64)
}

pub fn module_path(game: &Path) -> PathBuf {
    game.join("fm_Data").join("Plugins").join("x86_64").join("game_plugin.dll")
}

/// Valeur d'une clé d'un fichier VDF/ACF de Steam (`"clé"		"valeur"`), à n'importe quelle profondeur.
pub fn acf_value<'a>(acf: &'a str, key: &str) -> Option<&'a str> {
    acf.lines().find_map(|l| {
        let mut parts = l.trim().split('"').filter(|p| !p.trim().is_empty());
        (parts.next()? == key).then(|| parts.next()).flatten()
    })
}

/// Numéro de build Steam du jeu installé dans `game` (…/steamapps/common/Football Manager 27).
pub fn steam_build(game: &Path) -> Option<String> {
    let steamapps = game.parent()?.parent()?;
    let dir_name = game.file_name()?.to_str()?;
    for entry in std::fs::read_dir(steamapps).ok()?.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !(name.starts_with("appmanifest_") && name.ends_with(".acf")) {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(entry.path()) else { continue };
        if acf_value(&text, "installdir").is_some_and(|d| d.eq_ignore_ascii_case(dir_name)) {
            return acf_value(&text, "buildid").map(str::to_owned);
        }
    }
    None
}

pub fn build(game: &Path) -> Option<GameBuild> {
    let meta = std::fs::metadata(module_path(game)).ok()?;
    let module_modified = modified_ms(&meta);
    Some(GameBuild {
        key: format!("{}-{}", meta.len(), module_modified),
        module_size: meta.len(),
        module_modified,
        steam_build: steam_build(game),
    })
}

/// Lit le journal BepInEx : version d'Unity, plugins chargés, erreurs (les premières, raccourcies).
pub fn parse_log(text: &str) -> LogInfo {
    let mut info = LogInfo::default();
    for line in text.lines() {
        if let Some(rest) = line.split("Running under Unity ").nth(1) {
            info.unity = Some(rest.trim().to_owned());
        } else if line.contains("BepInEx] Loading [") {
            // « [Info   :   BepInEx] Loading [Archivix Bridge 0.5.8] »
            let inner = line.split("Loading [").nth(1).and_then(|r| r.rsplit_once(']')).map(|(a, _)| a.trim());
            if let Some((name, version)) = inner.and_then(|s| s.rsplit_once(' ')) {
                info.plugins.push(LoadedPlugin { name: name.to_owned(), version: version.to_owned() });
            }
        } else if line.contains("Chainloader startup complete") {
            info.started = true;
        } else if (line.starts_with("[Error") || line.starts_with("[Fatal")) && info.errors.len() < MAX_ERRORS {
            info.errors.push(line.chars().take(240).collect());
        }
    }
    info
}

pub fn log_info(game: &Path) -> Option<LogInfo> {
    let path = game.join("BepInEx").join("LogOutput.log");
    let meta = std::fs::metadata(&path).ok()?;
    if meta.len() > MAX_LOG {
        return None;
    }
    let bytes = std::fs::read(&path).ok()?;
    let mut info = parse_log(&String::from_utf8_lossy(&bytes));
    info.modified = modified_ms(&meta);
    Some(info)
}

pub fn status(game: &Path) -> Compat {
    let game_found = game.is_absolute() && game.join("fm.exe").is_file();
    if !game_found {
        return Compat { game_found, build: None, memory: MemoryCompat::Unchecked, log: None };
    }
    let module = module_path(game);
    let memory = if !module.is_file() {
        MemoryCompat::Unchecked
    } else {
        match crate::fm_memory::globals_for(&module) {
            Ok(g) if crate::fm_memory::is_known(g) => MemoryCompat::Known,
            Ok(_) => MemoryCompat::Patterns,
            Err(crate::fm_memory::MemError::Io(_)) => MemoryCompat::Unchecked,
            Err(_) => MemoryCompat::Broken,
        }
    };
    Compat { game_found, build: build(game), memory, log: log_info(game) }
}

/// État de compatibilité du jeu. La première vérification d'une version relit le module (~400 Mo, quelques secondes).
#[tauri::command]
pub async fn fm_compat_status(game_dir: String) -> Compat {
    tauri::async_runtime::spawn_blocking(move || status(Path::new(&game_dir)))
        .await
        .unwrap_or(Compat { game_found: false, build: None, memory: MemoryCompat::Unchecked, log: None })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ACF: &str = "\"AppState\"\n{\n\t\"appid\"\t\t\"3551340\"\n\t\"installdir\"\t\t\"Football Manager 27\"\n\t\"buildid\"\t\t\"20714395\"\n}\n";

    #[test]
    fn lit_le_manifeste_steam() {
        assert_eq!(acf_value(ACF, "buildid"), Some("20714395"));
        assert_eq!(acf_value(ACF, "installdir"), Some("Football Manager 27"));
        assert_eq!(acf_value(ACF, "absent"), None);
    }

    #[test]
    fn trouve_le_build_du_dossier_du_jeu() {
        let root = std::env::temp_dir().join(format!("fmi-compat-{}", std::process::id()));
        let game = root.join("steamapps").join("common").join(INSTALL_DIR);
        std::fs::create_dir_all(&game).unwrap();
        std::fs::write(root.join("steamapps").join("appmanifest_1.acf"), ACF.replace("Football Manager 27", "Autre jeu")).unwrap();
        std::fs::write(root.join("steamapps").join("appmanifest_2.acf"), ACF).unwrap();
        assert_eq!(steam_build(&game).as_deref(), Some("20714395"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn lit_le_journal_bepinex() {
        let log = "[Message: Preloader] BepInEx 6.0.0-be.791 - fm (29/10/2026 19:19:53)\n\
[Info   :   BepInEx] Running under Unity 6000.3.18f1\n\
[Info   :   BepInEx] Loading [Archivix Bridge 0.5.8]\n\
[Info   :   BepInEx] Loading [FM27 Faces AgeSwap 0.3.0]\n\
[Error  :Archivix Bridge] Erreur de lecture\n\
[Message:   BepInEx] Chainloader startup complete\n";
        let info = parse_log(log);
        assert_eq!(info.unity.as_deref(), Some("6000.3.18f1"));
        assert_eq!(info.plugins, vec![
            LoadedPlugin { name: "Archivix Bridge".into(), version: "0.5.8".into() },
            LoadedPlugin { name: "FM27 Faces AgeSwap".into(), version: "0.3.0".into() },
        ]);
        assert!(info.started);
        assert_eq!(info.errors.len(), 1);
    }

    #[test]
    fn jeu_absent() {
        let c = status(Path::new("/nulle/part"));
        assert!(!c.game_found);
        assert_eq!(c.memory, MemoryCompat::Unchecked);
    }
}
