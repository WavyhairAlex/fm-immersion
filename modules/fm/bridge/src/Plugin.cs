using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;
using BepInEx;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;

namespace Archivix;

// Pont en lecture seule entre FM27 et le compagnon Archivix.
// Serveur local facultatif (réglage ServeurLocal, coupé par défaut depuis 0.4.5) : GET / (archivix.html à côté de la DLL),
// GET /api/snapshot, GET /api/discover?q=, sondes /api/probe… FM Immersion ne s'en sert pas : il lit les fichiers JSON.
[BepInPlugin("fr.archivix.bridge", "Archivix Bridge", Version)]
public class Plugin : BasePlugin
{
    public const string Version = "0.5.4";
    internal static ManualLogSource Log = null!;
    // Dossier où le plugin écrit ses instantanés (réglage BepInEx\config\fr.archivix.bridge.cfg,
    // que FM Immersion renseigne à l'installation ; par défaut le dossier de données FM27 dans Documents).
    internal static string DataDir = null!;
    internal static bool ReadTactic = true, ReadEffectiveness, ReadLineup, ReadExtended, ReadTargets, WriteDiscovery = true, LocalServer, ReadLive = true;
    bool _discovered;
    internal static int RereadSeconds = 300;
    const string Prefix = "http://localhost:8727/";
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    HttpListener? _http;
    IGameReader _reader = new FmBindingReader();
    Snapshot? _last;
    readonly object _lock = new();

    public override void Load()
    {
        Log = base.Log;
        DataDir = Config.Bind("Archivix", "Dossier",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Sports Interactive", "Football Manager 27", "archivix"),
            "Dossier où écrire archivix-snapshot.json (en général <données FM27>\\archivix).").Value;
        // Réglages de prudence : chaque lecture passe par le système d'affichage du jeu, qui doit rester fluide.
        // Désactivé par défaut : lire la tactique pendant que l'écran Tactique est ouvert a figé puis planté FM27
        // (31/10/2026, erreur TacticalPlannerTool « Out of bounds index: -1 »).
        ReadTactic = Config.Bind("Archivix", "LireTactique", false,
            "Lire la tactique active (nom, mentalité, postes, consignes). Risqué : peut figer FM27 si l'écran Tactique est ouvert.").Value;
        ReadEffectiveness = Config.Bind("Archivix", "LireEfficacite", false,
            "Lire l'efficacité tactique FM27 (expérimental : le jeu ne répond pas encore à ces lectures).").Value;
        ReadLineup = Config.Bind("Archivix", "LireCompo", false,
            "Lire la compo (joueur à chaque poste) et les rôles personnalisés. Expérimental ; jamais pendant que l'écran Tactique est ouvert.").Value;
        ReadExtended = Config.Bind("Archivix", "LireJoueursEtendus", false,
            "Lire moral, satisfaction, hiérarchie, étoiles du staff et niveau des joueurs (expérimental).").Value;
        ReadTargets = Config.Bind("Archivix", "LireCibles", false,
            "Lire les cibles du mercato : ta liste de suivi et les cibles du recrutement (joueurs d'autres clubs, avis des recruteurs). Expérimental.").Value;
        WriteDiscovery = Config.Bind("Archivix", "Decouverte", true,
            "Écrire archivix\\config\\decouverte.json (propriétés et contextes du jeu, sans requête au jeu) une fois par lancement.").Value;
        RereadSeconds = Math.Max(60, Config.Bind("Archivix", "RelectureSecondes", 300,
            "Relecture complète au plus tard toutes les N secondes même sans changement de date (60 au minimum).").Value);
        // 0.4.5 (audit du 03/11/2026) : serveur local coupé par défaut. Ouvert, n'importe quelle page web du navigateur
        // pouvait l'appeler et déclencher des lectures dans le jeu (/api/probe, /api/squad). FM Immersion ne s'en sert pas.
        LocalServer = Config.Bind("Archivix", "ServeurLocal", false,
            "Ouvrir le serveur local http://localhost:8727 (ancienne page archivix.html et sondes de découverte). Inutile pour FM Immersion ; à n'activer que pour du diagnostic.").Value;
        ReadLive = Config.Bind("Archivix", "LireMatchDirect", true,
            "Pendant un match, écrire toutes les 15 s archivix-live.json (score, minute, buteurs) pour le direct Discord de FM Immersion.").Value;
        AddComponent<MainThread>();
        new Thread(RefreshLoop) { IsBackground = true, Name = "ArchivixRefresh" }.Start();
        new Thread(DateLoop) { IsBackground = true, Name = "ArchivixDate" }.Start();
        if (ReadLive) new Thread(LiveLoop) { IsBackground = true, Name = "ArchivixLive" }.Start();
        if (LocalServer) StartServer();
        Log.LogInfo($"Archivix Bridge {Version} : instantanés dans {DataDir}" + (_http != null ? $", serveur local sur {Prefix}" : ""));
    }

    // Un port déjà pris ne doit pas empêcher le plugin de démarrer : les instantanés continuent sans serveur.
    void StartServer()
    {
        try
        {
            var http = new HttpListener();
            http.Prefixes.Add(Prefix);
            http.Start();
            _http = http;
            new Thread(Serve) { IsBackground = true, Name = "ArchivixHttp" }.Start();
        }
        catch (Exception e)
        {
            _http = null;
            Log.LogWarning($"Serveur local {Prefix} impossible à ouvrir ({e.Message}) : instantanés seulement.");
        }
    }

    // Vérifie la date de jeu toutes les 10 s ; instantané complet au chargement d'une partie, à chaque nouveau
    // jour de jeu, et au plus tard toutes les RelectureSecondes (300 s par défaut). Les lectures IL2CPP sont exécutées sur le thread principal
    // par MainThread ; ce thread-ci ne fait qu'attendre les réponses et écrire les fichiers.
    //
    // 0.4.2 (plantage du 01/11 à 18h02, lecture lancée juste après un chargement puis sortie de partie) :
    // - après un chargement, on attend que la partie soit chargée sans interruption depuis SettleSeconds avant de lire ;
    // - une lecture en cours s'arrête dès que la partie n'est plus la même (sortie, autre sauvegarde), voir FmBindingReader.Read.
    const int SettleSeconds = 45;

    void RefreshLoop()
    {
        string? lastDate = null;
        var lastFull = DateTime.MinValue;
        DateTime? loadedSince = null;
        // Sans équipe (manager sans club) : la date seule, au plus une fois par minute, après SettleSeconds sans équipe
        // (jamais pendant un chargement ou une sortie de partie), pour archivix-status.json avec club null.
        DateTime? noTeamSince = null, lastNoTeamRead = null;
        string? lastNoTeamDate = null;
        while (true)
        {
            Thread.Sleep(10_000);
            try
            {
                var date = FmBindingReader.CurrentDate();
                if (date == null)   // pas d'équipe chargée : menu, chargement, ou manager sans club
                {
                    lastDate = null; loadedSince = null;
                    var now = DateTime.UtcNow;
                    noTeamSince ??= now;
                    if (now - noTeamSince >= TimeSpan.FromSeconds(SettleSeconds) && (lastNoTeamRead == null || now - lastNoTeamRead >= TimeSpan.FromSeconds(60)))
                    {
                        lastNoTeamRead = now;
                        var d = FmBindingReader.DateWithoutTeam();
                        if (d != null && d != lastNoTeamDate) { WriteStatus(d, null); lastNoTeamDate = d; }
                    }
                    continue;
                }
                noTeamSince = null; lastNoTeamRead = null; lastNoTeamDate = null;
                loadedSince ??= DateTime.UtcNow;
                if (DateTime.UtcNow - loadedSince < TimeSpan.FromSeconds(SettleSeconds)) continue;   // partie tout juste chargée
                if (date == lastDate && DateTime.UtcNow - lastFull < TimeSpan.FromSeconds(RereadSeconds)) continue;
                Refresh();
                lastDate = date;
                lastFull = DateTime.UtcNow;
            }
            catch (FmBindingReader.GameChanged) { lastDate = null; loadedSince = null; Log.LogInfo("Partie quittée ou changée pendant la lecture : instantané abandonné."); }
            catch (Exception e) { Log.LogWarning($"Instantané impossible : {e.Message}"); }
        }
    }

    // Date de jeu en direct (0.5.3) : toutes les 10 s, une seule lecture (club + date), et archivix-status.json dès que
    // la date change. Un instantané complet prend 1 à 2 minutes et garde la date de son début : pendant que le joueur
    // avance, FM Immersion affichait jusqu'à 3 jours de retard (08/11/2026). Rien pendant un chargement (SettleSeconds).
    void DateLoop()
    {
        string? last = null;
        DateTime? loadedSince = null;
        while (true)
        {
            Thread.Sleep(10_000);
            try
            {
                var (date, club) = FmBindingReader.CurrentDateAndClub();
                if (date == null || club == null) { last = null; loadedSince = null; continue; }
                loadedSince ??= DateTime.UtcNow;
                if (DateTime.UtcNow - loadedSince < TimeSpan.FromSeconds(SettleSeconds)) continue;
                var key = club + "|" + date;
                if (key == last) continue;
                WriteStatus(date, club, live: true);
                last = key;
            }
            catch (Exception e) { Log.LogWarning($"Date de jeu : {e.Message}"); }
        }
    }

    // Match en direct (0.5.0) : toutes les 20 s, le plugin demande au jeu si un match est en cours ; pendant le match,
    // il relit toutes les 15 s le score du match du manager (FmBindingReader.ReadLive) et écrit archivix-live.json.
    // Lecture seule, comme le reste. Le fichier garde le dernier état (match fini compris) jusqu'au match suivant.
    // 0.5.4 : à la fin du match (dernière lecture, ou résultat final), le rapport du match (buteurs, passeurs, feuille de
    // match) est ajouté au relevé depuis LastFixture (FmBindingReader.AddMatchReport).
    void LiveLoop()
    {
        bool was = false;
        string? gameDate = null;
        Dictionary<string, object?>? last = null;
        while (true)
        {
            try
            {
                var now = FmBindingReader.DuringMatch() == true;
                if (now && !was) { gameDate = FmBindingReader.CurrentDate(); last = null; Log.LogInfo("Match en cours : direct dans archivix-live.json"); }
                if (now || was)   // une dernière lecture après la fin du match, pour le résultat final
                {
                    var live = FmBindingReader.ReadLive();
                    // Match fini : le jeu ne répond plus toujours sur le match (0.5.0 laissait alors le relevé « en cours »
                    // à la dernière minute lue, et le direct Discord ne se terminait jamais). On ferme avec le dernier
                    // score connu, marqué final.
                    if (live == null && !now && last != null) { live = new Dictionary<string, object?>(last); live["final"] = true; live["minute"] = "FDM"; }
                    if (live != null)
                    {
                        if (!now) live["final"] = true;
                        if (!now || live["final"] is true)
                            try { FmBindingReader.AddMatchReport(live); } catch (Exception e) { Log.LogWarning($"Rapport de match : {e.Message}"); }
                        var doc = new Dictionary<string, object?> { ["schema"] = "archivix-live/1", ["gameDate"] = gameDate, ["inMatch"] = now, ["updatedAt"] = DateTime.UtcNow.ToString("o") };
                        foreach (var kv in live) doc[kv.Key] = kv.Value;
                        Directory.CreateDirectory(DataDir);
                        WriteAtomic(Path.Combine(DataDir, "archivix-live.json"), JsonSerializer.Serialize(doc, Json));
                        last = now ? live : null;
                    }
                }
                was = now;
            }
            catch (Exception e) { Log.LogWarning($"Match en direct : {e.Message}"); }
            Thread.Sleep(was ? 15_000 : 20_000);
        }
    }

    internal void Refresh()
    {
        var snap = _reader.Read();
        // Jamais d'instantané vide : il écraserait le dernier effectif valide (ex. partie en cours de chargement)
        if (snap.Players.Count == 0 || string.IsNullOrEmpty(snap.Club)) return;
        lock (_lock) _last = snap;
        var dir = DataDir;
        Directory.CreateDirectory(dir);
        var json = JsonSerializer.Serialize(snap, Json);
        WriteAtomic(Path.Combine(dir, "archivix-snapshot.json"), json);
        WriteAtomic(Path.Combine(dir, $"archivix-{snap.GameDate}.json"), json);
        WriteStatus(snap.GameDate, snap.Club, live: false);
        if (WriteDiscovery && !_discovered)
        {
            _discovered = true;
            try { Discovery.Write(dir); }
            catch (Exception e) { Log.LogWarning($"Rapport de découverte impossible : {e.Message}"); }
        }
    }

    // État courant pour FM Immersion (0.4.2) : date de jeu et club du manager (null = sans club). Aucune lecture en plus :
    // reprend les valeurs de l'instantané. Format : {"schema":"archivix-status/1","gameDate":"yyyy-MM-dd","club":"Nom"|null}
    // 0.5.3 : la date est aussi écrite par DateLoop, en avance sur l'instantané. Un instantané (live: false) ne la fait
    // donc jamais reculer pour le même club ; un retour en arrière réel (sauvegarde rechargée) passe par DateLoop.
    static string? _statusDate, _statusClub;
    static readonly object StatusLock = new();
    internal static void WriteStatus(string gameDate, string? club) => WriteStatus(gameDate, club, live: true);
    internal static void WriteStatus(string gameDate, string? club, bool live)
    {
        lock (StatusLock)
        {
            if (!live && club != null && club == _statusClub && _statusDate != null && string.CompareOrdinal(gameDate, _statusDate) < 0) return;
            _statusDate = gameDate; _statusClub = club;
        }
        try
        {
            var dir = DataDir;
            Directory.CreateDirectory(dir);
            var json = JsonSerializer.Serialize(new Dictionary<string, object?> { ["schema"] = "archivix-status/1", ["gameDate"] = gameDate, ["club"] = club });
            WriteAtomic(Path.Combine(dir, "archivix-status.json"), json);
        }
        catch (Exception e) { Log.LogWarning($"archivix-status.json : {e.Message}"); }
    }

    // Écriture atomique : fichier .tmp puis remplacement, pour qu'un lecteur ne voie jamais un JSON à moitié écrit.
    static void WriteAtomic(string path, string content)
    {
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, content, new UTF8Encoding(false));
        File.Move(tmp, path, overwrite: true);
    }

    void Serve()
    {
        while (_http is { IsListening: true })
        {
            HttpListenerContext ctx;
            try { ctx = _http.GetContext(); } catch { break; }
            try { Handle(ctx); }
            catch (Exception e) { Log.LogError(e); Write(ctx, 500, "text/plain", e.Message); }
        }
    }

    // Pas d'en-tête CORS : seule la page servie par le plugin lui-même (même origine) peut lire ses réponses.
    void Handle(HttpListenerContext ctx)
    {
        switch (ctx.Request.Url!.AbsolutePath)
        {
            case "/":
                var html = Path.Combine(Path.GetDirectoryName(typeof(Plugin).Assembly.Location)!, "archivix.html");
                Write(ctx, 200, "text/html; charset=utf-8", File.Exists(html) ? File.ReadAllText(html) : "archivix.html introuvable");
                break;
            case "/api/snapshot":
                Snapshot? s; lock (_lock) s = _last;
                if (s == null) Write(ctx, 503, "application/json", "{\"error\":\"Aucun instantané : charge une partie\"}");
                else Write(ctx, 200, "application/json", JsonSerializer.Serialize(s, Json));
                break;
            case "/api/discover":
                var q = ctx.Request.QueryString["q"] ?? "Player";
                Write(ctx, 200, "application/json", JsonSerializer.Serialize(Discover(q), Json));
                break;
            case "/api/probe" or "/api/squad" when TacticsScreen.IsOpen() != false:
                // Sondes refusées tant que l'écran Tactique est ouvert (ou son état inconnu) : risque de figer FM27.
                Write(ctx, 409, "application/json", "{\"error\":\"Écran Tactique ouvert (ou état inconnu) : sonde refusée\"}");
                break;
            case "/api/probe":
                var qs = ctx.Request.QueryString;
                int? item = int.TryParse(qs["item"], out var n) ? n : null;
                Write(ctx, 200, "application/json", JsonSerializer.Serialize(Probe.Path(qs["path"] ?? "game.GameCurrentManagerClubTeam", item, qs["prop"]), Json));
                break;
            case "/api/squad":
                var max = int.TryParse(ctx.Request.QueryString["max"], out var m) ? m : 3;
                Write(ctx, 200, "application/json", JsonSerializer.Serialize(Probe.Squad(max, ctx.Request.QueryString["path"], ctx.Request.QueryString["props"]), Json));
                break;
            case "/api/properties":
                Write(ctx, 200, "application/json", JsonSerializer.Serialize(Probe.Properties(ctx.Request.QueryString["q"] ?? ""), Json));
                break;
            case "/api/refprops":
                Write(ctx, 200, "application/json", JsonSerializer.Serialize(Probe.RefProps(ctx.Request.QueryString["type"] ?? "PersonReference"), Json));
                break;
            default:
                Write(ctx, 404, "text/plain", "Introuvable");
                break;
        }
    }

    static object Discover(string q) =>
        AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(a => { try { return a.GetTypes(); } catch { return Array.Empty<Type>(); } })
            .Where(t => t.Name.Contains(q, StringComparison.OrdinalIgnoreCase))
            .Take(200)
            .Select(t => new
            {
                assembly = t.Assembly.GetName().Name,
                type = t.FullName,
                members = t.GetProperties().Select(p => $"{p.PropertyType.Name} {p.Name}")
                    .Concat(t.GetFields().Select(f => $"{f.FieldType.Name} {f.Name}")).Take(80).ToList()
            }).ToList();

    static void Write(HttpListenerContext ctx, int code, string type, string body)
    {
        var bytes = Encoding.UTF8.GetBytes(body);
        ctx.Response.StatusCode = code;
        ctx.Response.ContentType = type;
        ctx.Response.OutputStream.Write(bytes);
        ctx.Response.Close();
    }
}

public record Snapshot(string Schema, string Game, string Club, string GameDate, List<PlayerDto> Players, TacticDto? Tactic = null)
{
    // Efficacité tactique FM27 (null si non lisible) : overall, components, understandingAreas, complexity, … (voir FmBindingReader.ReadTactic)
    public Dictionary<string, object?>? Effectiveness { get; init; }
    // Données ajoutées par archivix\config\chemins.json (sans recompiler) ; joueurs indexés par rang dans l'effectif
    public Dictionary<string, object?>? Custom { get; init; }
    // Club (finances, direction, formation) et prochain match / calendrier ; null si non lisibles
    public Dictionary<string, object?>? ClubInfo { get; init; }
    public Dictionary<string, object?>? NextMatch { get; init; }
    // Compo (réglage LireCompo) : un élément par index de sélection 0-10 {index, playerId, playerName, position, raw} ; null si non lue
    public List<Dictionary<string, object?>>? Lineup { get; init; }
    // Réglage LireJoueursEtendus : par id de joueur {morale, moraleText, happiness*, hierarchy, currentStars, potentialStars,
    // personality, mediaHandling, currentAbility, potentialAbility} (champs absents si le jeu ne répond pas)
    public Dictionary<string, Dictionary<string, object?>>? PlayersExtended { get; init; }
    // Réglage LireCibles (0.4.0) : joueurs suivis hors du club (mêmes champs que players + club, scout, sources) ;
    // TargetSources : par source, chemin lu, nombre de joueurs, et la forme renvoyée par le jeu si aucun joueur n'est reconnu.
    public List<PlayerDto>? Shortlist { get; init; }
    public Dictionary<string, object?>? TargetSources { get; init; }
    // État de la collecte : blocs lus ou sautés et pourquoi (ex. {"tactique":"sautée : écran Tactique ouvert"})
    public Dictionary<string, string>? Collecte { get; init; }
}

// Ca/Pa : null, le jeu ne les expose pas à l'interface (voir StarRating).
// Wage : montant du contrat dans l'unité affichée par le jeu (voir WageText, ex. "95 € p/m").
// Attributes : fourchette {min,max} ; min == max quand l'attribut est connu précisément.
public record PlayerDto(
    int Id, string Name, int Age, string[] Positions, string? Foot,
    int? Ca, int? Pa, int? Condition, string? Morale,
    string? ContractEnd, long? Wage, long? Value, string? SquadStatus,
    int? Apps, int? Goals, double? AvgRating, string? Injury,
    Dictionary<string, object>? Attributes)   // valeur exacte (int) ou fourchette AttrRange {min,max}
{
    public string? PositionsText { get; init; }   // libellé FR du jeu, ex. "MO (DGC), BT (C)"
    public Dictionary<string, int>? PositionRatings { get; init; }   // familiarité 1-20 par poste, ex. {"D (C)":20,"D (D)":18}
    // Suivi : risque de blessure, hiérarchie, groupe social, satisfaction, promesses, clubs intéressés, statut de transfert…
    public Dictionary<string, object?>? Tracking { get; init; }
    public int? SquadNumber { get; init; }
    public string? Nationality { get; init; }
    public string? BestPosition { get; init; }
    public int? Sharpness { get; init; }
    public string? WageText { get; init; }
    public string? ValueText { get; init; }
    public long? ValueMin { get; init; }
    public int? InjuryReturnDays { get; init; }
    public AttrRange? StarRating { get; init; }   // à remplir : étoiles CA/PA du staff (propriété à confirmer)
    // Cibles du mercato seulement (absents pour l'effectif) : club actuel, avis du recrutement, listes où le joueur figure.
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string? Club { get; init; }
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, object?>? Scout { get; init; }
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public string[]? Sources { get; init; }
}

public record AttrRange(int Min, int Max);

// Formation : pour l'instant MostUsedFormation de l'équipe ; mentalité, postes et instructions à remplir
// une fois la référence de tactique validée en jeu.
public record TacticDto(string? Formation, string? FormationSource, string? Mentality,
    List<TacticSlotDto> Slots, List<string> TeamInstructions)
{
    // Champs lus sur la référence de tactique (null si le jeu ne répond pas). Les valeurs composées sont brutes (JSON du jeu).
    public string? Name { get; init; }
    public object? FormationIP { get; init; }
    public object? FormationOOP { get; init; }
    public object? MentalityRaw { get; init; }
    public object? Style { get; init; }
    public object? Complexity { get; init; }
    public object? Intensity { get; init; }
    public string? ComplexityLabel { get; init; }
    public string? IntensityLabel { get; init; }
    public string? ActiveSlot { get; init; }
    public string?[]? SlotNames { get; init; }
    public object? InPossessionInstructions { get; init; }
    public object? OutOfPossessionInstructions { get; init; }
    public Dictionary<string, object?>? Recommended { get; init; }
    public List<Dictionary<string, object?>>? Positions { get; init; }
    public object? PositionsCombined { get; init; }   // 11 postes, JSON brut du jeu (poste, rôles avec / sans ballon, joueur…)
}
public record TacticSlotDto(string Position, int? PlayerId, string? Role, string? Duty);

public interface IGameReader { Snapshot Read(); }

class PlaceholderReader : IGameReader
{
    public Snapshot Read() => new("archivix/1", "FM27", "À cartographier", DateTime.Today.ToString("yyyy-MM-dd"), new());
}
