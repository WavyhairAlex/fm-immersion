# NSIS pour la release Windows

Copie des deux fichiers que `tauri build` (tauri-bundler 2.12) télécharge pour faire l'installeur NSIS. Ils sont
rangés ici parce que leurs adresses de téléchargement (releases GitHub de tauri-apps, SourceForge) répondaient
502/503/504 depuis les machines de GitHub, et qu'aucune version ne pouvait plus sortir (novembre 2026).

| Fichier | Origine | SHA-1 (vérifiée par la CI) | Licence |
|---|---|---|---|
| `nsis-3.11.zip` | https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip (identique à l'archive officielle de NSIS sur SourceForge) | `EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D` | zlib/libpng et autres licences libres, voir `COPYING` dans l'archive |
| `nsis_tauri_utils.dll` | https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll | `75197FEE3C6A814FE035788D1C34EAD39349B860` | MIT ou Apache-2.0 (tauri-apps) |

Le workflow `release.yml` vérifie ces empreintes, puis installe les fichiers dans `%LOCALAPPDATA%\tauri\NSIS`, là
où tauri-bundler les cherche avant de les télécharger. Si tauri change de version de NSIS, mettre à jour les deux
fichiers et les empreintes (elles sont dans `crates/tauri-bundler/src/bundle/windows/nsis/mod.rs`).
