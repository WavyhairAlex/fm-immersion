//! Chaîne complète d'une photo de situation : plusieurs candidats générés par ComfyUI (Qwen Image Edit), porte
//! qualité par questions oui/non (Qwen2.5-VL, le même encodeur de texte que le modèle), détection des logos
//! (OWLv2) et passe de nettoyage, puis rangement de l'image retenue dans `photos/library/` avec son compte rendu.
//!
//! Tout tourne sur le PC, hors ligne. La carte graphique est partagée : l'IA de rédaction (Ollama) est déchargée
//! avant de générer, et ComfyUI rend ses modèles (ou est arrêté sous 12 Go de mémoire vidéo) avant la porte
//! qualité, qui a besoin de la carte pour elle seule.

use crate::photos_engine as engine;
use crate::photos_remote::{self, PhotosError};
use crate::photos_scenes as scenes;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

/// Script Python embarqué (croquis, porte qualité, logos), écrit dans `photos/scripts/` avant chaque usage.
pub const SCRIPT: &str = include_str!("../photos-scripts/fmi_photos.py");
pub const SCRIPT_NAME: &str = "fmi_photos.py";
pub const LIBRARY_SUBDIR: &str = "library";
const SCRIPTS_SUBDIR: &str = "scripts";
const SCRIPTS_LOG: &str = "scripts.log";
/// En dessous, la porte qualité ne tient pas à côté des modèles de ComfyUI : on arrête ComfyUI le temps de la porte.
const VRAM_SHARE_MIN: u64 = 12 * 1024 * 1024 * 1024;
const DEFAULT_CANDIDATES: u8 = 3;
const MAX_CANDIDATES: u8 = 4;
const MAX_IMAGE: usize = 8 << 20;
const GATE_TIMEOUT: Duration = Duration::from_secs(900);
const LOGOS_TIMEOUT: Duration = Duration::from_secs(600);
const SKETCH_TIMEOUT: Duration = Duration::from_secs(120);

static PIPELINE: Mutex<()> = Mutex::new(());

fn io(e: impl std::fmt::Display) -> PhotosError {
    PhotosError::Io(e.to_string())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub scene: String,
    /// Visages en PNG : 1 (joueur ou coach) ou 2 (duo : coach puis joueur).
    pub faces: Vec<Vec<u8>>,
    /// Maillot du club (image du pack de kits, PNG), scènes de joueur seulement.
    #[serde(default)]
    pub kit: Option<Vec<u8>>,
    #[serde(default)]
    pub candidates: Option<u8>,
    #[serde(default)]
    pub seed: Option<u64>,
    /// Clé de l'événement (dépêche, exploit…) : la photo est retrouvée dans la bibliothèque sans être refaite.
    #[serde(default)]
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidateReport {
    pub seed: u64,
    pub place: String,
    pub light: String,
    pub angle: String,
    pub accepted: Option<bool>,
    pub score: Option<f32>,
    pub reasons: Vec<String>,
}

/// Compte rendu d'une photo : écrit en JSON à côté de l'image dans `library/`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub scene: String,
    #[serde(default)]
    pub tag: Option<String>,
    /// Chemin absolu de l'image finale.
    pub file: String,
    pub created_at: String,
    pub seed: u64,
    /// Verdict de la porte qualité sur l'image retenue (None si la porte n'a pas pu tourner).
    pub accepted: Option<bool>,
    pub score: Option<f32>,
    pub reasons: Vec<String>,
    pub logos_before: Option<u32>,
    pub logos_after: Option<u32>,
    /// La passe de nettoyage a remplacé l'image.
    pub cleaned: bool,
    /// Un logo trop grand pour être nettoyé : mieux vaut relancer.
    pub regenerate: bool,
    pub candidates: Vec<CandidateReport>,
    pub warnings: Vec<String>,
    pub seconds: f32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineProgress {
    pub step: &'static str,
    pub index: u32,
    pub total: u32,
}

// ------------------------------------------------------------------ verdicts des scripts

#[derive(Debug, Deserialize)]
struct GateVerdict {
    accepted: bool,
    reasons: Vec<String>,
    score: f32,
}

#[derive(Debug, Deserialize)]
struct LogoVerdict {
    count: u32,
    #[serde(default)]
    regenerate: bool,
}

/// Choisit le meilleur candidat : les acceptés d'abord, puis le moins de motifs de rejet, puis le meilleur score.
pub fn choose(verdicts: &[(bool, usize, f32)]) -> usize {
    let mut best = 0;
    for (i, v) in verdicts.iter().enumerate() {
        let b = verdicts[best];
        let key = |x: &(bool, usize, f32)| (x.0, usize::MAX - x.1, (x.2 * 1000.0) as i64);
        if key(v) > key(&b) {
            best = i;
        }
    }
    best
}

/// ComfyUI doit-il être arrêté pendant la porte qualité ? Oui sous 12 Go (ou si la carte est inconnue).
pub fn must_stop_for_gate(vram_total: Option<u64>) -> bool {
    vram_total.map(|v| v < VRAM_SHARE_MIN).unwrap_or(true)
}

/// Nom du fichier final : `<scène>-<horodatage>-s<graine>.png`.
pub fn final_name(scene: &str, run: u64, seed: u64) -> String {
    format!("{scene}-{run}-s{seed}.png")
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn iso_now() -> String {
    let t = now_secs() as i64;
    let days = t.div_euclid(86_400);
    let rem = t.rem_euclid(86_400);
    let (h, m, s) = (rem / 3600, rem % 3600 / 60, rem % 60);
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

// ------------------------------------------------------------------ scripts Python

fn scripts_dir(photos_dir: &Path) -> PathBuf {
    photos_dir.join(SCRIPTS_SUBDIR)
}

/// Écrit le script embarqué (toujours la version de l'appli) et renvoie son chemin.
pub fn write_script(photos_dir: &Path) -> Result<PathBuf, PhotosError> {
    let dir = scripts_dir(photos_dir);
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(SCRIPT_NAME);
    if std::fs::read_to_string(&path).ok().as_deref() != Some(SCRIPT) {
        std::fs::write(&path, SCRIPT)?;
    }
    Ok(path)
}

/// Lance le Python embarqué de ComfyUI sur le script, hors ligne, sans fenêtre ; sortie dans `photos/scripts.log`.
fn run_python(photos_dir: &Path, python: &Path, args: &[String], timeout: Duration) -> Result<(), PhotosError> {
    let script = write_script(photos_dir)?;
    let log = std::fs::OpenOptions::new().create(true).append(true).open(photos_dir.join(SCRIPTS_LOG))?;
    let mut cmd = Command::new(python);
    cmd.arg("-B").arg("-s").arg(&script).args(args);
    cmd.current_dir(scripts_dir(photos_dir))
        .env("HF_HUB_OFFLINE", "1")
        .env("TRANSFORMERS_OFFLINE", "1")
        .env("HF_HUB_DISABLE_TELEMETRY", "1")
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| PhotosError::Io(format!("lancement de Python impossible : {e}")))?;
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            if status.success() {
                return Ok(());
            }
            return Err(PhotosError::Io(format!("le script {} a échoué ({status}) : voir {}", args.first().map(String::as_str).unwrap_or(""), SCRIPTS_LOG)));
        }
        if started.elapsed() > timeout {
            child.kill().ok();
            return Err(PhotosError::Io(format!("le script {} n'a pas fini en {} s", args.first().map(String::as_str).unwrap_or(""), timeout.as_secs())));
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

fn sketch_file(photos_dir: &Path, python: &Path, kind: scenes::Sketch) -> Result<String, PhotosError> {
    let name = match kind {
        scenes::Sketch::Civiere => "fmi-sketch-civiere.png",
        scenes::Sketch::Duo => "fmi-sketch-duo.png",
    };
    let path = photos_dir.join("input").join(name);
    if !path.is_file() {
        std::fs::create_dir_all(photos_dir.join("input"))?;
        let kind_arg = match kind {
            scenes::Sketch::Civiere => "civiere",
            scenes::Sketch::Duo => "duo",
        };
        run_python(photos_dir, python, &["sketch".into(), kind_arg.into(), path.to_string_lossy().into_owned()], SKETCH_TIMEOUT)?;
    }
    Ok(name.to_string())
}

fn gate(photos_dir: &Path, python: &Path, tokenizer: &Path, scene: &scenes::Scene, files: &[PathBuf], run: u64) -> Result<Vec<GateVerdict>, PhotosError> {
    let model = photos_remote::manifest()
        .files
        .iter()
        .find(|f| f.dest.starts_with("models/text_encoders/"))
        .map(|f| photos_remote::dest_path(photos_dir, f))
        .ok_or_else(|| PhotosError::Manifest("encodeur de texte absent du manifeste".into()))?;
    let questions: Vec<serde_json::Value> = scenes::questions(scene)
        .iter()
        .map(|q| serde_json::json!({ "id": q.id, "text": q.text, "expected": q.expected, "threshold": q.threshold }))
        .collect();
    let mut jobs = serde_json::Map::new();
    for (i, f) in files.iter().enumerate() {
        jobs.insert(format!("c{i}"), serde_json::json!({ "path": f.to_string_lossy(), "questions": questions }));
    }
    let dir = scripts_dir(photos_dir);
    std::fs::create_dir_all(&dir)?;
    let jobs_path = dir.join(format!("run-{run}-gate.json"));
    let out_path = dir.join(format!("run-{run}-gate-out.json"));
    std::fs::write(&jobs_path, serde_json::to_vec(&jobs).map_err(io)?)?;
    let args = ["gate".to_string(), model.to_string_lossy().into_owned(), tokenizer.to_string_lossy().into_owned(), jobs_path.to_string_lossy().into_owned(), out_path.to_string_lossy().into_owned()];
    let result = run_python(photos_dir, python, &args, GATE_TIMEOUT);
    let parsed = result.and_then(|_| {
        let v: serde_json::Map<String, serde_json::Value> = serde_json::from_slice(&std::fs::read(&out_path)?).map_err(io)?;
        (0..files.len())
            .map(|i| v.get(&format!("c{i}")).cloned().ok_or_else(|| PhotosError::Io(format!("porte qualité : pas de verdict pour le candidat {i}"))).and_then(|x| serde_json::from_value(x).map_err(io)))
            .collect()
    });
    std::fs::remove_file(&jobs_path).ok();
    std::fs::remove_file(&out_path).ok();
    parsed
}

fn logos(photos_dir: &Path, python: &Path, file: &Path, run: u64, tag: &str) -> Result<LogoVerdict, PhotosError> {
    let owl_dir = photos_remote::manifest()
        .files
        .iter()
        .find(|f| f.component == "owlv2")
        .map(|f| photos_remote::dest_path(photos_dir, f))
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .ok_or_else(|| PhotosError::Manifest("OWLv2 absent du manifeste".into()))?;
    let dir = scripts_dir(photos_dir);
    let jobs_path = dir.join(format!("run-{run}-logos-{tag}.json"));
    let out_path = dir.join(format!("run-{run}-logos-{tag}-out.json"));
    std::fs::write(&jobs_path, serde_json::to_vec(&serde_json::json!({ "x": file.to_string_lossy() })).map_err(io)?)?;
    let args = ["logos".to_string(), owl_dir.to_string_lossy().into_owned(), jobs_path.to_string_lossy().into_owned(), out_path.to_string_lossy().into_owned()];
    let result = run_python(photos_dir, python, &args, LOGOS_TIMEOUT).and_then(|_| {
        let v: serde_json::Value = serde_json::from_slice(&std::fs::read(&out_path)?).map_err(io)?;
        serde_json::from_value(v.get("x").cloned().unwrap_or_default()).map_err(io)
    });
    std::fs::remove_file(&jobs_path).ok();
    std::fs::remove_file(&out_path).ok();
    result
}

// ------------------------------------------------------------------ chaîne

/// Génère une photo de situation complète. `emit` reçoit l'avancement (étape, index, total).
pub fn generate(photos_dir: &Path, req: &GenerateRequest, emit: &dyn Fn(&'static str, u32, u32)) -> Result<Outcome, PhotosError> {
    let _guard = PIPELINE.try_lock().map_err(|_| PhotosError::Busy)?;
    let started = Instant::now();
    let scene = scenes::scene(&req.scene).ok_or_else(|| PhotosError::Io(format!("scène inconnue : {}", req.scene)))?;
    if req.faces.len() != scene.faces as usize {
        return Err(PhotosError::Io(format!("la scène {} attend {} visage(s), {} reçu(s)", scene.key, scene.faces, req.faces.len())));
    }
    if req.faces.iter().chain(req.kit.iter()).any(|b| b.is_empty() || b.len() > MAX_IMAGE) {
        return Err(PhotosError::Io("image vide ou trop grande (8 Mo au plus)".into()));
    }
    let (python, tokenizer) = engine::python_and_tokenizer(photos_dir).ok_or_else(|| PhotosError::Io("moteur non installé".into()))?;
    let models = engine::models_from_manifest(photos_remote::manifest()).ok_or_else(|| PhotosError::Manifest("modèles absents du manifeste".into()))?;
    let n = req.candidates.unwrap_or(DEFAULT_CANDIDATES).clamp(1, MAX_CANDIDATES) as u32;
    let run = now_secs();
    let base = req.seed.unwrap_or_else(|| (run % 1_000_000) * 100);
    let use_kit = req.kit.is_some() && scene.role == scenes::Role::Player;
    let mut warnings = Vec::new();

    // Entrées : visages, maillot, croquis.
    emit("prepare", 0, n);
    let input = photos_dir.join("input");
    std::fs::create_dir_all(&input)?;
    let mut images: Vec<String> = Vec::new();
    for (i, png) in req.faces.iter().enumerate() {
        let name = format!("fmi-run-{run}-face{}.png", i + 1);
        std::fs::write(input.join(&name), png)?;
        images.push(name);
    }
    if use_kit {
        let name = format!("fmi-run-{run}-kit.png");
        std::fs::write(input.join(&name), req.kit.as_ref().unwrap())?;
        images.push(name);
    }
    if let Some(kind) = scene.sketch {
        images.push(sketch_file(photos_dir, &python, kind)?);
    }
    let image_refs: Vec<&str> = images.iter().map(String::as_str).collect();

    // Candidats.
    crate::ai::unload_all();
    emit("start", 0, n);
    let mut port = engine::start(photos_dir)?;
    let mut files = Vec::new();
    let mut reports = Vec::new();
    for i in 0..n {
        emit("generate", i + 1, n);
        let d = scenes::draw(scene, base, i, use_kit);
        let graph = engine::build_workflow(&models, &d.prompt, &image_refs, d.seed, scene.width, scene.height, &format!("fmi/run-{run}/c{i}"));
        let out = engine::run_workflow(port, photos_dir, &graph, &|_| {})?;
        let f = out.into_iter().next().ok_or_else(|| PhotosError::Io("aucune image produite".into()))?;
        files.push(f);
        reports.push(CandidateReport { seed: d.seed, place: d.place.into(), light: d.light.into(), angle: d.angle.into(), accepted: None, score: None, reasons: vec![] });
    }

    // Porte qualité : la carte pour elle seule.
    emit("gate", 0, n);
    let stop_engine = must_stop_for_gate(engine::vram_total(port));
    if stop_engine {
        engine::stop();
    } else if !engine::free_models(port) {
        warnings.push("ComfyUI n'a pas rendu sa mémoire avant la porte qualité".into());
    }
    let chosen = match gate(photos_dir, &python, &tokenizer, scene, &files, run) {
        Ok(verdicts) => {
            for (r, v) in reports.iter_mut().zip(&verdicts) {
                r.accepted = Some(v.accepted);
                r.score = Some(v.score);
                r.reasons = v.reasons.clone();
            }
            let keys: Vec<(bool, usize, f32)> = verdicts.iter().map(|v| (v.accepted, v.reasons.len(), v.score)).collect();
            choose(&keys)
        }
        Err(e) => {
            warnings.push(format!("porte qualité indisponible : {e}"));
            0
        }
    };

    // Logos sur l'image retenue, nettoyage si besoin.
    emit("logos", 0, n);
    let mut final_file = files[chosen].clone();
    let (mut before, mut after, mut cleaned, mut regenerate) = (None, None, false, false);
    match logos(photos_dir, &python, &final_file, run, "avant") {
        Ok(v) => {
            before = Some(v.count);
            regenerate = v.regenerate;
            if v.count > 0 && !v.regenerate {
                emit("cleanup", 0, n);
                if stop_engine {
                    port = engine::start(photos_dir)?;
                }
                let src_name = format!("fmi-run-{run}-clean.png");
                std::fs::copy(&final_file, input.join(&src_name))?;
                let graph = engine::build_workflow(&models, scenes::CLEANUP, &[src_name.as_str()], base.wrapping_add(900), scene.width, scene.height, &format!("fmi/run-{run}/clean"));
                match engine::run_workflow(port, photos_dir, &graph, &|_| {}) {
                    Ok(out) if !out.is_empty() => {
                        let cleaned_file = out[0].clone();
                        if stop_engine {
                            engine::stop();
                        }
                        match logos(photos_dir, &python, &cleaned_file, run, "apres") {
                            Ok(v2) if v2.count < v.count => {
                                after = Some(v2.count);
                                cleaned = true;
                                final_file = cleaned_file;
                            }
                            Ok(v2) => after = Some(v2.count.min(v.count)),
                            Err(e) => warnings.push(format!("recontrôle des logos impossible : {e}")),
                        }
                    }
                    Ok(_) => warnings.push("passe de nettoyage sans image".into()),
                    Err(e) => warnings.push(format!("passe de nettoyage impossible : {e}")),
                }
                std::fs::remove_file(input.join(&src_name)).ok();
            } else {
                after = Some(v.count);
            }
        }
        Err(e) => warnings.push(format!("détection des logos indisponible : {e}")),
    }

    // Rangement.
    emit("save", 0, n);
    let library = photos_dir.join(LIBRARY_SUBDIR);
    std::fs::create_dir_all(&library)?;
    let seed = reports[chosen].seed;
    let dest = library.join(final_name(scene.key, run, seed));
    std::fs::copy(&final_file, &dest)?;
    let outcome = Outcome {
        scene: scene.key.into(),
        tag: req.tag.clone(),
        file: dest.to_string_lossy().into_owned(),
        created_at: iso_now(),
        seed,
        accepted: reports[chosen].accepted,
        score: reports[chosen].score,
        reasons: reports[chosen].reasons.clone(),
        logos_before: before,
        logos_after: after,
        cleaned,
        regenerate,
        candidates: reports,
        warnings,
        seconds: started.elapsed().as_secs_f32(),
    };
    std::fs::write(dest.with_extension("json"), serde_json::to_vec_pretty(&outcome).map_err(io)?)?;
    // Ménage : candidats et entrées de ce tirage.
    std::fs::remove_dir_all(photos_dir.join("output").join("fmi").join(format!("run-{run}"))).ok();
    for name in &images {
        if name.starts_with("fmi-run-") {
            std::fs::remove_file(input.join(name)).ok();
        }
    }
    emit("done", n, n);
    Ok(outcome)
}

// ------------------------------------------------------------------ bibliothèque

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneInfo {
    pub key: &'static str,
    pub role: scenes::Role,
    pub faces: u8,
    pub injury: bool,
    /// Image 1 = la photo du coach.
    pub needs_coach: bool,
    pub width: u32,
    pub height: u32,
}

pub fn scene_infos() -> Vec<SceneInfo> {
    scenes::SCENES.iter().map(|s| SceneInfo { key: s.key, role: s.role, faces: s.faces, injury: s.injury, needs_coach: scenes::needs_coach(s), width: s.width, height: s.height }).collect()
}

/// Les comptes rendus de `library/`, du plus récent au plus ancien.
pub fn library(photos_dir: &Path) -> Vec<Outcome> {
    let Ok(rd) = std::fs::read_dir(photos_dir.join(LIBRARY_SUBDIR)) else { return vec![] };
    let mut out: Vec<Outcome> = rd
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|e| serde_json::from_slice::<Outcome>(&std::fs::read(e.path()).ok()?).ok())
        .filter(|o| Path::new(&o.file).is_file())
        .collect();
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    out
}

/// La photo déjà faite pour cet événement, s'il y en a une (la plus récente).
pub fn library_find(photos_dir: &Path, tag: &str) -> Option<Outcome> {
    library(photos_dir).into_iter().find(|o| o.tag.as_deref() == Some(tag))
}

/// Vrai si `file` est bien une image de `library/` (pas d'autre fichier lisible par ce chemin).
pub fn in_library(photos_dir: &Path, file: &Path) -> bool {
    let Ok(lib) = photos_dir.join(LIBRARY_SUBDIR).canonicalize() else { return false };
    file.canonicalize().map(|f| f.starts_with(&lib) && f.extension().and_then(|x| x.to_str()) == Some("png")).unwrap_or(false)
}

// ------------------------------------------------------------------ commandes Tauri

fn photos_dir(app: &tauri::AppHandle) -> Result<PathBuf, PhotosError> {
    Ok(app.path().app_local_data_dir().map_err(io)?.join(photos_remote::DIR_NAME))
}

#[tauri::command]
pub fn photos_scenes() -> Vec<SceneInfo> {
    scene_infos()
}

/// Génère une photo de situation (sur clic du joueur). Émet « photos-pipeline » pendant le travail.
#[tauri::command]
pub async fn photos_generate(app: tauri::AppHandle, request: GenerateRequest) -> Result<Outcome, PhotosError> {
    let dir = photos_dir(&app)?;
    let emitter = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        generate(&dir, &request, &|step, index, total| {
            emitter.emit("photos-pipeline", PipelineProgress { step, index, total }).ok();
        })
    })
    .await
    .map_err(io)?
}

#[tauri::command]
pub async fn photos_library(app: tauri::AppHandle) -> Result<Vec<Outcome>, PhotosError> {
    Ok(library(&photos_dir(&app)?))
}

#[tauri::command]
pub async fn photos_library_find(app: tauri::AppHandle, tag: String) -> Result<Option<Outcome>, PhotosError> {
    Ok(library_find(&photos_dir(&app)?, &tag))
}

/// Octets PNG d'une image de la bibliothèque.
#[tauri::command]
pub async fn photos_library_read(app: tauri::AppHandle, file: String) -> Result<tauri::ipc::Response, PhotosError> {
    let dir = photos_dir(&app)?;
    let path = PathBuf::from(&file);
    if !in_library(&dir, &path) {
        return Err(PhotosError::Io("fichier hors de la bibliothèque".into()));
    }
    Ok(tauri::ipc::Response::new(std::fs::read(path)?))
}

/// Supprime une image de la bibliothèque et son compte rendu.
#[tauri::command]
pub async fn photos_library_delete(app: tauri::AppHandle, file: String) -> Result<(), PhotosError> {
    let dir = photos_dir(&app)?;
    let path = PathBuf::from(&file);
    if !in_library(&dir, &path) {
        return Err(PhotosError::Io("fichier hors de la bibliothèque".into()));
    }
    std::fs::remove_file(&path)?;
    std::fs::remove_file(path.with_extension("json")).ok();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn choix_du_meilleur_candidat() {
        // acceptés d'abord
        assert_eq!(choose(&[(false, 1, 0.9), (true, 0, 0.6), (true, 0, 0.7)]), 2);
        // puis le moins de motifs
        assert_eq!(choose(&[(false, 2, 0.9), (false, 1, 0.5), (false, 3, 0.95)]), 1);
        // puis le score
        assert_eq!(choose(&[(true, 0, 0.61), (true, 0, 0.6)]), 0);
        assert_eq!(choose(&[(false, 1, 0.1)]), 0);
    }

    #[test]
    fn arret_du_moteur_selon_la_carte() {
        assert!(must_stop_for_gate(Some(8 * 1024 * 1024 * 1024)));
        assert!(must_stop_for_gate(None));
        assert!(!must_stop_for_gate(Some(16 * 1024 * 1024 * 1024)));
        assert!(!must_stop_for_gate(Some(12 * 1024 * 1024 * 1024)));
    }

    #[test]
    fn script_embarque_et_nom_final() {
        assert!(SCRIPT.contains("def gate(") && SCRIPT.contains("def logos(") && SCRIPT.contains("def sketch("));
        assert!(SCRIPT.contains("HF_HUB_OFFLINE"));
        assert_eq!(final_name("banc", 1_700_000_000, 42), "banc-1700000000-s42.png");
        let dir = std::env::temp_dir().join(format!("fmi-photos-test-{}", now_secs()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = write_script(&dir).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), SCRIPT);
        assert!(!in_library(&dir, &p));
        let lib = dir.join(LIBRARY_SUBDIR);
        std::fs::create_dir_all(&lib).unwrap();
        std::fs::write(lib.join("a.png"), b"x").unwrap();
        assert!(in_library(&dir, &lib.join("a.png")));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn bibliotheque_et_compte_rendu() {
        let dir = std::env::temp_dir().join(format!("fmi-photos-lib-{}", now_secs()));
        let lib = dir.join(LIBRARY_SUBDIR);
        std::fs::create_dir_all(&lib).unwrap();
        let img = lib.join("banc-1-s1.png");
        std::fs::write(&img, b"png").unwrap();
        let o = Outcome {
            scene: "banc".into(),
            tag: Some("ev1".into()),
            file: img.to_string_lossy().into_owned(),
            created_at: "2026-11-09T20:00:00Z".into(),
            seed: 1,
            accepted: Some(true),
            score: Some(0.9),
            reasons: vec![],
            logos_before: Some(1),
            logos_after: Some(0),
            cleaned: true,
            regenerate: false,
            candidates: vec![],
            warnings: vec![],
            seconds: 60.0,
        };
        std::fs::write(img.with_extension("json"), serde_json::to_vec(&o).unwrap()).unwrap();
        // un compte rendu dont l'image a disparu n'est pas listé
        std::fs::write(lib.join("orphelin.json"), serde_json::to_vec(&Outcome { file: lib.join("nope.png").to_string_lossy().into_owned(), ..o.clone() }).unwrap()).unwrap();
        let l = library(&dir);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0], o);
        assert_eq!(library_find(&dir, "ev1").as_ref(), Some(&o));
        assert!(library_find(&dir, "autre").is_none());
        assert!(scene_infos().iter().any(|s| s.key == "duo_presse" && s.faces == 2));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn date_iso() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(20_766), (2026, 11, 9));
        assert!(iso_now().ends_with('Z') && iso_now().len() == 20);
    }
}
