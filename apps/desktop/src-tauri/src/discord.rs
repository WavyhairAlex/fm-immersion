//! Live Discord (mode solo) : envoi d'un message dans un salon par un lien webhook que le joueur colle lui-même.
//!
//! Rien ne part sans action ni réglage du joueur, et seulement vers l'adresse des webhooks de Discord.
//! Le contenu (gazette, résultat) est préparé par l'interface ; Rust se contente de l'envoyer.

use serde::Serializer;

#[derive(Debug, thiserror::Error)]
pub enum DiscordError {
    #[error("lien webhook invalide : il doit commencer par https://discord.com/api/webhooks/")]
    BadUrl,
    #[error("message trop long pour Discord")]
    TooLong,
    #[error("Discord a refusé le message : {0}")]
    Refused(String),
    #[error("réseau : {0}")]
    Network(String),
}

impl serde::Serialize for DiscordError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// Seules les adresses de webhook Discord sont acceptées (pas d'envoi vers un autre site).
pub fn valid_webhook(url: &str) -> bool {
    let rest = url
        .strip_prefix("https://discord.com/api/webhooks/")
        .or_else(|| url.strip_prefix("https://discordapp.com/api/webhooks/"))
        .or_else(|| url.strip_prefix("https://ptb.discord.com/api/webhooks/"))
        .or_else(|| url.strip_prefix("https://canary.discord.com/api/webhooks/"));
    match rest {
        Some(r) => {
            let mut parts = r.split('/');
            let id = parts.next().unwrap_or("");
            let token = parts.next().unwrap_or("");
            !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) && !token.is_empty()
                && token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                && parts.next().is_none()
        }
        None => false,
    }
}

/// Envoie un message (JSON du webhook Discord : `content`, `embeds`…).
#[tauri::command]
pub fn discord_send(webhook: String, payload: serde_json::Value) -> Result<(), DiscordError> {
    let webhook = webhook.trim();
    if !valid_webhook(webhook) {
        return Err(DiscordError::BadUrl);
    }
    let body = payload.to_string();
    if body.len() > 20_000 {
        return Err(DiscordError::TooLong);
    }
    match ureq::post(webhook)
        .set("Content-Type", "application/json")
        .set("User-Agent", "FM-Immersion")
        .send_string(&body)
    {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, resp)) => {
            let detail = resp.into_string().unwrap_or_default();
            Err(DiscordError::Refused(format!("{code} {}", detail.chars().take(200).collect::<String>())))
        }
        Err(e) => Err(DiscordError::Network(e.to_string())),
    }
}

fn refused(code: u16, resp: ureq::Response) -> DiscordError {
    let detail = resp.into_string().unwrap_or_default();
    DiscordError::Refused(format!("{code} {}", detail.chars().take(200).collect::<String>()))
}

fn checked(webhook: &str, payload: &serde_json::Value) -> Result<String, DiscordError> {
    if !valid_webhook(webhook) {
        return Err(DiscordError::BadUrl);
    }
    let body = payload.to_string();
    if body.len() > 20_000 {
        return Err(DiscordError::TooLong);
    }
    Ok(body)
}

/// Identifiant du message renvoyé par Discord (`?wait=true`) : des chiffres seulement.
pub fn message_id(answer: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(answer).ok()?;
    let id = v.get("id")?.as_str()?;
    (!id.is_empty() && id.len() <= 25 && id.chars().all(|c| c.is_ascii_digit())).then(|| id.to_string())
}

/// Envoie un message et renvoie son identifiant, pour le modifier ensuite (tableau de score du match en direct).
#[tauri::command]
pub fn discord_post(webhook: String, payload: serde_json::Value) -> Result<String, DiscordError> {
    let webhook = webhook.trim();
    let body = checked(webhook, &payload)?;
    match ureq::post(&format!("{webhook}?wait=true"))
        .set("Content-Type", "application/json")
        .set("User-Agent", "FM-Immersion")
        .send_string(&body)
    {
        Ok(resp) => message_id(&resp.into_string().unwrap_or_default()).ok_or_else(|| DiscordError::Refused("réponse sans identifiant".into())),
        Err(ureq::Error::Status(code, resp)) => Err(refused(code, resp)),
        Err(e) => Err(DiscordError::Network(e.to_string())),
    }
}

/// Modifie un message envoyé par ce même webhook (seulement les siens : Discord refuse les autres).
#[tauri::command]
pub fn discord_edit(webhook: String, message_id: String, payload: serde_json::Value) -> Result<(), DiscordError> {
    let webhook = webhook.trim();
    let body = checked(webhook, &payload)?;
    if message_id.is_empty() || message_id.len() > 25 || !message_id.chars().all(|c| c.is_ascii_digit()) {
        return Err(DiscordError::BadUrl);
    }
    match ureq::request("PATCH", &format!("{webhook}/messages/{message_id}"))
        .set("Content-Type", "application/json")
        .set("User-Agent", "FM-Immersion")
        .send_string(&body)
    {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, resp)) => Err(refused(code, resp)),
        Err(e) => Err(DiscordError::Network(e.to_string())),
    }
}

/// Corps multipart d'un message avec une image jointe (`files[0]`, nommée `name`) : Discord l'affiche dans
/// l'encart quand le JSON y fait référence par `attachment://<name>`.
pub fn multipart(boundary: &str, payload: &str, name: &str, png: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(payload.len() + png.len() + 400);
    body.extend_from_slice(
        format!("--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n{payload}\r\n").as_bytes(),
    );
    body.extend_from_slice(
        format!("--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(png);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

/// Une image PNG commence toujours par ces 8 octets.
const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

/// Envoie un message avec une image PNG dessinée par l'appli (la une de la gazette), au plus 8 Mo.
#[tauri::command]
pub fn discord_send_image(webhook: String, payload: serde_json::Value, png: Vec<u8>) -> Result<(), DiscordError> {
    let webhook = webhook.trim();
    if !valid_webhook(webhook) {
        return Err(DiscordError::BadUrl);
    }
    let body = payload.to_string();
    if body.len() > 20_000 || png.len() > 8 * 1024 * 1024 || !png.starts_with(&PNG_MAGIC) {
        return Err(DiscordError::TooLong);
    }
    let boundary = format!("fmimmersion{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    let data = multipart(&boundary, &body, "une.png", &png);
    match ureq::post(webhook)
        .set("Content-Type", &format!("multipart/form-data; boundary={boundary}"))
        .set("User-Agent", "FM-Immersion")
        .send_bytes(&data)
    {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, resp)) => {
            let detail = resp.into_string().unwrap_or_default();
            Err(DiscordError::Refused(format!("{code} {}", detail.chars().take(200).collect::<String>())))
        }
        Err(e) => Err(DiscordError::Network(e.to_string())),
    }
}

/// Tableau de score du direct avec son image (`direct.png`) : envoi (`message_id` absent, renvoie l'identifiant) ou
/// modification du même message (image remplacée : le JSON doit lister `attachments: [{id: 0, filename: "direct.png"}]`).
#[tauri::command]
pub fn discord_live_image(webhook: String, message_id: Option<String>, payload: serde_json::Value, png: Vec<u8>) -> Result<String, DiscordError> {
    let webhook = webhook.trim();
    let body = checked(webhook, &payload)?;
    if png.len() > 8 * 1024 * 1024 || !png.starts_with(&PNG_MAGIC) {
        return Err(DiscordError::TooLong);
    }
    if let Some(id) = &message_id {
        if id.is_empty() || id.len() > 25 || !id.chars().all(|c| c.is_ascii_digit()) {
            return Err(DiscordError::BadUrl);
        }
    }
    let boundary = format!("fmimmersion{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    let data = multipart(&boundary, &body, "direct.png", &png);
    let req = match &message_id {
        Some(id) => ureq::request("PATCH", &format!("{webhook}/messages/{id}")),
        None => ureq::post(&format!("{webhook}?wait=true")),
    };
    match req
        .set("Content-Type", &format!("multipart/form-data; boundary={boundary}"))
        .set("User-Agent", "FM-Immersion")
        .send_bytes(&data)
    {
        Ok(resp) => message_id
            .or_else(|| self::message_id(&resp.into_string().unwrap_or_default()))
            .ok_or_else(|| DiscordError::Refused("réponse sans identifiant".into())),
        Err(ureq::Error::Status(code, resp)) => Err(refused(code, resp)),
        Err(e) => Err(DiscordError::Network(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepte_seulement_les_webhooks_discord() {
        assert!(valid_webhook("https://discord.com/api/webhooks/123456789/abc_DEF-123"));
        assert!(valid_webhook("https://discordapp.com/api/webhooks/1/x"));
        assert!(!valid_webhook("http://discord.com/api/webhooks/1/x"));
        assert!(!valid_webhook("https://discord.com.evil.io/api/webhooks/1/x"));
        assert!(!valid_webhook("https://discord.com/api/webhooks/abc/x"));
        assert!(!valid_webhook("https://discord.com/api/webhooks/1/x/../../y"));
        assert!(!valid_webhook("https://example.com/api/webhooks/1/x"));
    }

    #[test]
    fn refuse_un_lien_invalide_sans_reseau() {
        let err = discord_send("https://example.com/hook".into(), serde_json::json!({ "content": "x" })).unwrap_err();
        assert!(matches!(err, DiscordError::BadUrl));
    }

    #[test]
    fn identifiant_du_message_et_modification() {
        assert_eq!(message_id(r#"{"id":"1305012345678901234","type":0}"#).as_deref(), Some("1305012345678901234"));
        assert_eq!(message_id(r#"{"id":"../x"}"#), None);
        assert_eq!(message_id("pas du json"), None);
        assert!(matches!(
            discord_edit("https://discord.com/api/webhooks/1/x".into(), "12/../3".into(), serde_json::json!({})),
            Err(DiscordError::BadUrl)
        ));
        assert!(matches!(discord_post("https://evil.io/x".into(), serde_json::json!({})), Err(DiscordError::BadUrl)));
        let png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        assert!(matches!(
            discord_live_image("https://discord.com/api/webhooks/1/x".into(), Some("1/../2".into()), serde_json::json!({}), png),
            Err(DiscordError::BadUrl)
        ));
    }

    #[test]
    fn corps_multipart_avec_image() {
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2];
        let body = multipart("b", r#"{"a":1}"#, "une.png", &png);
        let text = String::from_utf8_lossy(&body);
        assert!(text.starts_with("--b\r\nContent-Disposition: form-data; name=\"payload_json\""));
        assert!(text.contains("{\"a\":1}\r\n--b\r\n"));
        assert!(text.contains("name=\"files[0]\"; filename=\"une.png\"\r\nContent-Type: image/png\r\n\r\n"));
        assert!(body.ends_with(b"\x01\x02\r\n--b--\r\n"));
        assert!(matches!(
            discord_send_image("https://discord.com/api/webhooks/1/x".into(), serde_json::json!({}), vec![1, 2, 3]),
            Err(DiscordError::TooLong)
        ));
        assert!(matches!(discord_send_image("https://evil.io".into(), serde_json::json!({}), png.to_vec()), Err(DiscordError::BadUrl)));
    }
}
