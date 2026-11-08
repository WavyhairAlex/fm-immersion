//! Copies de secours des sauvegardes FM27, à la demande du joueur.
//!
//! Le fichier `.fm` du dossier `games` est seulement **lu** et copié dans un dossier à part,
//! `fm-immersion-secours\<nom>\`, à côté de `games` (même disque : copie rapide, rien sur C:).
//! Rien n'est jamais écrit dans `games` : pour revenir à une copie, le joueur la recopie lui-même, FM27 fermé.

use crate::fm::games_dir;
use serde::{Serialize, Serializer};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Dossier des copies, à côté de `games`.
pub const BACKUP_DIR: &str = "fm-immersion-secours";
/// Une sauvegarde écrite il y a moins longtemps peut être en cours d'écriture par FM27 : on attend.
const SETTLE: Duration = Duration::from_secs(30);
/// Copies gardées par sauvegarde, au plus (le joueur choisit entre 1 et ce nombre).
const MAX_KEEP: usize = 20;

#[derive(Debug, thiserror::Error)]
pub enum BackupError {
    #[error("dossier invalide")]
    InvalidFolder,
    #[error("nom de sauvegarde invalide")]
    InvalidName,
    #[error("sauvegarde introuvable")]
    NotFound,
    #[error("sauvegarde en cours d'écriture par FM27")]
    Busy,
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl Serialize for BackupError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// Une copie de secours (métadonnées seulement).
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub name: String,
    pub modified_ms: Option<u64>,
    pub bytes: u64,
}

/// Nom de sauvegarde accepté : un simple nom de fichier `.fm`, sans chemin.
fn check_name(name: &str) -> Result<&str, BackupError> {
    let p = Path::new(name);
    let ok = !name.is_empty()
        && !name.contains(['/', '\\', ':'])
        && p.file_name().is_some_and(|f| f == name)
        && p.extension().is_some_and(|x| x.eq_ignore_ascii_case("fm"));
    if !ok {
        return Err(BackupError::InvalidName);
    }
    Ok(p.file_stem().and_then(|s| s.to_str()).ok_or(BackupError::InvalidName)?)
}

/// Étiquette de date choisie par l'appli (heure locale du joueur) : chiffres, espaces, tirets et « h » seulement.
fn clean_label(label: &str) -> String {
    let s: String = label.chars().filter(|c| c.is_ascii_digit() || matches!(c, ' ' | '-' | 'h')).take(32).collect();
    let s = s.trim().to_string();
    if s.is_empty() { "copie".into() } else { s }
}

fn ms(t: SystemTime) -> Option<u64> {
    t.duration_since(UNIX_EPOCH).ok().map(|d| d.as_millis() as u64)
}

fn backup_dir(games: &Path, stem: &str) -> Option<PathBuf> {
    Some(games.parent()?.join(BACKUP_DIR).join(stem))
}

/// Copies d'une sauvegarde, la plus récente d'abord.
pub fn list(games: &Path, name: &str) -> Result<Vec<BackupFile>, BackupError> {
    let stem = check_name(name)?;
    let dir = backup_dir(games, stem).ok_or(BackupError::InvalidFolder)?;
    let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(Vec::new()) };
    let mut out: Vec<BackupFile> = entries
        .flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let name = e.file_name().to_string_lossy().into_owned();
            let is_fm = Path::new(&name).extension().is_some_and(|x| x.eq_ignore_ascii_case("fm"));
            (meta.is_file() && is_fm).then(|| BackupFile { name, modified_ms: meta.modified().ok().and_then(ms), bytes: meta.len() })
        })
        .collect();
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms).then_with(|| b.name.cmp(&a.name)));
    Ok(out)
}

/// Copie la sauvegarde `name` (fichier temporaire puis renommage : jamais de copie à moitié écrite), puis ne garde
/// que les `keep` copies les plus récentes. Une copie du même nom déjà faite n'est pas refaite.
pub fn backup(games: &Path, name: &str, label: &str, keep: usize, now: SystemTime) -> Result<BackupFile, BackupError> {
    let stem = check_name(name)?;
    let src = games.join(name);
    let meta = std::fs::metadata(&src).map_err(|_| BackupError::NotFound)?;
    if !meta.is_file() {
        return Err(BackupError::NotFound);
    }
    if meta.modified().ok().and_then(|m| now.duration_since(m).ok()).is_none_or(|age| age < SETTLE) {
        return Err(BackupError::Busy);
    }
    let dir = backup_dir(games, stem).ok_or(BackupError::InvalidFolder)?;
    std::fs::create_dir_all(&dir)?;
    let dest = dir.join(format!("{stem} {}.fm", clean_label(label)));
    if !dest.exists() {
        let part = dest.with_extension("fm.part");
        if let Err(e) = std::fs::copy(&src, &part).and_then(|_| std::fs::rename(&part, &dest)) {
            let _ = std::fs::remove_file(&part);
            return Err(e.into());
        }
    }
    let all = list(games, name)?;
    for old in all.iter().skip(keep.clamp(1, MAX_KEEP)) {
        let _ = std::fs::remove_file(dir.join(&old.name));
    }
    let m = std::fs::metadata(&dest)?;
    Ok(BackupFile { name: dest.file_name().unwrap_or_default().to_string_lossy().into_owned(), modified_ms: m.modified().ok().and_then(ms), bytes: m.len() })
}

fn games_of(folder: &str) -> Result<PathBuf, BackupError> {
    games_dir(Path::new(folder)).ok_or(BackupError::InvalidFolder)
}

/// Copies de secours d'une sauvegarde (`folder` = dossier du plugin, `games` est à côté).
#[tauri::command]
pub fn fm_backup_list(folder: String, name: String) -> Result<Vec<BackupFile>, BackupError> {
    list(&games_of(&folder)?, &name)
}

/// Fait une copie de secours (fil à part : une sauvegarde pèse ~200 Mo).
#[tauri::command]
pub async fn fm_backup_make(folder: String, name: String, label: String, keep: usize) -> Result<BackupFile, BackupError> {
    tauri::async_runtime::spawn_blocking(move || backup(&games_of(&folder)?, &name, &label, keep, SystemTime::now()))
        .await
        .map_err(|e| BackupError::Io(std::io::Error::other(e.to_string())))?
}

/// Ouvre le dossier des copies d'une sauvegarde dans l'Explorateur (créé s'il n'existe pas encore).
#[tauri::command]
pub fn fm_backup_open(folder: String, name: String) -> Result<(), BackupError> {
    let stem = check_name(&name)?;
    let dir = backup_dir(&games_of(&folder)?, stem).ok_or(BackupError::InvalidFolder)?;
    std::fs::create_dir_all(&dir)?;
    #[cfg(windows)]
    std::process::Command::new("explorer").arg(&dir).spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("fmi-secours-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("games")).unwrap();
        root
    }

    #[test]
    fn refuse_les_noms_avec_un_chemin() {
        for bad in ["", "..\\x.fm", "a/b.fm", "C:x.fm", "x.txt", ".."] {
            assert!(check_name(bad).is_err(), "{bad}");
        }
        assert_eq!(check_name("Malženice.fm").unwrap(), "Malženice");
        assert_eq!(clean_label("2026-11-08 19h45; rm"), "2026-11-08 19h45");
    }

    #[test]
    fn copie_a_cote_de_games_sans_y_toucher_et_garde_les_plus_recentes() {
        let root = setup("copie");
        let games = root.join("games");
        std::fs::write(games.join("Malženice.fm"), b"partie").unwrap();
        let later = SystemTime::now() + Duration::from_secs(60);
        // Fichier tout juste écrit : FM27 est peut-être encore dessus.
        assert!(matches!(backup(&games, "Malženice.fm", "a", 3, SystemTime::now()), Err(BackupError::Busy)));
        assert!(matches!(backup(&games, "Absente.fm", "a", 3, later), Err(BackupError::NotFound)));
        for (i, label) in ["2026-11-01 10h00", "2026-11-02 10h00", "2026-11-03 10h00"].iter().enumerate() {
            let b = backup(&games, "Malženice.fm", label, 10, later).unwrap();
            assert_eq!(b.name, format!("Malženice {label}.fm"));
            assert_eq!(b.bytes, 6);
            // Dates d'écriture distinctes pour l'ordre des copies.
            let f = std::fs::File::options().write(true).open(root.join(BACKUP_DIR).join("Malženice").join(&b.name)).unwrap();
            f.set_modified(SystemTime::now() + Duration::from_secs(i as u64 * 10)).unwrap();
        }
        // Un nouvel appel élague selon les dates : on garde les 2 plus récentes.
        backup(&games, "Malženice.fm", "2026-11-03 10h00", 2, later).unwrap();
        let names: Vec<String> = list(&games, "Malženice.fm").unwrap().into_iter().map(|b| b.name).collect();
        assert_eq!(names, vec!["Malženice 2026-11-03 10h00.fm", "Malženice 2026-11-02 10h00.fm"]);
        // Le dossier games n'a que la sauvegarde d'origine.
        assert_eq!(std::fs::read_dir(&games).unwrap().count(), 1);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
