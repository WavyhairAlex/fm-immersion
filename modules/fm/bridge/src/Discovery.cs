using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using SI.Bindable.Reference.Core;

namespace Archivix;

// Rapport de découverte (archivix\config\decouverte.json) : pour quelques types de référence du jeu, les propriétés
// acceptées et, pour chacune, les contextes qu'elle exige. Lecture des tables statiques de l'interface uniquement :
// aucune requête au jeu, aucun effet sur la partie. Sert à choisir les chemins de chemins.json sans tâtonner en jeu.
static class Discovery
{
    static readonly string[] Types =
    {
        "GameReference", "TeamReference", "ClubReference", "PersonReference", "TeamTacticReference", "MatchTacticReference",
        "TacticsPositionReference", "TacticsTeamSelectionReference", "TacticsTeamSelectionIndexReference",
        "TacticsTeamSelectionTableReference", "FixtureLineupReference",
    };

    public static void Write(string dataDir)
    {
        var report = MainThread.Run(Build).GetAwaiter().GetResult();
        var dir = Path.Combine(dataDir, "config");
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "decouverte.json"),
            JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }), new System.Text.UTF8Encoding(false));
    }

    static object Build()
    {
        var all = AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(a => { try { return a.GetTypes(); } catch { return Array.Empty<Type>(); } })
            .Where(t => t.Namespace == "FM.UI").ToList();
        var types = new Dictionary<string, object>();
        foreach (var name in Types)
        {
            var t = all.FirstOrDefault(x => x.Name == name);
            var props = t?.GetMethod("GetPropertiesInternal", BindingFlags.Public | BindingFlags.Static);
            var ctxs = t?.GetMethod("GetContextsInternal", BindingFlags.Public | BindingFlags.Static);
            if (props == null) { types[name] = "introuvable"; continue; }
            var list = new Il2CppSystem.Collections.Generic.List<PropertyID>();
            props.Invoke(null, new object[] { list });
            var entries = new SortedDictionary<string, object?>(StringComparer.Ordinal);
            foreach (var pid in list)
            {
                var pname = PropertyIdentifierSet.Instance.GetInfo(pid.id)?.Name ?? pid.id.ToString();
                List<string>? needed = null;
                if (ctxs != null)
                    try
                    {
                        var cl = new Il2CppSystem.Collections.Generic.List<ContextID>();
                        ctxs.Invoke(null, new object[] { pid.id, cl });
                        foreach (var c in cl) (needed ??= new()).Add(ContextIdentifierSet.Instance.GetInfo(c.id)?.Name ?? c.id.ToString());
                    }
                    catch { }
                entries[pname] = needed;   // null = pas de contexte requis
            }
            types[name] = entries;
        }
        var contexts = new List<string>();
        foreach (var kv in ContextIdentifierSet.Instance.m_idToInfo) contexts.Add(kv.Value.Name);
        contexts.Sort(StringComparer.Ordinal);
        return new { schema = "archivix-decouverte/1", plugin = Plugin.Version, types, contexts };
    }
}
