//! Installation et mise à jour du plugin FM27 (Archivix Bridge) depuis GitHub Releases.
//!
//! Le plugin se compile contre les DLL d'interop du jeu (propriété de l'éditeur) : il n'est donc pas
//! embarqué dans l'installeur Simloom, construit par la CI. Il est publié à part, dans une release
//! « fm-bridge-vX.Y.Z » du dépôt, avec un manifeste `fm-bridge.json` qui donne l'empreinte SHA-256
//! de chaque fichier. Simloom ne télécharge et n'installe que sur demande du joueur, quand FM27 est fermé.

use serde::{Deserialize, Serialize, Serializer};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const REPO: &str = "amnesix-nt/simloom";
const TAG_PREFIX: &str = "fm-bridge-v";
const MANIFEST: &str = "fm-bridge.json";
const DLL: &str = "ArchivixBridge.dll";
const CONFIG: &str = "chemins.json";
/// Garde-fou : le plugin et sa configuration pèsent quelques dizaines de Ko.
const MAX_DOWNLOAD: u64 = 5 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum BridgeError {
    #[error("dossier de FM27 introuvable (fm.exe absent)")]
    NoGame,
    #[error("BepInEx n'est pas installé dans le dossier de FM27")]
    NoBepInEx,
    #[error("FM27 est lancé : ferme le jeu avant d'installer le plugin")]
    GameRunning,
    #[error("aucune version du plugin publiée")]
    NoRelease,
    #[error("fichier téléchargé corrompu : {0}")]
    BadChecksum(String),
    #[error("réseau : {0}")]
    Network(String),
    #[error("manifeste invalide : {0}")]
    BadManifest(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl Serialize for BridgeError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManifestFile {
    pub name: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Manifest {
    pub version: String,
    pub files: Vec<ManifestFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatus {
    pub game_found: bool,
    pub bepinex: bool,
    pub running: bool,
    pub installed_version: Option<String>,
}

fn plugin_dir(game: &Path) -> PathBuf {
    game.join("BepInEx").join("plugins").join("Archivix")
}

/// Version installée : écrite par Simloom à côté de la DLL (`version.json`).
fn installed_version(game: &Path) -> Option<String> {
    let text = std::fs::read_to_string(plugin_dir(game).join("version.json")).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    v.get("version")?.as_str().map(str::to_owned)
}

/// FM27 tourne-t-il ? (liste des processus Windows, sans fenêtre de console)
#[cfg(windows)]
fn game_running(_game: &Path) -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq fm.exe", "/NH", "/FO", "CSV"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains("\"fm.exe\""))
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn game_running(_game: &Path) -> bool {
    false
}

pub fn status(game: &Path) -> BridgeStatus {
    let game_found = game.is_absolute() && game.join("fm.exe").is_file();
    BridgeStatus {
        game_found,
        bepinex: game.join("BepInEx").join("core").is_dir(),
        running: game_found && game_running(game),
        installed_version: installed_version(game),
    }
}

/// Compare deux versions « X.Y.Z » numériquement (une partie manquante vaut 0).
pub fn newer(candidate: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> { v.split('.').map(|p| p.trim().parse().unwrap_or(0)).collect() };
    let (a, b) = (parse(candidate), parse(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn verify(file: &ManifestFile, bytes: &[u8]) -> Result<(), BridgeError> {
    if bytes.len() as u64 != file.size || sha256_hex(bytes) != file.sha256.to_lowercase() {
        return Err(BridgeError::BadChecksum(file.name.clone()));
    }
    Ok(())
}

/// Réglage BepInEx du plugin : dossier où il écrit ses instantanés.
pub fn config_text(data_dir: &str) -> String {
    format!(
        "[Archivix]\n\n## Dossier où écrire archivix-snapshot.json (en général <données FM27>\\archivix).\n# Setting type: String\nDossier = {data_dir}\n"
    )
}

fn get(url: &str) -> Result<Vec<u8>, BridgeError> {
    let resp = ureq::get(url)
        .set("User-Agent", "Simloom")
        .set("Accept", "application/octet-stream, application/json")
        .call()
        .map_err(|e| BridgeError::Network(e.to_string()))?;
    let mut buf = Vec::new();
    use std::io::Read;
    resp.into_reader().take(MAX_DOWNLOAD).read_to_end(&mut buf)?;
    Ok(buf)
}

/// Tag de la release de plugin la plus récente parmi la liste renvoyée par l'API GitHub.
pub fn pick_release(releases: &serde_json::Value) -> Option<String> {
    releases
        .as_array()?
        .iter()
        .filter(|r| !r["draft"].as_bool().unwrap_or(false))
        .filter_map(|r| r["tag_name"].as_str())
        .filter(|t| t.starts_with(TAG_PREFIX))
        .max_by(|a, b| {
            let (va, vb) = (&a[TAG_PREFIX.len()..], &b[TAG_PREFIX.len()..]);
            if newer(va, vb) { std::cmp::Ordering::Greater } else if newer(vb, va) { std::cmp::Ordering::Less } else { std::cmp::Ordering::Equal }
        })
        .map(str::to_owned)
}

fn download(tag: &str, name: &str) -> Result<Vec<u8>, BridgeError> {
    get(&format!("https://github.com/{REPO}/releases/download/{tag}/{name}"))
}

pub fn latest() -> Result<(String, Manifest), BridgeError> {
    let list = get(&format!("https://api.github.com/repos/{REPO}/releases?per_page=30"))?;
    let releases: serde_json::Value = serde_json::from_slice(&list).map_err(|e| BridgeError::BadManifest(e.to_string()))?;
    let tag = pick_release(&releases).ok_or(BridgeError::NoRelease)?;
    let manifest: Manifest = serde_json::from_slice(&download(&tag, MANIFEST)?).map_err(|e| BridgeError::BadManifest(e.to_string()))?;
    Ok((tag, manifest))
}

/// Écriture atomique : fichier temporaire puis remplacement.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

pub fn install(game: &Path, data_dir: &Path) -> Result<BridgeStatus, BridgeError> {
    let st = status(game);
    if !st.game_found {
        return Err(BridgeError::NoGame);
    }
    if !st.bepinex {
        return Err(BridgeError::NoBepInEx);
    }
    if st.running {
        return Err(BridgeError::GameRunning);
    }
    let (tag, manifest) = latest()?;
    let mut files = Vec::new();
    for name in [DLL, CONFIG] {
        let entry = manifest.files.iter().find(|f| f.name == name).ok_or_else(|| BridgeError::BadManifest(format!("{name} absent")))?;
        let bytes = download(&tag, name)?;
        verify(entry, &bytes)?;
        files.push((name, bytes));
    }
    // Tout est vérifié avant d'écrire quoi que ce soit.
    for (name, bytes) in &files {
        let dest = if *name == DLL { plugin_dir(game).join(DLL) } else { data_dir.join("config").join(CONFIG) };
        write_atomic(&dest, bytes)?;
    }
    write_atomic(&plugin_dir(game).join("version.json"), serde_json::json!({ "version": manifest.version, "tag": tag }).to_string().as_bytes())?;
    write_atomic(&game.join("BepInEx").join("config").join("fr.archivix.bridge.cfg"), config_text(&data_dir.to_string_lossy()).as_bytes())?;
    Ok(status(game))
}

#[tauri::command]
pub fn fm_bridge_status(game_dir: String) -> BridgeStatus {
    status(Path::new(&game_dir))
}

/// Dernière version publiée (réseau : uniquement quand le joueur ouvre la carte du plugin).
#[tauri::command]
pub async fn fm_bridge_latest() -> Result<String, BridgeError> {
    tauri::async_runtime::spawn_blocking(|| latest().map(|(_, m)| m.version))
        .await
        .map_err(|e| BridgeError::Network(e.to_string()))?
}

#[tauri::command]
pub async fn fm_bridge_install(game_dir: String, data_dir: String) -> Result<BridgeStatus, BridgeError> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = PathBuf::from(&data_dir);
        if !data.is_absolute() {
            return Err(BridgeError::NoGame);
        }
        install(Path::new(&game_dir), &data)
    })
    .await
    .map_err(|e| BridgeError::Network(e.to_string()))?
}

/// Bibliothèques Steam déclarées dans `libraryfolders.vdf` (le jeu peut être sur un autre disque).
pub fn steam_libraries(vdf: &str) -> Vec<PathBuf> {
    vdf.lines()
        .filter_map(|l| {
            let mut parts = l.split('"').filter(|x| !x.trim().is_empty());
            if parts.next()? != "path" {
                return None;
            }
            Some(PathBuf::from(parts.next()?.replace("\\\\", "\\")))
        })
        .collect()
}

/// Dossier d'installation de Steam déclaré dans le registre (`SteamPath`, ex. « g:/steam »).
#[cfg(windows)]
fn registry_steam_path() -> Option<PathBuf> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Valve\Steam", "/v", "SteamPath"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    steam_path_from_reg(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(not(windows))]
fn registry_steam_path() -> Option<PathBuf> {
    None
}

/// Valeur de `SteamPath` dans la sortie de `reg query` (« SteamPath    REG_SZ    g:/steam »).
pub fn steam_path_from_reg(out: &str) -> Option<PathBuf> {
    out.lines()
        .find_map(|l| l.trim().strip_prefix("SteamPath")?.trim_start().strip_prefix("REG_SZ").map(str::trim))
        .filter(|v| !v.is_empty())
        .map(|v| PathBuf::from(v.replace('/', "\\")))
}

/// Dossier de FM27 : Steam du registre et emplacements habituels, puis chaque bibliothèque Steam.
pub fn find_game_dir() -> Option<PathBuf> {
    let mut steams: Vec<PathBuf> = registry_steam_path().into_iter().collect();
    steams.extend([r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam"].map(PathBuf::from));
    let mut libs = steams.clone();
    for steam in &steams {
        if let Ok(vdf) = std::fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) {
            libs.extend(steam_libraries(&vdf));
        }
    }
    libs.into_iter()
        .map(|l| l.join("steamapps").join("common").join("Football Manager 27"))
        .find(|g| g.join("fm.exe").is_file())
}

/// Dossier des instantanés tel que réglé dans le plugin (`BepInEx\config\fr.archivix.bridge.cfg`).
pub fn configured_data_dir(cfg: &str) -> Option<String> {
    cfg.lines()
        .find_map(|l| l.trim().strip_prefix("Dossier")?.trim_start().strip_prefix('=').map(|v| v.trim().to_owned()))
        .filter(|v| !v.is_empty())
}

pub fn plugin_data_dir(game: &Path) -> Option<String> {
    let cfg = std::fs::read_to_string(game.join("BepInEx").join("config").join("fr.archivix.bridge.cfg")).ok()?;
    configured_data_dir(&cfg)
}

/// Emplacement de FM27 trouvé sur le PC (le joueur peut le modifier).
#[tauri::command]
pub fn fm_bridge_default_game_dir() -> Option<String> {
    find_game_dir().map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compare_les_versions() {
        assert!(newer("0.2.0", "0.1.9"));
        assert!(newer("1.0", "0.9.9"));
        assert!(!newer("0.2.0", "0.2.0"));
        assert!(!newer("0.1.10", "0.2"));
    }

    #[test]
    fn choisit_la_release_du_plugin_la_plus_recente() {
        let r = serde_json::json!([
            { "tag_name": "v0.3.0", "draft": false },
            { "tag_name": "fm-bridge-v0.2.0", "draft": false },
            { "tag_name": "fm-bridge-v0.10.0", "draft": true },
            { "tag_name": "fm-bridge-v0.3.1", "draft": false }
        ]);
        assert_eq!(pick_release(&r).as_deref(), Some("fm-bridge-v0.3.1"));
        assert_eq!(pick_release(&serde_json::json!([{ "tag_name": "v1.0.0" }])), None);
    }

    #[test]
    fn verifie_empreinte_et_taille() {
        let bytes = b"archivix";
        let ok = ManifestFile { name: "x".into(), size: 8, sha256: sha256_hex(bytes) };
        assert!(verify(&ok, bytes).is_ok());
        let bad = ManifestFile { sha256: "00".into(), ..ok.clone() };
        assert!(matches!(verify(&bad, bytes), Err(BridgeError::BadChecksum(_))));
        let short = ManifestFile { size: 7, ..ok };
        assert!(verify(&short, bytes).is_err());
    }

    #[test]
    fn statut_sans_jeu() {
        let st = status(Path::new("pas-un-chemin-absolu"));
        assert!(!st.game_found && !st.running && st.installed_version.is_none());
    }

    #[test]
    fn lit_les_bibliotheques_steam_et_le_reglage_du_plugin() {
        let vdf = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"G:\\\\Steam\"\n\t}\n}";
        assert_eq!(steam_libraries(vdf), vec![PathBuf::from(r"C:\Program Files (x86)\Steam"), PathBuf::from(r"G:\Steam")]);
        let reg = "\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    SteamPath    REG_SZ    g:/steam\r\n\r\n";
        assert_eq!(steam_path_from_reg(reg), Some(PathBuf::from(r"g:\steam")));
        assert_eq!(steam_path_from_reg("ERREUR : clé introuvable"), None);
        assert_eq!(configured_data_dir(&config_text(r"D:\FM\archivix")).as_deref(), Some(r"D:\FM\archivix"));
        assert_eq!(configured_data_dir("[Archivix]\nDossier = \n"), None);
    }

    #[test]
    fn reglage_bepinex() {
        assert!(config_text(r"D:\FM\archivix").contains(r"Dossier = D:\FM\archivix"));
    }
}
