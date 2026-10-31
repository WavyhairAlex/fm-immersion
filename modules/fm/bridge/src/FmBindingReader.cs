using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using SI.Bindable;
using SI.Core;
using DateTime = System.DateTime;

namespace Archivix;

// Lecteur de l'effectif du club humain via les bindings du jeu (lecture seule).
// Read() bloque le thread appelant : ne jamais l'appeler depuis le thread principal Unity
// (les requêtes y sont exécutées via MainThread et attendues ici).
public class FmBindingReader : IGameReader
{
    const string Team = "game.GameCurrentManagerClubTeam";
    const string Squad = Team + "/Club/Squad";
    const int TimeoutMs = 8000;

    static readonly string[] AttributeNames =
    {
        "Corners", "Crossing", "Dribbling", "Finishing", "FirstTouch", "FreeKicks", "Heading", "LongShots", "LongThrows",
        "Marking", "Passing", "PenaltyTaking", "Tackling", "Technique",
        "Aggression", "Anticipation", "Bravery", "Composure", "Concentration", "Decisions", "Determination", "Flair",
        "Leadership", "Movement", "Positioning", "Teamwork", "Vision", "WorkRate",
        "Acceleration", "Agility", "Balance", "JumpingReach", "NaturalFitness", "Pace", "Stamina", "Strength",
        "AerialReach", "CommandOfArea", "Communication", "Eccentricity", "Handling", "Kicking", "OneOnOnes",
        "Reflexes", "RushingOut", "TendencyToPunch", "Throwing",
    };

    // Propriétés lues pour chaque joueur ("a/b" = propriété b de la valeur a)
    static readonly string[] PlayerProps =
    {
        "UniqueId", "Name", "Age", "SquadNumber", "NationalityText", "PositionCombinedString", "BestPositionShortString",
        "Footedness/PreferredFootString", "Condition", "Sharpness",
        "FullContract/EndDate", "FullContract/Wage/DisplayValue", "FullContract/AgreedPlayingTime/DisplayValue",
        "TransferValueRange/TransferValueRangeString",
        "ClubAppearancesThisSeason", "ClubGoalsThisSeason", "ClubAverageRatingThisSeason",
        "CurrentInjury/IsActive", "CurrentInjury/InjuryDescription", "CurrentInjury/InjuryReturnDays",
        "MoraleString", "Morale",   // moral : pas toujours exposé hors de son écran (null si muet)
    };

    // Familiarité du joueur à chaque poste (1-20), libellé FR du jeu → propriété Ability*
    static readonly (string Fr, string Path)[] PositionAbilities =
    {
        ("GB", "AbilityGoalkeeper"), ("D (C)", "AbilityCentreBack"), ("D (G)", "AbilityLeftBack"), ("D (D)", "AbilityRightBack"),
        ("DL (G)", "AbilityLeftWingBack"), ("DL (D)", "AbilityRightWingBack"), ("MD (C)", "AbilityDefensiveMidfielder"),
        ("M (C)", "AbilityCentreMidfielder"), ("M (G)", "AbilityLeftMidfielder"), ("M (D)", "AbilityRightMidfielder"),
        ("MO (C)", "AbilityAttackingMidfielder"), ("MO (G)", "AbilityLeftWinger"), ("MO (D)", "AbilityRightWinger"), ("BT (C)", "AbilityForward"),
    };

    // Suivi joueur (clé JSON → chemin). Valeurs simples ; null si le jeu ne répond pas.
    static readonly (string Key, string Path)[] PlayerExtras =
    {
        ("injuryRisk", "OverallInjuryRisk"), ("injuryRiskLevel", "InjuryRiskLevel"),
        ("hierarchy", "HierarchyInfluenceCategoryString"), ("happiness", "HierarchyOverallHappinessLevel"),
        ("socialGroup", "SocialGroupString"), ("playingTimeHappiness", "PlayingTimeHappinessLevel"),
        ("activePromises", "ActivePromisesCount"), ("interestedClubs", "ActiveInterestedClubsCount"),
        ("rumouredClubs", "RumouredInterestedClubsCount"), ("transferStatus", "TransferStatusDetails/TransferStatusCategory"),
        ("sharpnessStatus", "SharpnessStatusDescription"), ("worldReputationStars", "PlayerWorldReputationStarRating/MaxValue"),
    };

    // Club : finances, direction, formation (clé JSON → chemin depuis le club, profond = JSON brut)
    static readonly (string Key, string Path, bool Deep)[] ClubFields =
    {
        ("transferBudget", "TransferBudget", false), ("wageBudget", "WageBudget", false),
        ("remainingWageBudget", "RemainingWageBudgetWithText", false), ("currentWageSpending", "CurrentWageSpendingWithText", false),
        ("totalWageCostsThisMonth", "TotalWageCostsThisMonth", false), ("balance", "OverallBalance", false),
        ("projectionBalance", "ProjectionBalance", true), ("transferPolicy", "TransferPolicy", true),
        ("visionThisYear", "VisionObjectiveThisYearObjective", true), ("visionObjectives", "VisionObjectiveList", true),
        ("boardRecruitmentObjectives", "BoardRecruitmentObjectives", true), ("youthIntakeRating", "YouthIntakeRating", false),
        ("daysUntilYouthIntake", "DaysUntilYouthIntake", false), ("youthCandidates", "YouthCandidatesRanked", true),
        ("dofTransferTargets", "DofTransferTargets", true),
    };

    // Prochain match et calendrier (depuis l'équipe)
    static readonly (string Key, string Path, bool Deep)[] MatchFields =
    {
        ("opponent", "NextMatchOpponent/Name", false), ("competition", "NextMatchCompetition/Name", false),
        ("next5Opponent0", "Next5Fixtures/#0/PropertyValue/Name", false), ("next5Opponent1", "Next5Fixtures/#1/PropertyValue/Name", false),
        ("next5Opponent2", "Next5Fixtures/#2/PropertyValue/Name", false), ("next5Opponent3", "Next5Fixtures/#3/PropertyValue/Name", false),
        ("next5Opponent4", "Next5Fixtures/#4/PropertyValue/Name", false),
        ("location", "NextMatchLocationString", false), ("inDays", "NextMatchDaysText", false),
        ("threatLevel", "NextOppositionThreatLevelAssessment", true), ("next5", "Next5Fixtures", true),
        ("recentForm", "RecentFormFixtures", true), ("lastMatchAnalysis", "LastMatchAnalysis", true),
    };

    const string Tactic = "tactic.";
    const string TE = Tactic + "TacticalEffectiveness";
    static readonly string[] UnderstandingAreas =
        { "BuildUpStrategy", "ChanceCreation", "InPossessionShape", "OutOfPossessionShape", "LineOfEngagement", "PassingStyle", "PressingIntensity", "PressingTrap" };
    static readonly string[] StatusFlags =
    {
        "NoTacticError", "NoUpcomingMatchError", "NoLineupWarning", "IncompleteLineupWarning", "PlayerBelowThresholdWarning",
        "MultiplePlayersBelowThresholdWarning", "PlayerNotFullyScoutedWarning", "PlayerNotInTeamWarning", "PlayerNotSelectedWarning",
    };

    // Les attributs changent peu : relus seulement quand la date de jeu change.
    string? _attrDate;
    readonly Dictionary<long, Dictionary<string, object>> _attrCache = new();

    public static bool GameLoaded() => Batch.Run(new[] { new Req(null, Team) }, 3000)[0] != null;

    // Date de jeu courante (yyyy-MM-dd), ou null si aucune partie n'est chargée.
    // Au menu (aucune partie), le jeu renvoie une date nulle (1900-01-01) : on l'ignore.
    public static string? CurrentDate()
    {
        if (!GameLoaded()) return null;
        var d = DecodeDate(Batch.Run(new[] { new Req(null, "game.CurrentGameDate") }, 3000)[0] as string);
        return d == null || d.StartsWith("1900") ? null : d;
    }

    public Snapshot Read()
    {
        var head = Batch.Run(new[]
        {
            new Req(null, Team + "/Name"), new Req(null, "game.CurrentGameDate"),
            new Req(null, Team + "/MostUsedFormation"), new Req(null, Squad + "/#count"),
        }, TimeoutMs);
        var club = CleanName(head[0] as string) ?? "";
        var date = DecodeDate(head[1] as string) ?? DateTime.Today.ToString("yyyy-MM-dd");
        int count = head[3] is double c ? (int)c : 0;

        var reqs = new List<Req>();
        for (int i = 0; i < count; i++)
        {
            foreach (var p in PlayerProps) reqs.Add(new Req(i, p));
            foreach (var (_, p) in PlayerExtras) reqs.Add(new Req(i, p));
            foreach (var (_, p) in PositionAbilities) reqs.Add(new Req(i, p));
        }
        var values = Batch.Run(reqs, TimeoutMs);
        var rows = new Dictionary<string, object?>[count];
        for (int i = 0; i < count; i++) rows[i] = new();
        for (int k = 0; k < reqs.Count; k++) rows[reqs[k].Item!.Value][reqs[k].Path] = values[k];

        if (_attrDate != date && ReadAttributes(count, rows)) _attrDate = date;

        var players = rows.Select(ToPlayer).Where(p => p != null).Cast<PlayerDto>().ToList();
        TacticDto? tactic = null; Dictionary<string, object?>? effectiveness = null;
        if (Plugin.ReadTactic)
        {
            try { tactic = ReadTactic(head[2] as string); }
            catch (Exception e) { Plugin.Log.LogWarning($"Tactique illisible : {e.Message}"); }
        }
        if (Plugin.ReadEffectiveness)
        {
            try { effectiveness = ReadEffectiveness(); }
            catch (Exception e) { Plugin.Log.LogWarning($"Efficacité tactique illisible : {e.Message}"); }
        }
        tactic ??= new TacticDto(head[2] as string, "MostUsedFormation", null, new(), new());

        // Club et prochain match : blocs optionnels
        Dictionary<string, object?>? clubInfo = null, nextMatch = null;
        try
        {
            var extra = ClubFields.Select(f => new Req(null, $"{Team}/Club/{f.Path}", f.Deep))
                .Concat(MatchFields.Select(f => new Req(null, $"{Team}/{f.Path}", f.Deep))).ToList();
            var ev = Batch.Run(extra, TimeoutMs);
            object? Clean(object? x) => x is string s ? CleanName(s) : x;
            clubInfo = ClubFields.Select((f, i) => (f.Key, V: Clean(ev[i]))).Where(x => x.V != null).ToDictionary(x => x.Key, x => x.V);
            nextMatch = MatchFields.Select((f, i) => (f.Key, V: Clean(ev[ClubFields.Length + i]))).Where(x => x.V != null).ToDictionary(x => x.Key, x => x.V);
        }
        catch (Exception e) { Plugin.Log.LogWarning($"Club / prochain match illisibles : {e.Message}"); }

        // Données supplémentaires définies dans archivix\config\chemins.json (relu à chaque instantané, sans recompiler)
        Dictionary<string, object?>? custom = null;
        try { custom = ReadCustom(count); }
        catch (Exception e) { Plugin.Log.LogWarning($"chemins.json : {e.Message}"); }

        return new Snapshot("archivix/1", "FM27", club, date, players, tactic)
        {
            Custom = custom,
            Effectiveness = effectiveness,
            ClubInfo = clubInfo is { Count: > 0 } ? clubInfo : null,
            NextMatch = nextMatch is { Count: > 0 } ? nextMatch : null,
        };
    }

    // --- Tactique active et efficacité tactique (blocs optionnels : null si le jeu ne répond pas) ---

    TacticDto ReadTactic(string? mostUsed)
    {
        var reqs = new List<Req>();
        int Add(string path, bool deep = false) { reqs.Add(new Req(null, path, deep)); return reqs.Count - 1; }

        int name = Add(Tactic + "Name"), fName = Add(Tactic + "FormationName"), fIP = Add(Tactic + "TacticCreatorIPFormation", true),
            fOOP = Add(Tactic + "TacticCreatorOOPFormation", true), ment = Add(Tactic + "MentalityString"), mentRaw = Add(Tactic + "Mentality"),
            style = Add(Tactic + "TacticalStyle", true), cx = Add(Tactic + "TacticComplexity", true), it = Add(Tactic + "TacticalIntensity", true),
            cxS = Add(Tactic + "TacticalStyleComplexityString"), itS = Add(Tactic + "TacticalStyleIntensityString"),
            slotName = Add(Tactic + "CurrentTacticSlotName"), s1 = Add(Tactic + "TacticSlot1Name"), s2 = Add(Tactic + "TacticSlot2Name"), s3 = Add(Tactic + "TacticSlot3Name"),
            ip = Add(Tactic + "InPossessionInstructionList", true), oop = Add(Tactic + "OutOfPossessionInstructionList", true),
            rec = Add(Tactic + "RecommendedFormations", true), recIP = Add(Tactic + "RecommendedIPFormations", true), recOOP = Add(Tactic + "RecommendedOOPFormations", true),
            // Les 11 postes (avec et sans ballon combinés) : liste de Records, convertie telle quelle
            combined = Add(Tactic + "TacticalPositionsCombined", true);
        // (TacticalPositions/#i n'a jamais répondu en jeu : 154 lectures en délai dépassé à chaque instantané, retirées en 0.2.1.)

        var v = Batch.Run(reqs, TimeoutMs);
        string? S(int k) => v[k] as string is { } s ? CleanName(s) : null;

        return new TacticDto(S(fName) ?? mostUsed, S(fName) != null ? "Tactic" : "MostUsedFormation", S(ment), new(), new())
        {
            Name = S(name), FormationIP = v[fIP], FormationOOP = v[fOOP], MentalityRaw = v[mentRaw], Style = v[style],
            Complexity = v[cx], Intensity = v[it], ComplexityLabel = S(cxS), IntensityLabel = S(itS),
            ActiveSlot = S(slotName), SlotNames = new[] { S(s1), S(s2), S(s3) },
            InPossessionInstructions = v[ip], OutOfPossessionInstructions = v[oop],
            Recommended = new Dictionary<string, object?> { ["all"] = v[rec], ["inPossession"] = v[recIP], ["outOfPossession"] = v[recOOP] },
            PositionsCombined = v[combined],
        };
    }

    // Efficacité tactique : désactivée par défaut (réglage LireEfficacite), le jeu ne répond pas encore à ces lectures.
    Dictionary<string, object?>? ReadEffectiveness()
    {
        var reqs = new List<Req>();
        int Add(string path, bool deep = false) { reqs.Add(new Req(null, path, deep)); return reqs.Count - 1; }

        // Efficacité : note globale, 4 composantes, zones de compréhension, sous-scores, alertes, conseils
        (int, int) Range(string p) => (Add(p + "/MinValue"), Add(p + "/MaxValue"));
        var overall = Range(TE + "/OverallEffectiveness");
        var comps = new[] { "TacticalUnderstanding", "PlayerAbility", "PlayerBuyIn", "NextMatchInformation" }
            .ToDictionary(c => c, c => Range($"{TE}/{c}/OverallEffectiveness"));
        var areas = UnderstandingAreas.ToDictionary(a => a, a => (Range($"{TE}/TacticalUnderstanding/{a}/OverallEffectiveness"), Range($"{TE}/TacticalUnderstanding/{a}")));
        var complexity = Range($"{TE}/TacticalUnderstanding/TacticalComplexity/OverallEffectiveness");
        var cxParts = new[] { "TeamInstructionComplexity", "PlayerInstructionComplexity", "OppositionInstructionComplexity" }
            .ToDictionary(c => c, c => Add($"{TE}/TacticalUnderstanding/TacticalComplexity/{c}", true));
        var comprehension = Range($"{TE}/TacticalUnderstanding/TacticalComprehension/OverallEffectiveness");
        var subs = new Dictionary<string, (int, int)>
        {
            ["capability"] = Range($"{TE}/PlayerAbility/CapabilityScore"),
            ["roleSuitability"] = Range($"{TE}/PlayerAbility/RoleSuitabilityScore"),
            ["managerSupport"] = Range($"{TE}/PlayerBuyIn/ManagerSupportScore"),
            ["relationships"] = Range($"{TE}/PlayerBuyIn/TeammateAndStaffRelationshipsScore"),
        };
        var flags = StatusFlags.ToDictionary(f => f, f => Add($"{TE}/StatusFlags/{f}"));
        int tePlayers = Add(TE + "/Players", true), advAreas = Add(TE + "/TacticalUnderstanding/AdviceForTacticalAreas", true),
            advAbility = Add(TE + "/PlayerAbility/AdviceForComponent", true), advBuyIn = Add(TE + "/PlayerBuyIn/AdviceForComponent", true),
            advNext = Add(TE + "/NextMatchInformation/AdviceForComponent", true);

        var v = Batch.Run(reqs, TimeoutMs);
        object? R((int min, int max) r) => Num(v[r.min]) is double a && Num(v[r.max]) is double b ? new Dictionary<string, object?> { ["min"] = a, ["max"] = b } : null;
        bool? B(int k) => v[k] is string s ? string.Equals(s, "True", StringComparison.OrdinalIgnoreCase) : null;

        var eff = new Dictionary<string, object?>
        {
            ["overall"] = R(overall),
            ["components"] = comps.ToDictionary(c => Camel(c.Key), c => R(c.Value)),
            ["understandingAreas"] = areas.ToDictionary(a => Camel(a.Key), a => R(a.Value.Item1) ?? R(a.Value.Item2)),
            ["complexity"] = R(complexity),
            ["complexityParts"] = cxParts.ToDictionary(c => Camel(c.Key), c => v[c.Value]),
            ["comprehension"] = R(comprehension),
            ["subScores"] = subs.ToDictionary(s => s.Key, s => R(s.Value)),
            ["statusFlags"] = flags.ToDictionary(f => Camel(f.Key), f => (object?)B(f.Value)),
            ["players"] = v[tePlayers],
            ["advice"] = new Dictionary<string, object?> { ["tacticalAreas"] = v[advAreas], ["playerAbility"] = v[advAbility], ["playerBuyIn"] = v[advBuyIn], ["nextMatch"] = v[advNext] },
        };
        bool anyEff = eff["overall"] != null || ((Dictionary<string, object?>)eff["components"]!).Values.Any(x => x != null);
        return anyEff ? eff : null;
    }

    static string Camel(string s) => char.ToLowerInvariant(s[0]) + s[1..];

    // --- Chemins configurables (mise à jour sans recompiler) ---
    // archivix\config\chemins.json : { "partie": {"clé":"chemin"}, "equipe": {…}, "club": {…}, "tactique": {…}, "joueur": {…}, "profond": ["clé", …] }
    // Racines : partie = game., equipe = équipe du club humain, club = son club, tactique = tactic., joueur = chaque joueur de l'effectif.
    // "profond" : clés dont la valeur composée (liste, objet) est convertie en JSON. Fichier absent = rien de plus.
    static string CustomFile => System.IO.Path.Combine(Plugin.DataDir, "config", "chemins.json");

    Dictionary<string, object?>? ReadCustom(int squadCount)
    {
        if (!System.IO.File.Exists(CustomFile)) return null;
        using var doc = System.Text.Json.JsonDocument.Parse(System.IO.File.ReadAllText(CustomFile));
        var root = doc.RootElement;
        var deep = root.TryGetProperty("profond", out var d) ? d.EnumerateArray().Select(x => x.GetString()).ToHashSet() : new HashSet<string?>();
        Dictionary<string, string> Section(string name) => root.TryGetProperty(name, out var s) && s.ValueKind == System.Text.Json.JsonValueKind.Object
            ? s.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "") : new();
        var prefixes = new Dictionary<string, string> { ["partie"] = "game.", ["equipe"] = Team + "/", ["club"] = Team + "/Club/", ["tactique"] = Tactic };

        var reqs = new List<Req>(); var keys = new List<(string Section, string Key, int? Item)>();
        foreach (var (section, prefix) in prefixes)
            foreach (var (key, path) in Section(section)) { reqs.Add(new Req(null, prefix + path, deep.Contains(key))); keys.Add((section, key, null)); }
        var perPlayer = Section("joueur");
        if (perPlayer.Count > 0) perPlayer.TryAdd("id", "UniqueId");   // pour relier chaque ligne au joueur (players[].id)
        for (int i = 0; i < squadCount; i++)
            foreach (var (key, path) in perPlayer) { reqs.Add(new Req(i, path, deep.Contains(key))); keys.Add(("joueur", key, i)); }
        if (reqs.Count == 0) return null;

        var v = Batch.Run(reqs, TimeoutMs);
        var result = new Dictionary<string, object?>();
        object? Clean(object? x) => x is string s ? CleanName(s) : x;
        for (int k = 0; k < keys.Count; k++)
        {
            var (section, key, item) = keys[k];
            if (item == null)
            {
                if (!result.TryGetValue(section, out var sec)) result[section] = sec = new Dictionary<string, object?>();
                ((Dictionary<string, object?>)sec!)[key] = Clean(v[k]);
            }
            else
            {
                if (!result.TryGetValue("joueurs", out var list)) result["joueurs"] = list = new Dictionary<string, Dictionary<string, object?>>();
                var byItem = (Dictionary<string, Dictionary<string, object?>>)list!;
                if (!byItem.TryGetValue(item.Value.ToString(), out var row)) byItem[item.Value.ToString()] = row = new();
                row[key] = Clean(v[k]);
            }
        }
        return result;
    }

    bool ReadAttributes(int count, Dictionary<string, object?>[] rows)
    {
        var reqs = new List<Req>();
        for (int i = 0; i < count; i++)
            foreach (var a in AttributeNames)
            {
                reqs.Add(new Req(i, $"Attribute{a}/AttributeMinValue"));
                reqs.Add(new Req(i, $"Attribute{a}/AttributeMaxValue"));
            }
        var values = Batch.Run(reqs, TimeoutMs * 2);
        if (values.All(v => v == null)) return false;

        _attrCache.Clear();
        for (int i = 0; i < count; i++)
        {
            if (Num(rows[i].GetValueOrDefault("UniqueId")) is not double id) continue;
            var attrs = new Dictionary<string, object>();
            for (int a = 0; a < AttributeNames.Length; a++)
            {
                int k = (i * AttributeNames.Length + a) * 2;
                // 0 = attribut non applicable au joueur (ex. attributs de gardien pour un joueur de champ)
                if (Num(values[k]) is double min && min > 0 && Num(values[k + 1]) is double max)
                    // Valeur exacte si le staff la connaît, sinon fourchette {min,max}
                    attrs[AttributeNames[a]] = min == max ? (int)min : new AttrRange((int)min, (int)max);
            }
            _attrCache[(long)id] = attrs;
        }
        return _attrCache.Count > 0;
    }

    PlayerDto? ToPlayer(Dictionary<string, object?> r)
    {
        if (Num(r.GetValueOrDefault("UniqueId")) is not double id) return null;
        string? S(string k) => r.GetValueOrDefault(k) as string;
        int? I(string k) => Num(r.GetValueOrDefault(k)) is double d ? (int)d : null;

        var wageText = S("FullContract/Wage/DisplayValue");
        var valueText = S("TransferValueRange/TransferValueRangeString");
        bool injured = string.Equals(S("CurrentInjury/IsActive"), "True", StringComparison.OrdinalIgnoreCase);
        // Valeur affichée en fourchette ("0 € - 2K €") : Value = borne haute
        var valueParts = (valueText ?? "").Split(" - ");
        long? valueMin = ParseMoney(valueParts[0]), valueMax = ParseMoney(valueParts[^1]);

        return new PlayerDto(
            (int)id, CleanName(S("Name")) ?? "", I("Age") ?? 0,
            (S("PositionCombinedString") ?? "").Split(", ", StringSplitOptions.RemoveEmptyEntries),
            S("Footedness/PreferredFootString"),
            null, null, I("Condition"), S("MoraleString") ?? S("Morale"),
            DecodeDate(S("FullContract/EndDate")), MonthlyWage(wageText), valueMax,
            S("FullContract/AgreedPlayingTime/DisplayValue"),
            I("ClubAppearancesThisSeason"), I("ClubGoalsThisSeason"),
            Num(r.GetValueOrDefault("ClubAverageRatingThisSeason")) is double avg ? Math.Round(avg, 2) : null,
            injured ? S("CurrentInjury/InjuryDescription") ?? "Blessé" : null,
            _attrCache.GetValueOrDefault((long)id))
        {
            PositionsText = S("PositionCombinedString"),
            PositionRatings = PositionAbilities.Select(x => (x.Fr, V: I(x.Path))).Where(x => x.V != null)
                .ToDictionary(x => x.Fr, x => x.V!.Value) is { Count: > 0 } pr ? pr : null,
            SquadNumber = I("SquadNumber"),
            Nationality = S("NationalityText"),
            BestPosition = S("BestPositionShortString"),
            Sharpness = I("Sharpness"),
            WageText = wageText,
            ValueText = valueText,
            ValueMin = valueMin,
            InjuryReturnDays = injured ? I("CurrentInjury/InjuryReturnDays") : null,
            Tracking = PlayerExtras.Select(x => (x.Key, V: r.GetValueOrDefault(x.Path) is string s ? (object?)(Num(s) ?? (object)CleanName(s)!) : r.GetValueOrDefault(x.Path)))
                .Where(x => x.V != null).ToDictionary(x => x.Key, x => x.V) is { Count: > 0 } t ? t : null,
        };
    }

    // --- Conversions ---

    static double? Num(object? v) => v switch
    {
        double d => d,
        string s when double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
        _ => null,
    };

    // Le jeu entoure les noms de balises : "\u0001<méta base64>\u0002Nom\u0001"
    static string? CleanName(string? s)
    {
        if (s == null) return null;
        var m = Regex.Match(s, "\u0002([^\u0001\u0002]*)\u0001\\s*$");
        return m.Success ? m.Groups[1].Value : s;
    }

    // GameDate { Data1 = N } : année = N >> 17, jour de l'année (1-366) = (N >> 8) & 0x1FF
    static string? DecodeDate(string? s)
    {
        if (s == null) return null;
        var m = Regex.Match(s, @"Data1 = (\d+)");
        if (!m.Success) return null;
        long d = long.Parse(m.Groups[1].Value);
        int year = (int)(d >> 17), doy = (int)((d >> 8) & 0x1FF);
        if (year < 1900 || doy < 1 || doy > 366) return null;
        return new DateTime(year, 1, 1).AddDays(doy - 1).ToString("yyyy-MM-dd");
    }

    // Salaire ramené au mois selon l'unité affichée par le jeu : p/m (mois), p/s (semaine), p/a (an)
    static long? MonthlyWage(string? s)
    {
        if (ParseMoney(s) is not long n) return null;
        if (s!.Contains("p/s") || s.Contains("p/w")) return (long)Math.Round(n * 52 / 12.0);
        if (s.Contains("p/a") || s.Contains("p/y")) return (long)Math.Round(n / 12.0);
        return n;
    }

    // "95 € p/m", "1,2 M €", "450 k €" → montant entier
    static long? ParseMoney(string? s)
    {
        if (string.IsNullOrEmpty(s)) return null;
        var m = Regex.Match(s, @"([\d\s  ]+(?:,\d+)?)\s*([kKM]?)");
        if (!m.Success) return null;
        var digits = Regex.Replace(m.Groups[1].Value, @"[\s  ]", "").Replace(',', '.');
        if (!double.TryParse(digits, NumberStyles.Float, CultureInfo.InvariantCulture, out var n)) return null;
        n *= m.Groups[2].Value switch { "k" or "K" => 1e3, "M" => 1e6, _ => 1 };
        return (long)n;
    }

    // --- Moteur de requêtes groupées ---

    // Item = index dans l'effectif (null = chemin absolu "game.…" ou "tactic.…"). "#count" = taille de la liste.
    // Segment "#N" = N-ième élément de la liste courante. Deep = valeur composée convertie en JSON (Record, liste).
    public sealed record Req(int? Item, string Path, bool Deep = false);

    static class Batch
    {
        static Il2CppSystem.Object? _owner;

        sealed class State
        {
            public TypedValue? Cur;
            public string[] Segs = Array.Empty<string>();
            public object? Result;
            public bool Failed;
            public bool Deep;
            public int Signalled;
        }

        // Résout chaque chemin niveau par niveau : toutes les requêtes d'un niveau partent dans la même frame.
        public static object?[] Run(IReadOnlyList<Req> reqs, int timeoutMs)
        {
            var states = reqs.Select(r => new State { Deep = r.Deep }).ToArray();
            TypedValue? squad = null, team = null;
            bool needSquad = reqs.Any(r => r.Item != null || r.Path.StartsWith(Squad));
            bool needTactic = reqs.Any(r => r.Path.StartsWith(Tactic));

            if (needSquad)
            {
                var s = new State { Segs = new[] { "GameCurrentManagerClubTeam", "Club", "Squad" } };
                Resolve(new[] { s }, () => Root(), timeoutMs);
                squad = s.Cur;
            }
            if (needTactic)
            {
                var t = new State { Segs = new[] { "GameCurrentManagerClubTeam" } };
                Resolve(new[] { t }, () => Root(), timeoutMs);
                team = t.Cur;
            }

            MainThread.Run(() =>
            {
                for (int k = 0; k < reqs.Count; k++)
                {
                    var r = reqs[k]; var st = states[k];
                    if (r.Path == Squad + "/#count") { st.Result = (double?)Count(squad); st.Failed = true; continue; }
                    if (r.Item != null)
                    {
                        var el = ItemAt(squad, r.Item.Value);
                        if (el == null) { st.Failed = true; continue; }
                        st.Cur = el;
                        st.Segs = r.Path.Split('/');
                    }
                    else if (r.Path.StartsWith(Tactic))
                    {
                        var tr = TacticRoot(team);
                        if (tr == null) { st.Failed = true; continue; }
                        st.Cur = tr;
                        st.Segs = r.Path.Substring(Tactic.Length).Split('/');
                    }
                    else
                    {
                        st.Cur = Root();
                        st.Segs = r.Path.Substring("game.".Length).Split('/');
                    }
                }
                return 0;
            }).Wait();

            Resolve(states.Where(s => !s.Failed).ToArray(), null, timeoutMs);
            return states.Select(s => s.Result).ToArray();
        }

        static TypedValue Root()
        {
            var r = TypedValue.GetReferenceTypedValue();
            r.SetValue(FM.UI.GameReference.GetInstance() ?? new FM.UI.GameReference());
            return r;
        }

        // Référence de tactique de l'équipe du club humain (type Team + index), construite comme le fait l'écran Tactiques.
        static TypedValue? TacticRoot(TypedValue? team)
        {
            var dr = team?.TryCast<ReferenceTypedValue>()?.Value?.TryCast<FM.UI.DatabaseRecordReference>();
            if (dr == null) return null;
            var t = new FM.UI.TeamTacticReference();
            t.m_type = dr.Type;
            t.m_index = dr.m_index;
            t.m_is_full_tactic = true;
            t.SetCombinedIndexAndType(dr.CombinedIndexAndType);
            var r = TypedValue.GetReferenceTypedValue();
            r.SetValue(t);
            return r;
        }

        static void Resolve(State[] states, Func<TypedValue>? root, int timeoutMs)
        {
            int depth = states.Length == 0 ? 0 : states.Max(s => s.Segs.Length);
            for (int level = 0; level < depth; level++)
            {
                var active = states.Where(s => !s.Failed && s.Segs.Length > level).ToArray();
                if (active.Length == 0) break;
                using var done = new CountdownEvent(active.Length);
                foreach (var s in active) s.Signalled = 0;
                int lvl = level;
                MainThread.Enqueue(() =>
                {
                    var b = GameSubsystems.Get<BindingSubsystem>();
                    _owner ??= new Il2CppSystem.Object();
                    foreach (var s in active)
                    {
                        var st = s;
                        var src = st.Cur ?? root?.Invoke() ?? TypedValue.Null;
                        bool last = lvl == st.Segs.Length - 1;
                        if (st.Segs[lvl].StartsWith('#'))   // élément de liste : pas de requête au jeu
                        {
                            var el = int.TryParse(st.Segs[lvl].AsSpan(1), out var n) ? ItemAt(src, n) : null;
                            if (el == null) st.Failed = true;
                            else { st.Cur = TypedValue.CreateCopyFrom(el); if (last) st.Result = st.Deep ? Dump(el, 3) : Simple(el); }
                            if (Interlocked.Exchange(ref st.Signalled, 1) == 0) done.Signal();
                            continue;
                        }
                        Bindings.ValueChangedCallback? cb = null;
                        cb = (Action<Bindings.Key, TypedValue>)((k, v) =>
                        {
                            if (Interlocked.Exchange(ref st.Signalled, 1) != 0) return;
                            if (v == null || v.IsNull) { st.Failed = true; st.Cur = null; }
                            else if (last) { st.Result = st.Deep ? Dump(v, 3) : Simple(v); st.Cur = TypedValue.CreateCopyFrom(v); }
                            else st.Cur = TypedValue.CreateCopyFrom(v);
                            var key = k;
                            MainThread.Enqueue(() => { try { b.Unbind(ref key, cb!); } catch { } });
                            try { done.Signal(); } catch (ObjectDisposedException) { }
                        });
                        try { BindingUtils.Request(b, src, st.Segs[lvl], _owner, cb); }
                        catch { if (Interlocked.Exchange(ref st.Signalled, 1) == 0) { st.Failed = true; done.Signal(); } }
                    }
                });
                done.Wait(timeoutMs);
                foreach (var s in active)
                    if (Interlocked.Exchange(ref s.Signalled, 1) == 0) s.Failed = true;   // timeout
            }
        }

        // Valeur IL2CPP → valeur managée (double, string) ; lue dans le callback, sur le thread principal.
        static object? Simple(TypedValue v)
        {
            var n = v.TryCast<NumericTypedValue>();
            if (n != null) try { return n.Value.GetDouble(); } catch { }
            try { return v.AsString(); } catch { return null; }
        }

        // Valeur composée → objets managés sérialisables : Record → dictionnaire (noms de propriétés), liste → tableau (40 max),
        // référence → "Type#index", sinon nombre ou texte. Profondeur limitée.
        static object? Dump(TypedValue? v, int depth)
        {
            if (v == null || v.IsNull) return null;
            var n = v.TryCast<NumericTypedValue>();
            if (n != null) try { return n.Value.GetDouble(); } catch { }
            var o = v.TryCast<ReferenceTypedValue>()?.Value;
            if (o != null && depth > 0)
            {
                var rec = o.TryCast<Record>();
                if (rec != null)
                {
                    var d = new Dictionary<string, object?>();
                    foreach (var kv in rec) d[Probe.PropName(kv.Key)] = Dump(kv.Value, depth - 1);
                    return d;
                }
                var list = o.TryCast<Il2CppSystem.Collections.IList>();
                if (list != null)
                {
                    var res = new List<object?>();
                    for (int i = 0; i < Math.Min(Count(v) ?? 0, 40); i++) res.Add(Dump(list[i]?.TryCast<TypedValue>(), depth - 1));
                    return res;
                }
                var dr = o.TryCast<FM.UI.DatabaseRecordReference>();
                if (dr != null) return $"{dr.Type}#{dr.m_index}";
            }
            try { var s = v.AsString(); return s == null ? null : CleanName(s); } catch { return null; }
        }

        static int? Count(TypedValue? list) =>
            list?.TryCast<ReferenceTypedValue>()?.Value?.TryCast<Il2CppSystem.Collections.ICollection>()?.Count;

        static TypedValue? ItemAt(TypedValue? list, int i)
        {
            var o = list?.TryCast<ReferenceTypedValue>()?.Value;
            var l = o?.TryCast<Il2CppSystem.Collections.IList>();
            if (l == null || i >= (Count(list) ?? 0)) return null;
            return l[i]?.TryCast<TypedValue>();
        }
    }
}
