//! Packs de visages V2 publiés au fil des lots (release GitHub « v2-progression » du dépôt
//! FM27-Photorealistic-Faces) : recherche d'une version plus récente, téléchargement vérifié.
//!
//! Réseau : uniquement GitHub Releases de ce dépôt. Le manifeste (quelques centaines d'octets) est lu à l'ouverture
//! de l'appli ; le zip (~500 Mo) n'est téléchargé que sur clic du joueur, vérifié par SHA-256, puis le bundle
//! extrait est contrôlé (taille et CRC Unity) avant d'être proposé à l'installation (`faces_install`, jeu fermé).

use crate::faces_pack::{self, PackError, PackManifest};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

pub const MANIFEST_URL: &str = "https://github.com/amnesix-nt/FM27-Photorealistic-Faces/releases/download/v2-progression/manifest.json";
/// Seules adresses de téléchargement acceptées dans le manifeste.
const ALLOWED_PREFIX: &str = "https://github.com/amnesix-nt/FM27-Photorealistic-Faces/releases/download/";
const MAX_MANIFEST: u64 = 64 * 1024;
/// Garde-fou : le zip fait environ 500 Mo.
const MAX_ZIP: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    pub manifest: PackManifest,
    /// « remote » : à télécharger ; « local » : pack de l'atelier déjà sur ce PC (`path`).
    pub source: &'static str,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCheck {
    pub remote: Option<PackManifest>,
    /// Le manifeste distant n'a pas pu être lu (hors ligne, pas encore publié…).
    pub remote_error: Option<String>,
    pub local: Option<PackManifest>,
    pub installed_version: Option<String>,
    pub installed_crc: Option<u32>,
    /// Pack plus récent que celui en place, à proposer.
    pub offer: Option<Offer>,
}

pub fn url_allowed(url: &str) -> bool {
    url.starts_with(ALLOWED_PREFIX) && !url.contains("..") && !url.contains('@')
}

fn net(e: impl std::fmt::Display) -> PackError {
    PackError::Network(e.to_string())
}

fn fetch_manifest() -> Result<PackManifest, PackError> {
    let resp = ureq::get(MANIFEST_URL)
        .set("User-Agent", "FM Immersion")
        .set("Accept", "application/octet-stream, application/json")
        .timeout(std::time::Duration::from_secs(15))
        .call()
        .map_err(net)?;
    let mut text = String::new();
    resp.into_reader().take(MAX_MANIFEST).read_to_string(&mut text)?;
    faces_pack::parse_manifest(&text).ok_or_else(|| PackError::BadPack("manifeste illisible".into()))
}

/// Faut-il proposer `m` ? Oui s'il n'est pas déjà en place et qu'il est plus récent que la version installée
/// (versions « AAAA-MM-JJ HH:MM:SS » : l'ordre du texte est l'ordre des dates). Version installée inconnue
/// (original, v1.0, pack ancien) : tout pack V2 est plus récent.
pub fn is_newer(m: &PackManifest, installed: Option<(u32, u32)>, installed_version: Option<&str>) -> bool {
    if installed == Some((m.crc, m.size)) {
        return false;
    }
    match (m.version.as_deref(), installed_version) {
        (Some(v), Some(cur)) => v > cur,
        _ => true,
    }
}

/// Choisit le pack à proposer : le plus récent entre celui publié et celui de l'atelier local.
pub fn choose(
    remote: Option<&PackManifest>,
    local: Option<(&PackManifest, &str)>,
    installed: Option<(u32, u32)>,
    installed_version: Option<&str>,
) -> Option<Offer> {
    let local_first = match (remote, local) {
        (Some(r), Some((l, _))) => l.version >= r.version || (l.crc, l.size) == (r.crc, r.size),
        (None, Some(_)) => true,
        _ => false,
    };
    let candidate = if local_first {
        local.map(|(m, path)| Offer { manifest: m.clone(), source: "local", path: Some(path.to_owned()) })
    } else {
        remote.map(|m| Offer { manifest: m.clone(), source: "remote", path: None })
    }?;
    is_newer(&candidate.manifest, installed, installed_version).then_some(candidate)
}

pub fn check(paths: Option<&faces_pack::Paths>, workshop: Option<&Path>, online: bool) -> RemoteCheck {
    let (remote, remote_error) = if online {
        match fetch_manifest() {
            Ok(m) => (Some(m), None),
            Err(e) => (None, Some(e.to_string())),
        }
    } else {
        (None, None)
    };
    // Pack de l'atelier : manifeste + bundle à côté.
    let local = workshop.and_then(|w| {
        faces_pack::workshop_manifests(w).into_iter().next().and_then(|(p, m)| {
            let bundle = p.parent()?.join(faces_pack::BUNDLE);
            (std::fs::metadata(&bundle).ok()?.len() == m.size as u64).then(|| (m, bundle.display().to_string()))
        })
    });
    let entry = paths.and_then(faces_pack::current_entry);
    let installed = entry.map(|e| (e.crc, e.size));
    let installed_version = match (paths, entry) {
        (Some(p), Some(e)) => faces_pack::installed_version(p, e.crc, e.size),
        _ => None,
    };
    let offer = choose(remote.as_ref(), local.as_ref().map(|(m, p)| (m, p.as_str())), installed, installed_version.as_deref());
    RemoteCheck { remote, remote_error, local: local.map(|(m, _)| m), installed_version, installed_crc: installed.map(|i| i.0), offer }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    received: u64,
    total: u64,
    step: &'static str,
}

fn safe_name(version: &str) -> String {
    version.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' }).collect()
}

/// Télécharge le zip du pack publié, vérifie son SHA-256, en extrait le bundle et contrôle taille et CRC.
/// Renvoie le chemin du bundle, prêt pour `faces_install`.
pub fn download(dir: &Path, m: &PackManifest, progress: &dyn Fn(u64, u64, &'static str)) -> Result<PathBuf, PackError> {
    let url = m.url.as_deref().ok_or_else(|| PackError::BadPack("manifeste sans adresse de téléchargement".into()))?;
    if !url_allowed(url) {
        return Err(PackError::BadPack("adresse de téléchargement refusée".into()));
    }
    let expected = m.sha256.as_deref().ok_or_else(|| PackError::BadPack("manifeste sans empreinte SHA-256".into()))?;
    let name = safe_name(m.version.as_deref().unwrap_or("pack"));
    let target = dir.join(&name);
    let bundle = target.join(faces_pack::BUNDLE);
    // Déjà téléchargé et vérifié lors d'une session précédente.
    if std::fs::metadata(&bundle).map(|x| x.len()).ok() == Some(m.size as u64) && faces_pack::unity_crc(&bundle).ok() == Some(m.crc) {
        return Ok(bundle);
    }
    std::fs::create_dir_all(dir)?;
    // Un seul pack téléchargé gardé : les anciens dossiers (~500 Mo chacun) sont retirés.
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            if e.file_name() != name.as_str() && e.path().is_dir() {
                std::fs::remove_dir_all(e.path()).ok();
            }
        }
    }

    let resp = ureq::get(url).set("User-Agent", "FM Immersion").call().map_err(net)?;
    let total = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0u64);
    if total > MAX_ZIP {
        return Err(PackError::BadPack("fichier trop gros".into()));
    }
    let zip_path = dir.join(format!("{name}.zip.part"));
    let mut out = std::io::BufWriter::new(std::fs::File::create(&zip_path)?);
    let mut reader = resp.into_reader().take(MAX_ZIP);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    let (mut received, mut last) = (0u64, 0u64);
    loop {
        let n = reader.read(&mut buf).map_err(net)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        out.write_all(&buf[..n])?;
        received += n as u64;
        if received - last >= 4 << 20 {
            last = received;
            progress(received, total, "download");
        }
    }
    out.flush()?;
    drop(out);
    let got: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if got != expected {
        std::fs::remove_file(&zip_path).ok();
        return Err(PackError::BadPack("zip corrompu (empreinte SHA-256 différente) : relance le téléchargement".into()));
    }

    progress(received, total, "extract");
    let out = extract_bundle(&zip_path, &target, m);
    std::fs::remove_file(&zip_path).ok();
    out
}

/// Extrait le bundle du zip dans `target` et contrôle sa taille et son CRC Unity avant de le garder.
pub fn extract_bundle(zip_path: &Path, target: &Path, m: &PackManifest) -> Result<PathBuf, PackError> {
    std::fs::create_dir_all(target)?;
    let bundle = target.join(faces_pack::BUNDLE);
    let tmp = target.join(format!("{}.part", faces_pack::BUNDLE));
    {
        let mut zip = zip::ZipArchive::new(std::fs::File::open(zip_path)?).map_err(|e| PackError::BadPack(e.to_string()))?;
        let idx = (0..zip.len())
            .find(|&i| zip.by_index(i).is_ok_and(|f| f.name().rsplit(['/', '\\']).next() == Some(faces_pack::BUNDLE)))
            .ok_or_else(|| PackError::BadPack("bundle absent du zip".into()))?;
        let mut entry = zip.by_index(idx).map_err(|e| PackError::BadPack(e.to_string()))?;
        let mut f = std::io::BufWriter::new(std::fs::File::create(&tmp)?);
        std::io::copy(&mut (&mut entry).take(MAX_ZIP), &mut f)?;
        f.flush()?;
    }
    let size_ok = std::fs::metadata(&tmp)?.len() == m.size as u64;
    if !size_ok || faces_pack::unity_crc(&tmp)? != m.crc {
        std::fs::remove_file(&tmp).ok();
        return Err(PackError::BadPack("le bundle extrait ne correspond pas au manifeste (taille ou CRC)".into()));
    }
    std::fs::rename(&tmp, &bundle)?;
    Ok(bundle)
}

// ------------------------------------------------------------------ commandes

#[tauri::command]
pub async fn faces_remote_check(app: tauri::AppHandle, game_dir: String, workshop_dir: Option<String>) -> RemoteCheck {
    tauri::async_runtime::spawn_blocking(move || {
        let game = PathBuf::from(&game_dir);
        let p = crate::faces::paths(&app, &game, workshop_dir.as_deref());
        let workshop = workshop_dir.as_deref().map(str::trim).filter(|w| !w.is_empty()).map(PathBuf::from);
        check(p.as_ref(), workshop.as_deref(), true)
    })
    .await
    .unwrap_or(RemoteCheck { remote: None, remote_error: Some("interrompu".into()), local: None, installed_version: None, installed_crc: None, offer: None })
}

/// Télécharge le pack publié (sur clic du joueur). Progression : évènement `faces-download`.
#[tauri::command]
pub async fn faces_remote_download(app: tauri::AppHandle) -> Result<String, PackError> {
    tauri::async_runtime::spawn_blocking(move || {
        let m = fetch_manifest()?;
        let dir = app.path().app_data_dir().map_err(|e| PackError::Check(e.to_string()))?.join("faces-packs");
        let emit = |received: u64, total: u64, step: &'static str| {
            app.emit("faces-download", DownloadProgress { received, total, step }).ok();
        };
        download(&dir, &m, &emit).map(|p| p.display().to_string())
    })
    .await
    .map_err(|e| PackError::Check(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(version: &str, crc: u32) -> PackManifest {
        PackManifest { version: Some(version.into()), a2b: Some(1), d2: None, v1: None, crc, size: 10, sha256: None, url: None }
    }

    #[test]
    fn propose_seulement_plus_recent() {
        let r = m("2026-11-08 18:00:00", 2);
        // Original ou v1.0 en place (version inconnue) : proposé.
        assert!(is_newer(&r, Some((1, 10)), None));
        // Déjà en place.
        assert!(!is_newer(&r, Some((2, 10)), Some("2026-11-08 18:00:00")));
        // Plus ancien que ce qui est installé (pack local plus avancé chez Amnesix).
        assert!(!is_newer(&r, Some((3, 10)), Some("2026-11-08 19:00:00")));
        assert!(is_newer(&r, Some((3, 10)), Some("2026-11-08 15:04:50")));
    }

    #[test]
    fn choisit_entre_distant_et_atelier() {
        let r = m("2026-11-08 18:00:00", 2);
        let l = m("2026-11-08 19:00:00", 3);
        let o = choose(Some(&r), Some((&l, "D:\\pack.bundle")), Some((1, 10)), None).unwrap();
        assert_eq!(o.source, "local");
        let old_local = m("2026-11-08 12:00:00", 4);
        let o = choose(Some(&r), Some((&old_local, "x")), Some((1, 10)), None).unwrap();
        assert_eq!(o.source, "remote");
        // Le pack local identique au publié : on installe le fichier local, sans téléchargement.
        let same = m("2026-11-08 18:00:00", 2);
        assert_eq!(choose(Some(&r), Some((&same, "x")), None, None).unwrap().source, "local");
        assert!(choose(None, None, None, None).is_none());
        assert!(choose(Some(&r), None, Some((2, 10)), Some("2026-11-08 18:00:00")).is_none());
    }

    #[test]
    fn extrait_et_controle_le_bundle_du_zip() {
        let dir = std::env::temp_dir().join(format!("fmi-remote-zip-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let bytes = crate::faces_pack::tests::fake_bundle(b"portraits v2 publies");
        let bpath = dir.join("b.bundle");
        std::fs::write(&bpath, &bytes).unwrap();
        let crc = faces_pack::unity_crc(&bpath).unwrap();
        let zip_path = dir.join("p.zip");
        {
            let mut z = zip::ZipWriter::new(std::fs::File::create(&zip_path).unwrap());
            let opts = zip::write::SimpleFileOptions::default();
            z.start_file("README_FR.txt", opts).unwrap();
            z.write_all(b"lisez-moi").unwrap();
            z.start_file("FM27-Photoreal-Faces/portraits_assets_all.bundle", opts).unwrap();
            z.write_all(&bytes).unwrap();
            z.finish().unwrap();
        }
        let mut man = m("2026-11-08 18:00:00", crc);
        man.size = bytes.len() as u32;
        let out = extract_bundle(&zip_path, &dir.join("v"), &man).unwrap();
        assert_eq!(std::fs::read(out).unwrap(), bytes);
        man.crc ^= 1;
        assert!(matches!(extract_bundle(&zip_path, &dir.join("w"), &man), Err(PackError::BadPack(_))));
        assert!(!dir.join("w").join(faces_pack::BUNDLE).exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn adresses_autorisees() {
        assert!(url_allowed("https://github.com/amnesix-nt/FM27-Photorealistic-Faces/releases/download/v2-progression/a.zip"));
        assert!(!url_allowed("https://example.com/a.zip"));
        assert!(!url_allowed("https://github.com/amnesix-nt/FM27-Photorealistic-Faces/releases/download/../../x"));
        assert!(!url_allowed("http://github.com/amnesix-nt/FM27-Photorealistic-Faces/releases/download/a.zip"));
    }

    /// Manifeste sans adresse ou avec une adresse étrangère : refusé avant tout accès réseau.
    #[test]
    fn refuse_un_manifeste_incomplet() {
        let dir = std::env::temp_dir().join(format!("fmi-remote-{}", std::process::id()));
        let mut x = m("v", 1);
        let noop = |_: u64, _: u64, _: &'static str| {};
        assert!(matches!(download(&dir, &x, &noop), Err(PackError::BadPack(_))));
        x.url = Some("https://example.com/a.zip".into());
        x.sha256 = Some("00".into());
        assert!(matches!(download(&dir, &x, &noop), Err(PackError::BadPack(_))));
        std::fs::remove_dir_all(&dir).ok();
    }
}
