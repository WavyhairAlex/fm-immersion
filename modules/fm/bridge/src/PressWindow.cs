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

// Conférence de presse FM Immersion dans FM27 (0.6.2). Fenêtre posée PAR-DESSUS l'interface du jeu : elle n'envoie
// aucun événement au jeu et ne change rien à la partie (pas de moral, pas de réputation : ce n'est pas la conférence de FM).
//
// - FM Immersion écrit la conférence du moment dans <Dossier>\fmimmersion-presse.json (format fmi-presse/1 : textes déjà
//   rédigés dans la langue du joueur, trois réponses toutes faites par question) et le retire quand il n'y en a plus.
// - Le plugin relit ce fichier toutes les 5 s (thread à part) ; une nouvelle conférence ouvre la fenêtre, jamais pendant
//   un match. F8 l'ouvre ou la ferme.
// - Les réponses vont dans <Dossier>\fmimmersion-presse-reponse.json (écriture atomique), que FM Immersion relit pour la
//   gazette et Discord.
//
// Affichage : FM27 n'a plus l'ancien système IMGUI (OnGUI lève « Method unstripping failed », test du 11/11/2026). On
// utilise donc UI Toolkit, le système d'interface du jeu : panneau à nous, réglages copiés du panneau FM le plus haut,
// police prise dans les polices du jeu (sans elle les textes restent invisibles). Validé en jeu le 11/11/2026.
public class PressWindow : MonoBehaviour
{
    public PressWindow(IntPtr p) : base(p) { }

    internal const string QuestionFile = "fmimmersion-presse.json";
    internal const string AnswerFile = "fmimmersion-presse-reponse.json";

    static readonly Color Night = new(0.06f, 0.11f, 0.18f, 0.97f);
    static readonly Color Amber = new(1f, 0.71f, 0.28f);
    static readonly Color AmberLight = new(1f, 0.92f, 0.78f);
    static readonly Color Ink = new(0.06f, 0.11f, 0.18f);
    static readonly Color Soft = new(0.8f, 0.84f, 0.9f);

    // Échanges avec le thread de lecture du fichier.
    static volatile Conference? _incoming;
    static volatile bool _openRequested;
    static readonly HashSet<string> Answered = new();

    Conference? _conf;
    int _index;
    readonly List<PressReply> _replies = new();
    bool _open, _stopped, _fontOk;
    int _errors;
    float _retryAt, _closeAt = -1f;

    GameObject? _go;
    VisualElement? _layer, _body;

    // ---------- lecture du fichier (thread à part, jamais sur le thread du jeu) ----------

    internal static void StartWatcher()
    {
        new Thread(() =>
        {
            string? lastText = null;
            while (true)
            {
                Thread.Sleep(5_000);
                try
                {
                    var path = Path.Combine(Plugin.DataDir, QuestionFile);
                    var text = File.Exists(path) ? File.ReadAllText(path) : null;
                    if (text == lastText) continue;
                    lastText = text;
                    var c = text == null ? null : Conference.Parse(text);
                    if (c != null && AlreadyAnswered(c.Key)) c = null;
                    _incoming = c ?? Conference.None;
                    // Pas d'ouverture automatique pendant un match : la fenêtre attendra F8 ou la fin du match.
                    if (c != null) _openRequested = FmBindingReader.DuringMatch() != true;
                    else _openRequested = false;
                }
                catch (Exception e) { Plugin.Log.LogWarning($"Presse : lecture de {QuestionFile} impossible ({e.Message})."); }
            }
        }) { IsBackground = true, Name = "ArchivixPresse" }.Start();
    }

    static bool AlreadyAnswered(string key)
    {
        lock (Answered) if (Answered.Contains(key)) return true;
        try
        {
            var path = Path.Combine(Plugin.DataDir, AnswerFile);
            if (!File.Exists(path)) return false;
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            return doc.RootElement.TryGetProperty("key", out var k) && k.GetString() == key;
        }
        catch { return false; }
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
                if (inc == Conference.None) { _conf = null; Show(false); }
                else if (_conf == null || _conf.Key != inc.Key) { _conf = inc; _index = 0; _replies.Clear(); Rebuild(); }
            }
            if (_openRequested && _conf != null) { _openRequested = false; Show(true); }
            var kb = Keyboard.current;
            if (kb != null && kb.f8Key.wasPressedThisFrame) Show(!_open);
            if (_closeAt > 0 && Time.unscaledTime > _closeAt) { _closeAt = -1f; _conf = null; Show(false); }
            // Interface du jeu pas encore prête (écran de chargement) : nouvel essai toutes les 3 s.
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
                _layer.style.alignItems = Align.Center;
                _layer.style.justifyContent = Justify.Center;
                root.Add(_layer);
                _layer.BringToFront();
                EnsureFont();
            }
            _layer.Clear();
            _layer.style.display = _open ? DisplayStyle.Flex : DisplayStyle.None;

            var w = new VisualElement();
            w.style.width = new Length(46, LengthUnit.Percent);
            w.style.minWidth = 600;
            w.style.backgroundColor = Night;
            Border(w, Amber, 2);
            Round(w, 10);
            Pad(w, 26, 22);
            _layer.Add(w);

            var c = _conf;
            if (c == null)
            {
                w.Add(Text("FM Immersion", 22, Amber, true));
                w.Add(Text("Aucune conférence de presse en attente.", 16, Soft, false));
                w.Add(Btn("OK", () => Show(false), false));
                return;
            }
            var head = Text(c.Title, 22, Amber, true);
            head.style.marginBottom = 2;
            w.Add(head);
            var sub = Text(c.Subtitle + (c.Questions.Count > 1 ? $"  ·  {_index + 1}/{c.Questions.Count}" : ""), 13, Soft, false);
            sub.style.marginBottom = 14;
            w.Add(sub);

            _body = new VisualElement();
            w.Add(_body);
            if (_index >= c.Questions.Count) { _body.Add(Text(c.Ui.Thanks, 18, Amber, true)); return; }

            var q = c.Questions[_index];
            var by = Text(q.By, 13, Amber, true);
            by.style.marginBottom = 4;
            _body.Add(by);
            var qt = Text("« " + q.Text + " »", 18, Color.white, false);
            qt.style.marginBottom = 14;
            _body.Add(qt);
            foreach (var a in q.Answers)
            {
                var ans = a;
                _body.Add(Btn(ans.Label.Length > 0 ? $"{ans.Label} : {ans.Text}" : ans.Text, () => Reply(q.Id, ans.Tone, ans.Text), true));
            }
            var free = Text(c.Ui.Free, 14, Soft, false);
            free.style.marginTop = 8; free.style.marginBottom = 4;
            _body.Add(free);
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;
            var field = new TextField { multiline = false, maxLength = 400 };
            field.style.flexGrow = 1;
            field.style.minHeight = 40;
            field.style.fontSize = 16;
            field.style.color = Ink;
            field.style.backgroundColor = Color.white;
            Round(field, 6);
            row.Add(field);
            var send = Btn(c.Ui.Send, () =>
            {
                var v = field.value;
                if (!string.IsNullOrWhiteSpace(v)) Reply(q.Id, null, v.Trim());
            }, false);
            send.style.marginLeft = 8; send.style.marginBottom = 0;
            row.Add(send);
            _body.Add(row);

            var foot = new VisualElement();
            foot.style.flexDirection = FlexDirection.Row;
            foot.style.marginTop = 14;
            var skip = Btn(c.Ui.Skip, () => Reply(q.Id, null, null), false);
            skip.style.marginRight = 8;
            foot.Add(skip);
            var decline = Btn(c.Ui.Decline, Decline, false);
            decline.style.marginRight = 8;
            foot.Add(decline);
            foot.Add(Btn(c.Ui.Later, () => Show(false), false));
            _body.Add(foot);
        }
        catch (Exception e) { _layer = null; Fail("construction", e); }
    }

    // Notre panneau, avec les réglages du panneau FM le plus haut (thème), placé au-dessus de toute l'interface du jeu.
    VisualElement? OwnPanel()
    {
        var docs = UnityCore::UnityEngine.Object.FindObjectsOfType<UIDocument>();
        if (docs == null || docs.Length == 0) return null;
        UIDocument? best = null; float order = float.MinValue;
        foreach (var d in docs)
        {
            if (d == null || d.panelSettings == null || d.rootVisualElement == null) continue;
            if (d.panelSettings.sortingOrder > order) { order = d.panelSettings.sortingOrder; best = d; }
        }
        if (best == null) return null;
        try
        {
            var settings = UnityCore::UnityEngine.Object.Instantiate(best.panelSettings);
            settings.name = "FMImmersionPresse";
            settings.sortingOrder = order + 100f;
            settings.targetTexture = null;
            _go = new GameObject("FMImmersionPresse");
            UnityCore::UnityEngine.Object.DontDestroyOnLoad(_go);
            _go.hideFlags = HideFlags.HideAndDontSave;
            var doc = _go.AddComponent<UIDocument>();
            doc.panelSettings = settings;
            doc.sortingOrder = 1000;
            var r = doc.rootVisualElement;
            if (r != null)
            {
                r.pickingMode = PickingMode.Ignore;
                r.style.position = Position.Absolute;
                r.style.left = 0; r.style.top = 0; r.style.right = 0; r.style.bottom = 0;
                return r;
            }
        }
        catch (Exception e) { Fail("panneau", e); }
        return best.rootVisualElement;   // secours : greffe sur le panneau du jeu
    }

    // Police du jeu (SDF), sinon une police de Windows : sans police, UI Toolkit n'affiche aucun texte.
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

    // ---------- réponses ----------

    void Reply(string question, string? tone, string? text)
    {
        if (_conf == null) return;
        if (text != null) _replies.Add(new PressReply(question, tone, text));
        _index++;
        if (_index >= _conf.Questions.Count) Finish(false);
        else Rebuild();
    }

    void Decline() => Finish(true);

    void Finish(bool declined)
    {
        var c = _conf;
        if (c == null) return;
        try
        {
            var payload = new
            {
                format = "fmi-presse-reponse/1",
                key = c.Key,
                declined = declined || _replies.Count == 0,
                answers = declined ? new List<PressReply>() : _replies,
                answeredAt = DateTime.UtcNow.ToString("o"),
            };
            var path = Path.Combine(Plugin.DataDir, AnswerFile);
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(payload, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
            File.Move(tmp, path, true);
            lock (Answered) Answered.Add(c.Key);
            Plugin.Log.LogInfo($"Presse : réponses enregistrées ({(declined ? "refus" : _replies.Count + " réponse(s)")}).");
            _index = c.Questions.Count;
            Rebuild();
            _closeAt = Time.unscaledTime + 2.5f;
        }
        catch (Exception e) { Fail("réponse", e); }
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

    Button Btn(string t, Action click, bool wide)
    {
        var b = new Button { text = t };
        b.style.fontSize = 15;
        b.style.color = Ink;
        b.style.backgroundColor = AmberLight;
        b.style.whiteSpace = WhiteSpace.Normal;
        b.style.unityTextAlign = wide ? TextAnchor.MiddleLeft : TextAnchor.MiddleCenter;
        b.style.minHeight = 40;
        b.style.marginBottom = 8;
        Pad(b, 14, 8);
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
        Plugin.Log.LogWarning($"Presse : erreur ({where}) {_errors}/20 : {e.GetType().Name} {e.Message}");
        if (_errors == 1) Plugin.Log.LogWarning(e.ToString());
        if (_errors >= 20) { _stopped = true; Plugin.Log.LogError("Presse : trop d'erreurs, fenêtre de conférence arrêtée."); }
    }
}

public sealed record PressReply(string Question, string? Tone, string Text);

// Conférence telle qu'écrite par FM Immersion (fmi-presse/1). Tous les textes sont déjà dans la langue du joueur.
sealed class Conference
{
    internal static readonly Conference None = new() { Key = "" };
    public string Key { get; init; } = "";
    public string Title { get; init; } = "";
    public string Subtitle { get; init; } = "";
    public List<PressQ> Questions { get; init; } = new();
    public PressUi Ui { get; init; } = new();

    static readonly JsonSerializerOptions Opts = new() { PropertyNameCaseInsensitive = true };

    internal static Conference? Parse(string text)
    {
        var c = JsonSerializer.Deserialize<Conference>(text, Opts);
        if (c == null || string.IsNullOrEmpty(c.Key) || c.Questions.Count == 0) return null;
        return c;
    }
}

sealed class PressQ
{
    public string Id { get; init; } = "";
    public string By { get; init; } = "";
    public string Text { get; init; } = "";
    public List<PressA> Answers { get; init; } = new();
}

sealed class PressA
{
    public string? Tone { get; init; }
    public string Label { get; init; } = "";
    public string Text { get; init; } = "";
}

sealed class PressUi
{
    public string Free { get; init; } = "Ou avec tes mots :";
    public string Send { get; init; } = "Répondre";
    public string Skip { get; init; } = "Question suivante";
    public string Decline { get; init; } = "Pas de commentaire";
    public string Later { get; init; } = "Plus tard";
    public string Thanks { get; init; } = "Réponses envoyées à FM Immersion. Merci coach !";
}
