// FM Immersion CoachPhoto 0.1 : la photo du coach choisie dans FM Immersion remplace le portrait 3D du manager humain.
//
// Comment FM27 affiche le manager humain : il n'existe aucun fichier image. ManagerCloseupShotGenerator (FM.UI) rend
// l'avatar 3D du créateur de personnage dans une Texture2D (gros plan), puis la garde dans son cache
//   m_closeupCache : Dictionary<int, Texture2D>, clé = identifiant unique du manager.
// Les écrans demandent ce gros plan (SetManagerCloseupImage -> GetCloseupTexture) et reçoivent la texture du cache.
//
// Ce que fait le plugin, sans patch Harmony : toutes les 0,5 s, il remplace dans ce cache chaque gros plan par une
// texture faite de la photo (photo-coach.png, que FM Immersion écrit dans le dossier des instantanés). Rien n'est écrit
// dans la sauvegarde ni dans les fichiers du jeu. Un écran déjà ouvert garde l'avatar jusqu'à ce qu'on le rouvre.
// Si le jeu régénère le gros plan (apparence modifiée) ou détruit notre texture, elle est remise au tour suivant.
// Garde-fous : try/catch partout, arrêt complet (et cache rendu) après 20 erreurs, Active=false = observation seule.
using System;
using System.Collections.Generic;
using System.IO;
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;
using FM.UI;
using UnityEngine;

namespace FMImmersion
{
    [BepInPlugin("fr.fmimmersion.coachphoto", "FM Immersion CoachPhoto", Version)]
    public class CoachPhotoPlugin : BasePlugin
    {
        public const string Version = "0.1.0";
        internal static ManualLogSource L;
        internal static ConfigEntry<bool> Active;
        internal static ConfigEntry<string> PhotoPath;
        internal static ConfigEntry<int> ManagerId;

        public override void Load()
        {
            L = Log;
            Active = Config.Bind("General", "Active", true,
                "true : la photo remplace le portrait 3D du manager humain. false : observation seule (journalise sans rien changer).");
            PhotoPath = Config.Bind("General", "Photo", DefaultPhotoPath(),
                "Photo du coach (PNG ou JPEG). FM Immersion l'écrit dans le dossier des instantanés d'Archivix Bridge.");
            ManagerId = Config.Bind("General", "Manager", 0,
                "Identifiant unique du manager à remplacer. 0 = tous les managers humains (une partie solo n'en a qu'un).");
            AddComponent<CoachPhotoTicker>();
            L.LogInfo($"CoachPhoto {Version} chargé. Active={Active.Value} Photo={PhotoPath.Value} Manager={ManagerId.Value}");
        }

        // Même dossier que les instantanés d'Archivix Bridge (réglage « Dossier » de fr.archivix.bridge.cfg), sinon le
        // dossier par défaut de ce plugin, dans les données FM27 de Documents.
        static string DefaultPhotoPath()
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Sports Interactive", "Football Manager 27", "archivix");
            try
            {
                string cfg = Path.Combine(Paths.ConfigPath, "fr.archivix.bridge.cfg");
                if (File.Exists(cfg))
                    foreach (var line in File.ReadAllLines(cfg))
                    {
                        var t = line.Trim();
                        if (!t.StartsWith("Dossier")) continue;
                        int eq = t.IndexOf('=');
                        if (eq > 0 && t.Substring(0, eq).Trim() == "Dossier" && t.Substring(eq + 1).Trim().Length > 0) dir = t.Substring(eq + 1).Trim();
                    }
            }
            catch { /* dossier par défaut */ }
            return Path.Combine(dir, "photo-coach.png");
        }
    }

    public class CoachPhotoTicker : MonoBehaviour
    {
        public CoachPhotoTicker(IntPtr ptr) : base(ptr) { }
        void Update() => Engine.Tick();
    }

    internal static class Engine
    {
        const int MaxErrors = 20;
        const int MaxLogged = 200;
        static float _nextTick, _nextFileCheck;
        static int _errors, _logged, _replaced;
        static bool _stopped, _instanceSeen;
        static string _lastDiag;

        static Texture2D _photo;            // notre texture (une seule, partagée par tous les écrans)
        static DateTime _photoStamp;        // date du fichier chargé
        static bool _photoMissingLogged;
        // Gros plans d'origine que nous avons sortis du cache, pour les rendre si le plugin s'arrête.
        static readonly Dictionary<int, Texture2D> _originals = new Dictionary<int, Texture2D>();

        static void Info(string s) => CoachPhotoPlugin.L.LogInfo(s);
        static void Log(string s)
        {
            if (_logged >= MaxLogged) return;
            _logged++;
            Info($"CoachPhoto [{_logged}] {s}");
        }
        static void Diag(string s) { if (s != _lastDiag) { _lastDiag = s; Info("CoachPhoto diag: " + s); } }
        static void Error(string where, Exception e)
        {
            _errors++;
            CoachPhotoPlugin.L.LogWarning($"CoachPhoto {where}: {e.GetType().Name}: {e.Message}");
            if (_errors >= MaxErrors && !_stopped)
            {
                _stopped = true;
                CoachPhotoPlugin.L.LogWarning("CoachPhoto : 20 erreurs, arrêt complet. Les portraits d'origine sont remis.");
                RestoreAll();
            }
        }

        internal static void Tick()
        {
            if (_stopped || Time.unscaledTime < _nextTick) return;
            _nextTick = Time.unscaledTime + 0.5f;
            try
            {
                if (Time.unscaledTime >= _nextFileCheck) { _nextFileCheck = Time.unscaledTime + 2f; RefreshPhoto(); }
                Apply();
            }
            catch (Exception e) { Error("tick", e); }
        }

        // Recharge la photo quand le fichier change (FM Immersion la réécrit quand le joueur en choisit une autre).
        static void RefreshPhoto()
        {
            string path = CoachPhotoPlugin.PhotoPath.Value;
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            {
                if (!_photoMissingLogged) { _photoMissingLogged = true; Info($"CoachPhoto : pas de photo ({path}). Choisis-la dans FM Immersion."); }
                if (_photo != null) { RestoreAll(); DestroyPhoto(); _photoStamp = default; }
                return;
            }
            _photoMissingLogged = false;
            var stamp = File.GetLastWriteTimeUtc(path);
            if (_photo != null && stamp == _photoStamp && _photo != null) return;

            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            if (!ImageConversion.LoadImage(tex, File.ReadAllBytes(path), false))
            {
                UnityEngine.Object.Destroy(tex);
                Log("photo illisible : " + path);
                _photoStamp = stamp; // ne pas réessayer en boucle tant que le fichier ne change pas
                return;
            }
            tex.name = "fmi-coach-photo";
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.hideFlags = HideFlags.DontUnloadUnusedAsset;
            tex.Apply(false, true);
            var old = _photo;
            _photo = tex;
            _photoStamp = stamp;
            Log($"photo chargée : {path} ({tex.width}x{tex.height})");
            if (old != null) { Apply(); UnityEngine.Object.Destroy(old); }
        }

        static void DestroyPhoto()
        {
            if (_photo != null) UnityEngine.Object.Destroy(_photo);
            _photo = null;
        }

        static void Apply()
        {
            var gen = ManagerCloseupShotGenerator.Instance;
            if (gen == null) { Diag("générateur de gros plans pas encore créé"); return; }
            if (!_instanceSeen)
            {
                _instanceSeen = true;
                int size = -1;
                try { size = FM.UI.ManagerAppearance.ManagerCloseupShot.ManagerCloseupTextureSize; } catch { }
                Info($"CoachPhoto : générateur de gros plans trouvé (taille {size}).");
            }
            var cache = gen.m_closeupCache;
            if (cache == null) { Diag("cache des gros plans absent"); return; }

            var keys = new List<int>();
            foreach (var kv in cache) keys.Add(kv.Key);
            Diag($"gros plans en cache : {keys.Count} [{string.Join(", ", keys)}] remplacements={_replaced}");
            if (_photo == null || !CoachPhotoPlugin.Active.Value) return;

            int only = CoachPhotoPlugin.ManagerId.Value;
            foreach (int id in keys)
            {
                if (only != 0 && id != only) continue;
                Texture2D cur = cache[id];
                if (cur != null && cur.Pointer == _photo.Pointer) continue;
                try
                {
                    // Gros plan d'origine gardé (le premier vu, ou le nouveau si le jeu l'a régénéré).
                    if (cur != null) _originals[id] = cur;
                    cache[id] = _photo;
                    _replaced++;
                    Log($"manager {id} : photo à la place du gros plan {(cur == null ? "(détruit)" : cur.width + "x" + cur.height)}");
                }
                catch (Exception e) { Error("remplacement " + id, e); }
            }
        }

        static void RestoreAll()
        {
            try
            {
                var gen = ManagerCloseupShotGenerator.Instance;
                var cache = gen?.m_closeupCache;
                if (cache == null) return;
                foreach (var kv in _originals)
                {
                    if (kv.Value == null || !cache.ContainsKey(kv.Key)) continue;
                    var cur = cache[kv.Key];
                    if (cur != null && _photo != null && cur.Pointer == _photo.Pointer) cache[kv.Key] = kv.Value;
                }
                _originals.Clear();
            }
            catch (Exception e) { CoachPhotoPlugin.L.LogWarning("CoachPhoto restauration : " + e.Message); }
        }
    }
}
