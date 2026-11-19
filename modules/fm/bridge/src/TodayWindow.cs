extern alias UnityCore;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using UnityCore::UnityEngine;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;
using FontAsset = UnityEngine.TextCore.Text.FontAsset;

namespace Archivix;

// Panneau « Aujourd'hui » de FM Immersion dans FM27 (0.6.5, preuve de concept). Même principe que la conférence de
// presse (PressWindow) : un panneau UI Toolkit à nous, posé PAR-DESSUS l'interface du jeu, qui n'envoie rien au jeu.
//
// - FM Immersion écrit dans <Dossier>\fmimmersion-aujourdhui.json (format fmi-aujourdhui/1) le briefing de l'adjoint
//   et la une de la dernière gazette, textes déjà rédigés dans la langue du joueur.
// - Le plugin relit ce fichier toutes les 5 s (thread à part). Le panneau ne s'ouvre jamais tout seul : F7 l'ouvre ou
//   le ferme, le bouton « Fermer » aussi.
public class TodayWindow : MonoBehaviour
{
    public TodayWindow(IntPtr p) : base(p) { }

    internal const string File_ = "fmimmersion-aujourdhui.json";

    // Opaque : à 0,97 les tuiles du jeu se voyaient à travers (essai en jeu du 19/11/2026).
    static readonly Color Night = new(0.06f, 0.11f, 0.18f, 1f);
    static readonly Color Amber = new(1f, 0.71f, 0.28f);
    static readonly Color AmberLight = new(1f, 0.92f, 0.78f);
    static readonly Color Ink = new(0.06f, 0.11f, 0.18f);
    static readonly Color Soft = new(0.8f, 0.84f, 0.9f);
    static readonly Color Line = new(1f, 0.71f, 0.28f, 0.35f);
    static readonly Color Bad = new(0.85f, 0.24f, 0.24f);
    static readonly Color Warn = new(0.96f, 0.72f, 0f);
    static readonly Color Good = new(0.3f, 0.75f, 0.55f);

    static volatile TodayData? _incoming;

    TodayData? _data;
    bool _open, _stopped, _fontOk;
    int _errors;
    float _retryAt;
    GameObject? _go;
    VisualElement? _layer;

    // ---------- lecture du fichier (thread à part, jamais sur le thread du jeu) ----------

    internal static void StartWatcher()
    {
        new Thread(() =>
        {
            string? lastText = null;
            while (true)
            {
                try
                {
                    var path = Path.Combine(Plugin.DataDir, File_);
                    var text = File.Exists(path) ? File.ReadAllText(path) : null;
                    if (text != lastText)
                    {
                        lastText = text;
                        _incoming = (text == null ? null : TodayData.Parse(text)) ?? TodayData.None;
                    }
                }
                catch (Exception e) { Plugin.Log.LogWarning($"Aujourd'hui : lecture de {File_} impossible ({e.Message})."); }
                Thread.Sleep(5_000);
            }
        }) { IsBackground = true, Name = "FMImmersionAujourdhui" }.Start();
    }

    // ---------- boucle Unity ----------

    void Update()
    {
        if (_stopped) return;
        try
        {
            var inc = _incoming;
            if (inc != null)
            {
                _incoming = null;
                _data = inc == TodayData.None ? null : inc;
                if (_layer != null) Rebuild();
            }
            var kb = Keyboard.current;
            if (kb != null && kb.f7Key.wasPressedThisFrame) Show(!_open);
            if (_open && _layer == null && Time.unscaledTime > _retryAt) { _retryAt = Time.unscaledTime + 3f; Rebuild(); }
        }
        catch (Exception e) { Fail("image", e); }
    }

    void Show(bool open)
    {
        _open = open;
        if (open && _layer == null) Rebuild();
        if (_layer == null) return;
        if (open) EnsureFont();
        _layer.style.display = open ? DisplayStyle.Flex : DisplayStyle.None;
    }

    // ---------- construction ----------

    void Rebuild()
    {
        try
        {
            if (_layer == null)
            {
                var root = OwnPanel();
                if (root == null) return;
                _layer = new VisualElement { pickingMode = PickingMode.Ignore };
                _layer.style.position = Position.Absolute;
                _layer.style.left = 0; _layer.style.top = 0; _layer.style.right = 0; _layer.style.bottom = 0;
                // Collé à droite, sous la barre du haut du jeu : on voit encore l'écran de FM à gauche.
                _layer.style.alignItems = Align.FlexEnd;
                _layer.style.justifyContent = Justify.FlexStart;
                _layer.style.paddingTop = 90; _layer.style.paddingRight = 24;
                root.Add(_layer);
                _layer.BringToFront();
                EnsureFont();
            }
            _layer.Clear();
            _layer.style.display = _open ? DisplayStyle.Flex : DisplayStyle.None;

            var w = new VisualElement();
            w.style.width = new Length(32, LengthUnit.Percent);
            w.style.minWidth = 460;
            w.style.backgroundColor = Night;
            Border(w, Amber, 2);
            Round(w, 10);
            Pad(w, 22, 18);
            _layer.Add(w);

            var d = _data;
            var head = new VisualElement();
            head.style.flexDirection = FlexDirection.Row;
            head.style.alignItems = Align.Center;
            var title = Text(d?.Heading ?? "FM Immersion", 22, Amber, true);
            title.style.flexGrow = 1;
            head.Add(title);
            var close = Btn(d?.Ui.Close ?? "Fermer", () => Show(false));
            close.style.marginBottom = 0;
            head.Add(close);
            w.Add(head);
            if (d == null)
            {
                w.Add(Text("Ouvre FM Immersion sur ton PC : il prépare ici le briefing de l'adjoint et la une de la gazette.", 15, Soft, false));
                return;
            }
            if (d.Sub.Length > 0) { var sub = Text(d.Sub, 13, Soft, false); sub.style.marginBottom = 12; w.Add(sub); }

            // Le mot de l'adjoint
            w.Add(Section(d.Brief.Title));
            if (d.Brief.Items.Count == 0) w.Add(Text(d.Brief.Empty, 15, Soft, false));
            foreach (var it in d.Brief.Items)
            {
                var row = new VisualElement();
                row.style.flexDirection = FlexDirection.Row;
                row.style.alignItems = Align.FlexStart;
                row.style.marginBottom = 6;
                var dot = new VisualElement();
                dot.style.width = 10; dot.style.height = 10; dot.style.marginTop = 6; dot.style.marginRight = 10; dot.style.flexShrink = 0;
                Round(dot, 5);
                dot.style.backgroundColor = it.Tone switch { "bad" => Bad, "warn" => Warn, "good" => Good, _ => Soft };
                row.Add(dot);
                var t = Text(it.Text, 15, Color.white, false);
                t.style.flexShrink = 1;
                row.Add(t);
                w.Add(row);
            }

            // La une de la gazette
            var g = d.Gazette;
            if (g != null)
            {
                var sep = new VisualElement();
                sep.style.height = 1; sep.style.backgroundColor = Line; sep.style.marginTop = 10; sep.style.marginBottom = 10;
                w.Add(sep);
                w.Add(Section(g.Label));
                var gt = Text(g.Title, 20, Color.white, true);
                gt.style.marginBottom = 4;
                w.Add(gt);
                if (g.Lede.Length > 0) w.Add(Text(g.Lede, 14, Soft, false));
                if (g.Others.Count > 0)
                {
                    var also = Text(g.Also, 12, Amber, true);
                    also.style.marginTop = 8;
                    w.Add(also);
                    foreach (var o in g.Others) w.Add(Text("· " + o, 14, Color.white, false));
                }
            }
            if (d.Ui.Hint.Length > 0) { var hint = Text(d.Ui.Hint, 12, Soft, false); hint.style.marginTop = 12; w.Add(hint); }
        }
        catch (Exception e) { _layer = null; Fail("construction", e); }
    }

    Label Section(string t)
    {
        var l = Text(t.ToUpperInvariant(), 12, Amber, true);
        l.style.marginBottom = 6;
        return l;
    }

    // Notre panneau, avec les réglages du panneau FM le plus haut (thème), au-dessus de toute l'interface du jeu.
    // Même méthode que PressWindow (validée en jeu le 11/11/2026), ordre +90 : la conférence reste au-dessus.
    VisualElement? OwnPanel()
    {
        var docs = UnityCore::UnityEngine.Object.FindObjectsOfType<UIDocument>();
        if (docs == null || docs.Length == 0) return null;
        UIDocument? best = null; float order = float.MinValue;
        foreach (var doc in docs)
        {
            if (doc == null || doc.panelSettings == null || doc.rootVisualElement == null) continue;
            if (doc.panelSettings.name == "FMImmersionPresse") continue;
            if (doc.panelSettings.sortingOrder > order) { order = doc.panelSettings.sortingOrder; best = doc; }
        }
        if (best == null) return null;
        try
        {
            var settings = UnityCore::UnityEngine.Object.Instantiate(best.panelSettings);
            settings.name = "FMImmersionAujourdhui";
            settings.sortingOrder = order + 90f;
            settings.targetTexture = null;
            _go = new GameObject("FMImmersionAujourdhui");
            UnityCore::UnityEngine.Object.DontDestroyOnLoad(_go);
            _go.hideFlags = HideFlags.HideAndDontSave;
            var ui = _go.AddComponent<UIDocument>();
            ui.panelSettings = settings;
            ui.sortingOrder = 990;
            var r = ui.rootVisualElement;
            if (r != null)
            {
                r.pickingMode = PickingMode.Ignore;
                r.style.position = Position.Absolute;
                r.style.left = 0; r.style.top = 0; r.style.right = 0; r.style.bottom = 0;
                return r;
            }
        }
        catch (Exception e) { Fail("panneau", e); }
        return best.rootVisualElement;
    }

    void EnsureFont()
    {
        if (_fontOk || _layer == null) return;
        try
        {
            var all = Resources.FindObjectsOfTypeAll<FontAsset>();
            if (all != null && all.Length > 0)
            {
                FontAsset pick = all[0];
                foreach (var a in all) if (a != null && a.name != null && a.name.Contains("Regular")) { pick = a; break; }
                _layer.style.unityFontDefinition = FontDefinition.FromSDFFont(pick);
                _fontOk = true;
                return;
            }
            var f = Font.CreateDynamicFontFromOSFont("Segoe UI", 18) ?? Font.CreateDynamicFontFromOSFont("Arial", 18);
            if (f != null) { _layer.style.unityFontDefinition = FontDefinition.FromFont(f); _fontOk = true; }
        }
        catch (Exception e) { Fail("police", e); }
    }

    // ---------- petits outils ----------

    static Label Text(string t, int size, Color c, bool bold)
    {
        var l = new Label(t);
        l.style.fontSize = size;
        l.style.color = c;
        l.style.whiteSpace = WhiteSpace.Normal;
        if (bold) l.style.unityFontStyleAndWeight = FontStyle.Bold;
        return l;
    }

    Button Btn(string t, Action click)
    {
        var b = new Button { text = t };
        b.style.fontSize = 14;
        b.style.color = Ink;
        b.style.backgroundColor = AmberLight;
        b.style.unityTextAlign = TextAnchor.MiddleCenter;
        b.style.minHeight = 32;
        Pad(b, 12, 4);
        Round(b, 6);
        Border(b, AmberLight, 0);
        b.RegisterCallback<MouseEnterEvent>((EventCallback<MouseEnterEvent>)(_ => b.style.backgroundColor = Amber));
        b.RegisterCallback<MouseLeaveEvent>((EventCallback<MouseLeaveEvent>)(_ => b.style.backgroundColor = AmberLight));
        b.add_clicked((Il2CppSystem.Action)(() =>
        {
            try { click(); } catch (Exception e) { Fail("clic", e); }
        }));
        return b;
    }

    static void Pad(VisualElement e, float h, float v) { e.style.paddingLeft = h; e.style.paddingRight = h; e.style.paddingTop = v; e.style.paddingBottom = v; }
    static void Round(VisualElement e, float r) { e.style.borderTopLeftRadius = r; e.style.borderTopRightRadius = r; e.style.borderBottomLeftRadius = r; e.style.borderBottomRightRadius = r; }
    static void Border(VisualElement e, Color c, float w)
    {
        e.style.borderLeftWidth = w; e.style.borderRightWidth = w; e.style.borderTopWidth = w; e.style.borderBottomWidth = w;
        e.style.borderLeftColor = c; e.style.borderRightColor = c; e.style.borderTopColor = c; e.style.borderBottomColor = c;
    }

    void Fail(string where, Exception e)
    {
        _errors++;
        Plugin.Log.LogWarning($"Aujourd'hui : erreur ({where}) {_errors}/20 : {e.GetType().Name} {e.Message}");
        if (_errors == 1) Plugin.Log.LogWarning(e.ToString());
        if (_errors >= 20) { _stopped = true; Plugin.Log.LogError("Aujourd'hui : trop d'erreurs, panneau arrêté."); }
    }
}

// Contenu écrit par FM Immersion (fmi-aujourdhui/1). Tous les textes sont déjà dans la langue du joueur.
sealed class TodayData
{
    internal static readonly TodayData None = new() { Key = "" };
    public string Format { get; init; } = "";
    public string Key { get; init; } = "";
    public string Heading { get; init; } = "Aujourd'hui";
    public string Sub { get; init; } = "";
    public TodayBrief Brief { get; init; } = new();
    public TodayGazette? Gazette { get; init; }
    public TodayUi Ui { get; init; } = new();

    const int MaxItems = 8, MaxOthers = 3;
    static readonly JsonSerializerOptions Opts = new() { PropertyNameCaseInsensitive = true };

    internal static TodayData? Parse(string text)
    {
        var d = JsonSerializer.Deserialize<TodayData>(text, Opts);
        if (d == null || d.Format != "fmi-aujourdhui/1" || string.IsNullOrEmpty(d.Key)) return null;
        // Bornes : le panneau n'a pas d'ascenseur, il doit tenir à l'écran.
        if (d.Brief.Items.Count > MaxItems) d.Brief.Items.RemoveRange(MaxItems, d.Brief.Items.Count - MaxItems);
        if (d.Gazette != null && d.Gazette.Others.Count > MaxOthers) d.Gazette.Others.RemoveRange(MaxOthers, d.Gazette.Others.Count - MaxOthers);
        return d;
    }
}

sealed class TodayBrief
{
    public string Title { get; init; } = "Le mot de l'adjoint";
    public string Empty { get; init; } = "Rien d'urgent aujourd'hui.";
    public List<TodayItem> Items { get; init; } = new();
}

sealed class TodayItem
{
    public string Tone { get; init; } = "info";
    public string Text { get; init; } = "";
}

sealed class TodayGazette
{
    public string Label { get; init; } = "La Gazette";
    public string Title { get; init; } = "";
    public string Lede { get; init; } = "";
    public string Also { get; init; } = "Aussi dans ce numéro";
    public List<string> Others { get; init; } = new();
}

sealed class TodayUi
{
    public string Close { get; init; } = "Fermer";
    public string Hint { get; init; } = "F7 pour ouvrir ou fermer ce panneau.";
}
