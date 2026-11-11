// FM Immersion Fiche : un bouton « FM Immersion » à côté du bouton « Actions » de la fiche d'un joueur dans FM27.
// Un clic écrit fmimmersion-demande.json (nom du joueur affiché) dans le dossier du plugin Archivix ; FM Immersion
// passe au premier plan et ouvre la fiche de ce joueur.
// Lecture seule : le plugin lit l'écran affiché (bandeau « report-player-banner-max », repéré par la sonde du
// 11/11/2026) et ajoute son bouton dans l'interface ; aucune action de jeu, rien d'écrit dans le jeu ni la sauvegarde.
// try/catch partout, arrêt après 20 erreurs.
using System;
using System.IO;
using System.Text.RegularExpressions;
using BepInEx;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;
using UnityEngine;
using UnityEngine.UIElements;

namespace FMImmersion
{
    [BepInPlugin("fr.fmimmersion.fiche", "FM Immersion Fiche", "0.1.0")]
    public class FichePlugin : BasePlugin
    {
        internal static ManualLogSource L;
        internal static string DossierConfig;
        public override void Load()
        {
            L = Log;
            DossierConfig = Paths.ConfigPath;
            AddComponent<BoutonFiche>();
            L.LogInfo("FM Immersion Fiche 0.1.0 chargé : bouton « FM Immersion » sur la fiche des joueurs.");
        }
    }

    public class BoutonFiche : MonoBehaviour
    {
        public BoutonFiche(IntPtr ptr) : base(ptr) { }

        const string NomBouton = "fmimmersion-fiche-bouton";
        static readonly Color Ambre = new Color(1f, 0.71f, 0.28f);
        static readonly Color AmbreClair = new Color(1f, 0.92f, 0.78f);
        static readonly Color Nuit = new Color(0.06f, 0.11f, 0.18f);

        bool _arret, _premiereErreur = true;
        int _erreurs;
        float _prochain;
        VisualElement _racine, _bandeau;
        Button _bouton;
        string _dossier;
        string _retour;
        float _retourJusqua;

        void Update()
        {
            if (_arret || Time.unscaledTime < _prochain) return;
            _prochain = Time.unscaledTime + 1.5f;
            try
            {
                if (_retour != null && Time.unscaledTime > _retourJusqua && _bouton != null) { _bouton.text = "FM Immersion"; _retour = null; }
                // Bandeau encore affiché : rien à faire tant que notre bouton y est.
                if (_bandeau != null && _bandeau.panel != null && _bouton != null && _bouton.parent != null && _bouton.panel != null) return;
                _bandeau = null;
                if (_racine == null || _racine.panel == null) _racine = RacineFM();
                if (_racine == null) return;
                _bandeau = Chercher(_racine, "report-player-banner-max", 0);
                if (_bandeau == null) return;
                var actions = Chercher(_bandeau, "FrameActions", 0);
                if (actions == null || actions.parent == null) return;
                var parent = actions.parent;
                // Déjà là (le jeu a gardé l'élément) : on le reprend.
                for (int i = 0; i < parent.hierarchy.childCount; i++)
                {
                    var b = parent.hierarchy[i];
                    if (b.name == NomBouton) { _bouton = b.TryCast<Button>(); return; }
                }
                _bouton = CreerBouton();
                parent.Insert(parent.IndexOf(actions) + 1, _bouton);
                FichePlugin.L.LogInfo("Bouton FM Immersion ajouté à la fiche joueur.");
            }
            catch (Exception e) { Erreur("recherche", e); }
        }

        VisualElement RacineFM()
        {
            var docs = UnityEngine.Object.FindObjectsOfType<UIDocument>();
            if (docs == null) return null;
            foreach (var d in docs)
                if (d != null && d.gameObject != null && d.gameObject.name == "MainUIDocument") return d.rootVisualElement;
            return null;
        }

        static VisualElement Chercher(VisualElement e, string nom, int prof)
        {
            if (e == null || prof > 80) return null;
            if (e.name == nom) return e;
            int n = e.hierarchy.childCount;
            for (int i = 0; i < n; i++)
            {
                var r = Chercher(e.hierarchy[i], nom, prof + 1);
                if (r != null) return r;
            }
            return null;
        }

        /** Nom du joueur affiché : premier texte du bandeau (« Dávid Húska »), balises retirées. */
        static string NomJoueur(VisualElement bandeau)
        {
            var t = PremierTexte(bandeau, 0);
            return t == null ? null : Regex.Replace(t, "<[^>]*>", "").Trim();
        }

        static string PremierTexte(VisualElement e, int prof)
        {
            if (e == null || prof > 40) return null;
            if (e.name == "text")
            {
                var te = e.TryCast<TextElement>();
                if (te != null && !string.IsNullOrWhiteSpace(te.text)) return te.text;
            }
            for (int i = 0; i < e.hierarchy.childCount; i++)
            {
                var r = PremierTexte(e.hierarchy[i], prof + 1);
                if (r != null) return r;
            }
            return null;
        }

        Button CreerBouton()
        {
            var b = new Button();
            b.name = NomBouton;
            b.text = "FM Immersion";
            b.tooltip = "Ouvrir ce joueur dans FM Immersion";
            b.style.fontSize = 15;
            b.style.color = Nuit;
            b.style.backgroundColor = Ambre;
            b.style.unityFontStyleAndWeight = FontStyle.Bold;
            b.style.marginLeft = 10;
            b.style.paddingLeft = 14; b.style.paddingRight = 14; b.style.paddingTop = 6; b.style.paddingBottom = 6;
            b.style.borderTopLeftRadius = 4; b.style.borderTopRightRadius = 4; b.style.borderBottomLeftRadius = 4; b.style.borderBottomRightRadius = 4;
            b.style.borderLeftWidth = 0; b.style.borderRightWidth = 0; b.style.borderTopWidth = 0; b.style.borderBottomWidth = 0;
            b.style.alignSelf = Align.Center;
            b.RegisterCallback<MouseEnterEvent>((EventCallback<MouseEnterEvent>)(_ => b.style.backgroundColor = AmbreClair));
            b.RegisterCallback<MouseLeaveEvent>((EventCallback<MouseLeaveEvent>)(_ => b.style.backgroundColor = Ambre));
            b.add_clicked((Il2CppSystem.Action)(() =>
            {
                try { Demander(); } catch (Exception e) { Erreur("clic", e); }
            }));
            return b;
        }

        void Demander()
        {
            var nom = _bandeau != null ? NomJoueur(_bandeau) : null;
            if (string.IsNullOrEmpty(nom)) { Retour("Joueur introuvable"); return; }
            var dossier = Dossier();
            Directory.CreateDirectory(dossier);
            var id = Guid.NewGuid().ToString("N");
            var json = "{\"schema\":\"fmimmersion-demande/1\",\"id\":\"" + id + "\",\"action\":\"ouvrir\",\"nom\":" + Q(nom) +
                       ",\"quand\":\"" + DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ") + "\"}";
            var f = Path.Combine(dossier, "fmimmersion-demande.json");
            File.WriteAllText(f + ".tmp", json);
            File.Copy(f + ".tmp", f, true);
            File.Delete(f + ".tmp");
            FichePlugin.L.LogInfo($"Demande envoyée à FM Immersion : ouvrir « {nom} ».");
            Retour("Envoyé ✓");
        }

        void Retour(string t)
        {
            if (_bouton != null) _bouton.text = t;
            _retour = t; _retourJusqua = Time.unscaledTime + 2.5f;
        }

        /** Dossier du plugin Archivix (clé Dossier de fr.archivix.bridge.cfg), sinon celui par défaut. */
        string Dossier()
        {
            if (_dossier != null) return _dossier;
            try
            {
                var cfg = Path.Combine(FichePlugin.DossierConfig, "fr.archivix.bridge.cfg");
                if (File.Exists(cfg))
                    foreach (var l in File.ReadAllLines(cfg))
                    {
                        var m = Regex.Match(l, @"^\s*Dossier\s*=\s*(.+?)\s*$");
                        if (m.Success && m.Groups[1].Value.Length > 0) return _dossier = m.Groups[1].Value;
                    }
            }
            catch (Exception e) { Erreur("config Archivix", e); }
            return _dossier = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Sports Interactive", "Football Manager 27", "archivix");
        }

        static string Q(string s)
        {
            var sb = new System.Text.StringBuilder("\"");
            foreach (var c in s)
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        void Erreur(string ou, Exception e)
        {
            _erreurs++;
            FichePlugin.L.LogWarning($"Erreur ({ou}) {_erreurs}/20 : {e.GetType().Name} {e.Message}");
            if (_premiereErreur) { _premiereErreur = false; FichePlugin.L.LogWarning(e.ToString()); }
            if (_erreurs >= 20) { _arret = true; FichePlugin.L.LogError("Trop d'erreurs : bouton FM Immersion arrêté."); }
        }
    }
}
