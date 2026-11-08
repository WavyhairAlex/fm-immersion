//! Avancement de la génération des portraits, lu dans le dossier de l'atelier (`FM27-PhotoReal`).
//!
//! Lecture seule : on compte les images déjà produites, on ne lance ni n'arrête rien.
//! - V1 : `out_full\portrait_*.png` (14 000 portraits, pack publié) ;
//! - V2, base qualité (tranche 25 ans) : `v2\out_A2b\portrait_*.png`, état du lot dans `v2\lot_A2b` ;
//! - variantes d'âge : `age_variants\<tranche>\portrait_*.png` (et `_<k>.png`, variantes par personne),
//!   comptées par portrait du catalogue.

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Nombre de portraits du catalogue NewGenPortraitsCatalog de FM27.
pub const TOTAL: u32 = 14_000;
pub const AGES: [u32; 6] = [15, 20, 25, 30, 35, 40];

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LotState {
    /// Pas encore commencé.
    None,
    Running,
    /// En pause (`PAUSE.txt`) : le lot reprend seul quand le fichier disparaît.
    Paused,
    /// Arrêté : il faut le relancer.
    Stopped,
    Finished,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage {
    pub done: u32,
    pub state: LotState,
    /// Fin estimée écrite par le lot (texte local « AAAA-MM-JJ HH:MM »).
    pub eta: Option<String>,
    /// Dernière activité du lot (millisecondes depuis 1970).
    pub updated_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgeStage {
    pub age: u32,
    pub done: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub found: bool,
    pub total: u32,
    pub v1: Stage,
    pub v2: Stage,
    pub ages: Vec<AgeStage>,
    /// Version complète : base 25 ans (V2) + les cinq autres tranches, sur 6 × 14 000 portraits (en ‰ pour garder une décimale).
    pub complete_permille: u32,
    /// Dernier pack construit dans l'atelier (`build\portraits_assets_all.bundle`), s'il existe.
    pub built_pack: Option<String>,
    pub built_ms: Option<u64>,
}

/// Nom du portrait du catalogue : `portrait_male-0-1-11-5-0_2.png` → `portrait_male-0-1-11-5-0`.
pub fn base_name(file: &str) -> Option<&str> {
    let stem = file.strip_suffix(".png")?;
    if !stem.starts_with("portrait_") {
        return None;
    }
    match stem.rsplit_once('_') {
        Some((base, k)) if base.len() > "portrait".len() && !k.is_empty() && k.bytes().all(|b| b.is_ascii_digit()) => Some(base),
        _ => Some(stem),
    }
}

/// Nombre de portraits distincts du catalogue présents dans un dossier.
pub fn count_portraits(dir: &Path) -> u32 {
    let Ok(rd) = std::fs::read_dir(dir) else { return 0 };
    let mut seen = HashSet::new();
    for e in rd.flatten() {
        if let Some(name) = e.file_name().to_str() {
            if let Some(b) = base_name(name) {
                seen.insert(b.to_owned());
            }
        }
    }
    seen.len() as u32
}

fn mtime_ms(p: &Path) -> Option<u64> {
    let t = std::fs::metadata(p).ok()?.modified().ok()?;
    Some(t.duration_since(SystemTime::UNIX_EPOCH).ok()?.as_millis() as u64)
}

/// « fin estimee: 2026-11-10 00:03 (~79.4 h …) » → « 2026-11-10 00:03 ».
pub fn parse_eta(progress: &str) -> Option<String> {
    let line = progress.lines().find(|l| l.trim_start().starts_with("fin estimee"))?;
    let rest = line.split_once(':')?.1.trim();
    let eta: String = rest.chars().take(16).collect();
    (eta.len() == 16 && eta.as_bytes()[4] == b'-').then_some(eta)
}

/// État d'un lot. `marker` : contenu d'ETAT.txt ; `alive` : le processus de veille du lot tourne
/// (`veille.pid` pointe vers un processus vivant) ; `paused` : `PAUSE.txt` présent.
/// « En cours » seulement si la veille tourne : un journal récent ne suffit pas.
pub fn lot_state(marker: Option<&str>, done: u32, alive: bool, paused: bool) -> LotState {
    let marker = marker.unwrap_or("").to_uppercase();
    if done >= TOTAL || marker.contains("FINI OK") || marker.contains("COMPLETE") {
        LotState::Finished
    } else if alive && paused {
        LotState::Paused
    } else if alive {
        LotState::Running
    } else if done == 0 && marker.is_empty() {
        LotState::None
    } else {
        LotState::Stopped
    }
}

/// Le processus `pid` existe-t-il ? (liste des processus Windows, sans fenêtre de console)
#[cfg(windows)]
fn pid_alive(pid: u32) -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&format!("\"{pid}\"")))
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn pid_alive(_pid: u32) -> bool {
    false
}

fn lot_stage(out: &Path, lot: &Path) -> Stage {
    let done = count_portraits(out).min(TOTAL);
    let updated_ms = [lot.join("run.log"), lot.join("progress.txt"), lot.join("ETAT.txt")].iter().filter_map(|p| mtime_ms(p)).max();
    let alive = std::fs::read_to_string(lot.join("veille.pid")).ok().and_then(|t| t.trim().parse().ok()).is_some_and(pid_alive);
    let paused = lot.join("PAUSE.txt").is_file();
    let etat = std::fs::read_to_string(lot.join("ETAT.txt")).ok();
    let state = lot_state(etat.as_deref(), done, alive, paused);
    let eta = match state {
        LotState::Running => std::fs::read_to_string(lot.join("progress.txt")).ok().and_then(|t| parse_eta(&t)),
        _ => None,
    };
    Stage { done, state, eta, updated_ms }
}

pub fn read(workshop: &Path) -> Progress {
    let found = workshop.is_absolute() && workshop.join("out_full").is_dir();
    let v1_done = count_portraits(&workshop.join("out_full")).min(TOTAL);
    let v1 = Stage {
        done: v1_done,
        state: if v1_done >= TOTAL { LotState::Finished } else if v1_done > 0 { LotState::Stopped } else { LotState::None },
        eta: None,
        updated_ms: None,
    };
    let v2 = lot_stage(&workshop.join("v2").join("out_A2b"), &workshop.join("v2").join("lot_A2b"));
    let ages: Vec<AgeStage> = AGES
        .iter()
        .map(|&age| AgeStage { age, done: count_portraits(&workshop.join("age_variants").join(age.to_string())).min(TOTAL) })
        .collect();
    let other: u32 = ages.iter().filter(|a| a.age != 25).map(|a| a.done).sum();
    let complete_permille = ((v2.done + other) as u64 * 1000 / (TOTAL as u64 * AGES.len() as u64)) as u32;
    // Pack proposé : le plus récent de l'atelier (V2 de la bascule automatique, sinon pack V1 de `build`).
    let built: Option<(PathBuf, u64)> = [workshop.join("v2").join("pack"), workshop.join("build")]
        .into_iter()
        .map(|d| d.join(crate::faces_pack::BUNDLE))
        .filter_map(|p| mtime_ms(&p).map(|m| (p, m)))
        .max_by_key(|(_, m)| *m);
    let built_pack = built.as_ref().map(|(p, _)| p.display().to_string());
    let built_ms = built.map(|(_, m)| m);
    Progress { found, total: TOTAL, v1, v2, ages, complete_permille, built_ms, built_pack }
}

/// Dossier de l'atelier par défaut : `X:\FM27-PhotoReal` sur le premier disque où il existe.
pub fn default_workshop() -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    (b'C'..=b'Z')
        .map(|d| PathBuf::from(format!("{}:\\FM27-PhotoReal", d as char)))
        .find(|p| p.join("out_full").is_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nom_de_base_des_portraits() {
        assert_eq!(base_name("portrait_male-0-1-11-5-0.png"), Some("portrait_male-0-1-11-5-0"));
        assert_eq!(base_name("portrait_male-0-1-11-5-0_2.png"), Some("portrait_male-0-1-11-5-0"));
        assert_eq!(base_name("portrait_female-10-8-17-4-1_12.png"), Some("portrait_female-10-8-17-4-1"));
        assert_eq!(base_name("PAUSE"), None);
        assert_eq!(base_name("apercu.png"), None);
    }

    #[test]
    fn fin_estimee_et_etat_du_lot() {
        let p = "2026-11-06 16:42:09 en cours\ntermines 900/14000 (6.4 %)\nfin estimee: 2026-11-10 00:03 (~79.4 h de GPU)\n";
        assert_eq!(parse_eta(p).as_deref(), Some("2026-11-10 00:03"));
        assert_eq!(parse_eta("rien"), None);
        assert_eq!(lot_state(Some("2026-11-06 17:00:22 FIN ARRETE, 900 portraits"), 900, false, false), LotState::Stopped);
        assert_eq!(lot_state(Some("2026-11-05 21:31:15 FINI OK"), 200, false, false), LotState::Finished);
        assert_eq!(lot_state(None, 120, true, false), LotState::Running);
        assert_eq!(lot_state(None, 120, true, true), LotState::Paused);
        // Journal récent mais veille arrêtée : pas « en cours ».
        assert_eq!(lot_state(None, 120, false, true), LotState::Stopped);
        assert_eq!(lot_state(None, 0, false, false), LotState::None);
        assert_eq!(lot_state(None, TOTAL, false, false), LotState::Finished);
    }

    #[test]
    fn compte_l_atelier() {
        let root = std::env::temp_dir().join(format!("fmi-atelier-{}", std::process::id()));
        std::fs::remove_dir_all(&root).ok();
        let touch = |rel: &str| {
            let p = root.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, b"").unwrap();
        };
        touch("out_full/portrait_male-1-2-3-4-0.png");
        touch("out_full/portrait_female-1-2-3-4-1.png");
        touch("out_full/PAUSE");
        touch("v2/out_A2b/portrait_male-1-2-3-4-0.png");
        touch("v2/lot_A2b/ETAT.txt");
        std::fs::write(root.join("v2/lot_A2b/ETAT.txt"), "2026-11-06 17:00:22 FIN ARRETE, 1 portraits").unwrap();
        for k in ["", "_0", "_1", "_2"] {
            touch(&format!("age_variants/15/portrait_male-1-2-3-4-0{k}.png"));
        }
        touch("age_variants/40/portrait_male-1-2-3-4-0.png");
        touch("age_variants/40/portrait_female-1-2-3-4-1.png");
        // Veille déclarée mais processus introuvable : le lot est arrêté.
        std::fs::write(root.join("v2/lot_A2b/veille.pid"), "4000000000").unwrap();
        let p = read(&root);
        assert!(p.found);
        assert_eq!(p.v1.done, 2);
        assert_eq!(p.v2.done, 1);
        assert_eq!(p.v2.state, LotState::Stopped);
        assert_eq!(p.ages.iter().map(|a| a.done).collect::<Vec<_>>(), vec![1, 0, 0, 0, 0, 2]);
        // (1 base V2 + 1 + 2) / 84 000 = 0,0476 ‰ → 0
        assert_eq!(p.complete_permille, 0);
        assert!(p.built_pack.is_none());
        // Pack proposé : le plus récent entre build\ (V1) et v2\pack\ (bascule V2).
        touch("build/portraits_assets_all.bundle");
        touch("v2/pack/portraits_assets_all.bundle");
        let old = SystemTime::now() - std::time::Duration::from_secs(86_400);
        std::fs::File::options().write(true).open(root.join("build/portraits_assets_all.bundle")).unwrap().set_modified(old).unwrap();
        let p = read(&root);
        assert!(p.built_pack.unwrap().contains("pack"));
        std::fs::remove_dir_all(&root).ok();
    }
}
