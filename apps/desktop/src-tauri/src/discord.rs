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
}
