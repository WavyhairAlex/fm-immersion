//! Rédaction par IA (gazette de la semaine, commentaires du direct), activée par le joueur.
//!
//! Deux façons, au choix du joueur dans l'écran Live Discord :
//! - **Ollama**, une IA installée sur son PC : la demande ne quitte pas l'ordinateur (`http://127.0.0.1:11434`).
//! - **Une clé API** qu'il colle lui-même (Mistral, Anthropic ou Google) : la demande part chez ce fournisseur,
//!   seulement vers son adresse fixe. La clé est rangée dans le coffre de Windows (Gestionnaire d'identification),
//!   jamais dans la base ni dans l'interface, qui ne peut pas la relire.
//!
//! L'interface prépare la demande (les faits déjà calculés de la semaine ou du match, sans fichier du jeu) et vérifie
//! la réponse ; Rust se contente de l'envoyer et de rendre le texte.

use serde::Serializer;
use std::time::Duration;

#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("fournisseur d'IA inconnu")]
    Provider,
    #[error("nom de modèle invalide")]
    Model,
    #[error("aucune clé API enregistrée pour ce fournisseur")]
    NoKey,
    #[error("coffre de Windows : {0}")]
    Vault(String),
    #[error("Ollama ne répond pas sur ce PC : est-il installé et lancé ?")]
    OllamaDown,
    #[error("l'IA a refusé la demande : {0}")]
    Refused(String),
    #[error("réseau : {0}")]
    Network(String),
    #[error("réponse de l'IA illisible")]
    BadAnswer,
    #[error("demande trop longue")]
    TooLong,
}

impl serde::Serialize for AiError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Provider {
    Ollama,
    Mistral,
    Anthropic,
    Gemini,
}

impl Provider {
    pub fn parse(s: &str) -> Result<Self, AiError> {
        match s {
            "ollama" => Ok(Self::Ollama),
            "mistral" => Ok(Self::Mistral),
            "anthropic" => Ok(Self::Anthropic),
            "gemini" => Ok(Self::Gemini),
            _ => Err(AiError::Provider),
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::Ollama => "ollama",
            Self::Mistral => "mistral",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
        }
    }
}

/// Ollama écoute seulement sur ce PC.
pub const OLLAMA: &str = "http://127.0.0.1:11434";

/// Nom de modèle : lettres, chiffres et `-._:/` (« gemma3:12b », « mistral-small-latest »). Il entre dans l'adresse
/// de Google : rien d'autre n'est accepté.
pub fn valid_model(m: &str) -> bool {
    !m.is_empty() && m.len() <= 100 && m.chars().all(|c| c.is_ascii_alphanumeric() || "-._:/".contains(c)) && !m.contains("..")
}

/// Une demande prête à partir : adresse, en-têtes, corps JSON.
pub struct Request {
    pub url: String,
    pub headers: Vec<(&'static str, String)>,
    pub body: serde_json::Value,
}

/// Prépare la demande pour un fournisseur. `json` = réponse attendue en JSON (gazette), quand le fournisseur sait
/// l'imposer ; sinon la consigne le demande.
pub fn build_request(p: Provider, model: &str, system: &str, prompt: &str, json: bool, key: Option<&str>) -> Request {
    use serde_json::json;
    let key = key.unwrap_or("").to_string();
    match p {
        Provider::Ollama => {
            let mut body = json!({
                "model": model,
                "stream": false,
                "messages": [{ "role": "system", "content": system }, { "role": "user", "content": prompt }],
                "options": { "temperature": 0.8 }
            });
            if json {
                body["format"] = json!("json");
            }
            Request { url: format!("{OLLAMA}/api/chat"), headers: vec![], body }
        }
        Provider::Mistral => {
            let mut body = json!({
                "model": model,
                "temperature": 0.8,
                "messages": [{ "role": "system", "content": system }, { "role": "user", "content": prompt }]
            });
            if json {
                body["response_format"] = json!({ "type": "json_object" });
            }
            Request { url: "https://api.mistral.ai/v1/chat/completions".into(), headers: vec![("Authorization", format!("Bearer {key}"))], body }
        }
        Provider::Anthropic => Request {
            url: "https://api.anthropic.com/v1/messages".into(),
            headers: vec![("x-api-key", key), ("anthropic-version", "2023-06-01".into())],
            body: json!({
                "model": model,
                "max_tokens": 1500,
                "temperature": 0.8,
                "system": system,
                "messages": [{ "role": "user", "content": prompt }]
            }),
        },
        Provider::Gemini => {
            let mut body = json!({
                "systemInstruction": { "parts": [{ "text": system }] },
                "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
                "generationConfig": { "temperature": 0.8 }
            });
            if json {
                body["generationConfig"]["responseMimeType"] = json!("application/json");
            }
            Request {
                url: format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"),
                headers: vec![("x-goog-api-key", key)],
                body,
            }
        }
    }
}

/// Texte de la réponse, selon le format de chaque fournisseur.
pub fn parse_answer(p: Provider, answer: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(answer).ok()?;
    let text = match p {
        Provider::Ollama => v.pointer("/message/content")?.as_str()?.to_string(),
        Provider::Mistral => v.pointer("/choices/0/message/content")?.as_str()?.to_string(),
        Provider::Anthropic => v
            .get("content")?
            .as_array()?
            .iter()
            .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
            .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join(""),
        Provider::Gemini => v
            .pointer("/candidates/0/content/parts")?
            .as_array()?
            .iter()
            .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join(""),
    };
    let text = text.trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// Noms des modèles installés dans Ollama (réponse de `/api/tags`).
pub fn parse_models(answer: &str) -> Vec<String> {
    let v: serde_json::Value = serde_json::from_str(answer).unwrap_or_default();
    let mut names: Vec<String> = v
        .get("models")
        .and_then(|m| m.as_array())
        .map(|a| a.iter().filter_map(|m| m.get("name").and_then(|n| n.as_str())).map(String::from).collect())
        .unwrap_or_default();
    names.sort();
    names
}

const VAULT: &str = "FM Immersion";

fn entry(p: Provider) -> Result<keyring::Entry, AiError> {
    keyring::Entry::new(VAULT, &format!("ia-{}", p.id())).map_err(|e| AiError::Vault(e.to_string()))
}

fn read_key(p: Provider) -> Result<String, AiError> {
    match entry(p)?.get_password() {
        Ok(k) if !k.trim().is_empty() => Ok(k),
        Ok(_) | Err(keyring::Error::NoEntry) => Err(AiError::NoKey),
        Err(e) => Err(AiError::Vault(e.to_string())),
    }
}

/// Range la clé API du joueur dans le coffre de Windows (vide = l'effacer).
#[tauri::command]
pub fn ai_key_set(provider: String, key: String) -> Result<(), AiError> {
    let p = Provider::parse(&provider)?;
    if p == Provider::Ollama {
        return Err(AiError::Provider);
    }
    let key = key.trim();
    let e = entry(p)?;
    if key.is_empty() {
        return match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(AiError::Vault(err.to_string())),
        };
    }
    if key.len() > 400 || key.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(AiError::Vault("clé invalide".into()));
    }
    e.set_password(key).map_err(|err| AiError::Vault(err.to_string()))
}

/// Une clé est-elle enregistrée pour ce fournisseur ? (la clé elle-même n'est jamais renvoyée)
#[tauri::command]
pub fn ai_key_status(provider: String) -> Result<bool, AiError> {
    let p = Provider::parse(&provider)?;
    match read_key(p) {
        Ok(_) => Ok(true),
        Err(AiError::NoKey) => Ok(false),
        Err(e) => Err(e),
    }
}

fn agent(secs: u64) -> ureq::Agent {
    ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(5)).timeout(Duration::from_secs(secs)).build()
}

fn complete(provider: String, model: String, system: String, prompt: String, json: bool) -> Result<String, AiError> {
    let p = Provider::parse(&provider)?;
    let model = model.trim().to_string();
    if !valid_model(&model) {
        return Err(AiError::Model);
    }
    if system.len() + prompt.len() > 40_000 {
        return Err(AiError::TooLong);
    }
    let key = if p == Provider::Ollama { None } else { Some(read_key(p)?) };
    let req = build_request(p, &model, &system, &prompt, json, key.as_deref());
    // Ollama charge le modèle en mémoire à la première demande : plus de patience.
    let mut call = agent(if p == Provider::Ollama { 180 } else { 60 })
        .post(&req.url)
        .set("Content-Type", "application/json")
        .set("User-Agent", "FM-Immersion");
    for (k, v) in &req.headers {
        call = call.set(k, v);
    }
    match call.send_string(&req.body.to_string()) {
        Ok(resp) => parse_answer(p, &resp.into_string().map_err(|e| AiError::Network(e.to_string()))?).ok_or(AiError::BadAnswer),
        Err(ureq::Error::Status(code, resp)) => {
            let detail = resp.into_string().unwrap_or_default();
            Err(AiError::Refused(format!("{code} {}", detail.chars().take(300).collect::<String>())))
        }
        Err(_) if p == Provider::Ollama => Err(AiError::OllamaDown),
        Err(e) => Err(AiError::Network(e.to_string())),
    }
}

/// Demande un texte à l'IA choisie par le joueur. Hors du fil de la fenêtre : l'appli reste fluide pendant l'attente.
#[tauri::command]
pub async fn ai_complete(provider: String, model: String, system: String, prompt: String, json: bool) -> Result<String, AiError> {
    tauri::async_runtime::spawn_blocking(move || complete(provider, model, system, prompt, json))
        .await
        .map_err(|e| AiError::Network(e.to_string()))?
}

/// Modèles installés dans Ollama sur ce PC (vide si Ollama n'est pas lancé).
#[tauri::command]
pub async fn ai_ollama_models() -> Result<Vec<String>, AiError> {
    tauri::async_runtime::spawn_blocking(|| match agent(5).get(&format!("{OLLAMA}/api/tags")).call() {
        Ok(resp) => Ok(parse_models(&resp.into_string().unwrap_or_default())),
        Err(_) => Err(AiError::OllamaDown),
    })
    .await
    .map_err(|e| AiError::Network(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fournisseurs_connus_seulement() {
        assert_eq!(Provider::parse("ollama").unwrap(), Provider::Ollama);
        assert_eq!(Provider::parse("gemini").unwrap(), Provider::Gemini);
        assert!(Provider::parse("openai").is_err());
        assert!(Provider::parse("").is_err());
    }

    #[test]
    fn noms_de_modele() {
        assert!(valid_model("gemma3:12b"));
        assert!(valid_model("mistral-small-latest"));
        assert!(valid_model("library/qwen2.5:14b"));
        assert!(!valid_model(""));
        assert!(!valid_model("x?key=1"));
        assert!(!valid_model("../../v1"));
        assert!(!valid_model("a b"));
    }

    #[test]
    fn ollama_reste_sur_le_pc() {
        let r = build_request(Provider::Ollama, "gemma3:12b", "sys", "faits", true, None);
        assert_eq!(r.url, "http://127.0.0.1:11434/api/chat");
        assert!(r.headers.is_empty());
        assert_eq!(r.body["format"], "json");
        assert_eq!(r.body["stream"], false);
        assert_eq!(r.body["messages"][0]["role"], "system");
        let r = build_request(Provider::Ollama, "gemma3:12b", "sys", "faits", false, None);
        assert!(r.body.get("format").is_none());
    }

    #[test]
    fn la_cle_va_dans_les_en_tetes_jamais_dans_l_adresse() {
        let m = build_request(Provider::Mistral, "mistral-small-latest", "s", "p", true, Some("CLE"));
        assert_eq!(m.url, "https://api.mistral.ai/v1/chat/completions");
        assert_eq!(m.headers, vec![("Authorization", "Bearer CLE".to_string())]);
        assert_eq!(m.body["response_format"]["type"], "json_object");
        let a = build_request(Provider::Anthropic, "claude-haiku-5-5", "s", "p", true, Some("CLE"));
        assert_eq!(a.url, "https://api.anthropic.com/v1/messages");
        assert!(a.headers.contains(&("x-api-key", "CLE".to_string())));
        assert_eq!(a.body["system"], "s");
        let g = build_request(Provider::Gemini, "gemini-2.5-flash", "s", "p", true, Some("CLE"));
        assert_eq!(g.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
        assert!(!g.url.contains("CLE"));
        assert_eq!(g.headers, vec![("x-goog-api-key", "CLE".to_string())]);
        assert_eq!(g.body["generationConfig"]["responseMimeType"], "application/json");
    }

    #[test]
    fn lit_la_reponse_de_chaque_fournisseur() {
        assert_eq!(parse_answer(Provider::Ollama, r#"{"message":{"role":"assistant","content":" Texte "}}"#).as_deref(), Some("Texte"));
        assert_eq!(parse_answer(Provider::Mistral, r#"{"choices":[{"message":{"content":"Texte"}}]}"#).as_deref(), Some("Texte"));
        assert_eq!(parse_answer(Provider::Anthropic, r#"{"content":[{"type":"text","text":"Te"},{"type":"text","text":"xte"}]}"#).as_deref(), Some("Texte"));
        assert_eq!(parse_answer(Provider::Gemini, r#"{"candidates":[{"content":{"parts":[{"text":"Texte"}]}}]}"#).as_deref(), Some("Texte"));
        assert_eq!(parse_answer(Provider::Mistral, r#"{"choices":[]}"#), None);
        assert_eq!(parse_answer(Provider::Ollama, r#"{"message":{"content":"  "}}"#), None);
        assert_eq!(parse_answer(Provider::Ollama, "pas du json"), None);
    }

    #[test]
    fn liste_des_modeles_ollama() {
        assert_eq!(parse_models(r#"{"models":[{"name":"qwen2.5:14b"},{"name":"gemma3:12b"}]}"#), vec!["gemma3:12b", "qwen2.5:14b"]);
        assert!(parse_models("").is_empty());
    }
}
