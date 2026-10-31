extern alias UnityCore;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Il2CppInterop.Runtime.InteropTypes.Arrays;
using SI.Bindable;
using SI.Bindable.Reference.Core;
using SI.Core;
using SI.Interop;

namespace Archivix;

// Exécute du code IL2CPP sur le thread principal Unity (les bindings du jeu l'exigent).
public class MainThread : UnityCore::UnityEngine.MonoBehaviour
{
    public MainThread(IntPtr p) : base(p) { }
    static readonly ConcurrentQueue<Action> Jobs = new();

    public static void Enqueue(Action a) => Jobs.Enqueue(a);

    public static Task<T> Run<T>(Func<T> f)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        Jobs.Enqueue(() => { try { tcs.SetResult(f()); } catch (Exception e) { tcs.SetException(e); } });
        return tcs.Task;
    }

    void Update()
    {
        while (Jobs.TryDequeue(out var a))
            try { a(); } catch (Exception e) { Plugin.Log.LogError(e); }
    }
}

// Sonde en lecture seule : interroge le système de bindings comme le fait l'interface du jeu.
static class Probe
{
    const int TimeoutMs = 5000;
    static Il2CppSystem.Object? _owner;

    // GET /api/probe?path=…[&item=N[&prop=…]]
    public static object Path(string path, int? item, string? prop)
    {
        var v = FetchPath(path);
        if (v == null) return new { path, timeout = true };
        if (item == null) return Run(() => Describe(v));

        var element = Run(() => ItemAt(v, item.Value));
        if (element == null) return new { path, item, error = "élément introuvable" };
        if (prop == null) return Run(() => element.TryCast<TypedValue>() is { } tv ? Describe(tv) : DescribeObject(element));

        var pv = FetchPath(prop, element.TryCast<TypedValue>() ?? Run(() => Wrap(element)));
        return pv == null ? new { path, item, prop, timeout = true } : Run(() => Describe(pv));
    }

    // Propriétés lues pour chaque joueur ("a/b" = propriété b de la valeur a)
    static readonly string[] SquadProps =
    {
        "UniqueId", "Name", "Age", "DateOfBirth", "PositionCombinedString", "NaturalPositionShortString", "Footedness",
        "PlayerCurrentAbility", "PlayerPotentialAbility", "Condition", "Sharpness", "Morale", "MoraleString",
        "FullContract/EndDate", "FullContract/Wage", "FullContract/AgreedPlayingTime", "TransferValueRange",
        "Appearances", "Goals", "AverageRating", "CurrentInjury", "AttributeFinishing",
    };

    // GET /api/squad?max=N[&path=…][&props=a,b/c] : effectif du club humain, valeurs brutes de chaque propriété
    public static object Squad(int max, string? path, string? props)
    {
        path ??= "game.GameCurrentManagerClubTeam/TeamSquad";
        var squad = FetchPath(path);
        if (squad == null) return new { error = $"{path} : timeout" };
        var squadInfo = Run(() => Describe(squad));
        // Un Record (Dictionary<PropertyID, TypedValue>) : la liste des joueurs est l'une de ses valeurs.
        squad = Run(() => FirstCollection(squad)) ?? squad;
        var count = Run(() => squad.TryCast<ReferenceTypedValue>()?.Value?.TryCast<Il2CppSystem.Collections.ICollection>()?.Count);
        if (count == null) return new { error = "aucune collection trouvée", squad = squadInfo };
        var propList = props?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) ?? SquadProps;

        var players = new List<object>();
        for (int i = 0; i < Math.Min(count.Value, max); i++)
        {
            int idx = i;
            var el = Run(() => ItemAt(squad, idx));
            if (el == null) continue;
            var src = el.TryCast<TypedValue>() ?? Run(() => Wrap(el));
            var row = new Dictionary<string, object?> { ["_element"] = Run(() => $"{el.GetIl2CppType().FullName}: {SafeToString(el)}") };
            foreach (var p in propList)
            {
                var v = FetchPath(p, src);
                row[p] = v == null ? "timeout" : Run(() => Brief(v));
            }
            players.Add(row);
        }
        return new { count, squad = squadInfo, players };
    }

    static TypedValue? FirstCollection(TypedValue v)
    {
        var rec = v.TryCast<ReferenceTypedValue>()?.Value?.TryCast<Record>();
        if (rec == null) return null;
        foreach (var kv in rec)
            if ((kv.Value?.TryCast<ReferenceTypedValue>()?.Value?.TryCast<Il2CppSystem.Collections.ICollection>()?.Count ?? 0) > 0)
                return kv.Value;
        return null;
    }

    internal static string PropName(uint id) => PropertyIdentifierSet.Instance.GetInfo(id)?.Name ?? id.ToString();

    // "game.X/Y/Z" : X est une propriété de FM.UI.GameReference ; chaque "/" relance une requête depuis la valeur obtenue.
    static TypedValue? FetchPath(string path, TypedValue? source = null)
    {
        if (path.StartsWith("game.", StringComparison.Ordinal))
        {
            path = path.Substring(5);
            source = Run(() => Wrap(FM.UI.GameReference.GetInstance() ?? new FM.UI.GameReference()));
        }
        else if (path.StartsWith("tactic.", StringComparison.Ordinal) || path.StartsWith("matchtactic.", StringComparison.Ordinal))
        {
            // Référence de tactique construite sur l'équipe du club humain (type Team + index), comme le fait l'écran Tactiques.
            bool match = path[0] == 'm';
            path = path.Substring(path.IndexOf('.') + 1);
            var team = FetchPath("game.GameCurrentManagerClubTeam");
            if (team == null) return null;
            source = Run(() =>
            {
                var dr = team.TryCast<ReferenceTypedValue>()!.Value.TryCast<FM.UI.DatabaseRecordReference>()!;
                FM.UI.TacticReference t = match ? new FM.UI.MatchTacticReference() : new FM.UI.TeamTacticReference();
                t.m_type = dr.Type;
                t.m_index = dr.m_index;
                t.m_is_full_tactic = true;
                t.SetCombinedIndexAndType(dr.CombinedIndexAndType);
                return Wrap(t);
            });
        }
        var v = source;
        foreach (var seg in path.Split('/'))
        {
            var src = v;
            v = Fetch(() => src ?? TypedValue.Null, seg);
            if (v == null) return null;
        }
        return v;
    }

    static object Brief(TypedValue v)
    {
        if (v.IsNull) return null!;
        string? s = null; try { s = v.AsString(); } catch { }
        double? num = null;
        var n = v.TryCast<NumericTypedValue>();
        if (n != null) try { num = n.Value.GetDouble(); } catch { }
        string? obj = null;
        var r = v.TryCast<ReferenceTypedValue>();
        if (r?.Value != null) obj = $"{r.Value.GetIl2CppType().FullName}: {SafeToString(r.Value)}";
        return new { s, num, obj, type = v.DataType?.Name };
    }

    // GET /api/properties?q=… : catalogue global des propriétés (nom → id)
    public static object Properties(string q) => Run(() =>
    {
        var res = new List<object>();
        foreach (var kv in PropertyIdentifierSet.Instance.m_idToInfo)
            if (kv.Value.Name.Contains(q, StringComparison.OrdinalIgnoreCase))
                res.Add(new { id = kv.Key, name = kv.Value.Name });
        return (object)res.OrderBy(r => ((dynamic)r).name).ToList();
    });

    // GET /api/refprops?type=PersonReference : propriétés acceptées par un type de référence
    public static object RefProps(string type)
    {
        var t = AppDomain.CurrentDomain.GetAssemblies()
            .SelectMany(a => { try { return a.GetTypes(); } catch { return Array.Empty<Type>(); } })
            .FirstOrDefault(x => x.Name == type && x.GetMethod("GetPropertiesInternal", BindingFlags.Public | BindingFlags.Static) != null);
        if (t == null) return new { type, error = "type introuvable" };
        return Run(() =>
        {
            var list = new Il2CppSystem.Collections.Generic.List<PropertyID>();
            t.GetMethod("GetPropertiesInternal", BindingFlags.Public | BindingFlags.Static)!.Invoke(null, new object[] { list });
            var names = new List<string>();
            foreach (var pid in list)
                names.Add(PropertyIdentifierSet.Instance.GetInfo(pid.id)?.Name ?? pid.id.ToString());
            names.Sort(StringComparer.Ordinal);
            return (object)new { type = t.FullName, count = names.Count, properties = names };
        });
    }

    static T Run<T>(Func<T> f) => MainThread.Run(f).GetAwaiter().GetResult();

    // Lance une requête de binding et attend la première valeur (copiée, car les TypedValue sont recyclées).
    static TypedValue? Fetch(Func<TypedValue> source, string path)
    {
        var tcs = new TaskCompletionSource<TypedValue?>(TaskCreationOptions.RunContinuationsAsynchronously);
        MainThread.Enqueue(() =>
        {
            var b = GameSubsystems.Get<BindingSubsystem>();
            _owner ??= new Il2CppSystem.Object();
            Bindings.ValueChangedCallback? cb = null;
            cb = (Action<Bindings.Key, TypedValue>)((k, v) =>
            {
                if (!tcs.TrySetResult(v == null ? null : TypedValue.CreateCopyFrom(v))) return;
                var key = k;
                MainThread.Enqueue(() => { try { b.Unbind(ref key, cb!); } catch { } });
            });
            BindingUtils.Request(b, source(), path, _owner, cb);
        });
        return tcs.Task.Wait(TimeoutMs) ? tcs.Task.Result : null;
    }

    static TypedValue Wrap(Il2CppSystem.Object o)
    {
        var r = TypedValue.GetReferenceTypedValue();
        r.SetValue(o);
        return r;
    }

    static object Describe(TypedValue v)
    {
        if (v.IsNull) return new { isNull = true };
        string? s = null; try { s = v.AsString(); } catch { }
        double? num = null;
        var n = v.TryCast<NumericTypedValue>();
        if (n != null) try { num = n.Value.GetDouble(); } catch { }
        object? inner = null;
        var r = v.TryCast<ReferenceTypedValue>();
        if (r?.Value != null) inner = DescribeObject(r.Value);
        return new { dataType = v.DataType?.FullName, valueClass = v.GetIl2CppType().FullName, asString = s, number = num, value = inner };
    }

    static object DescribeObject(Il2CppSystem.Object o)
    {
        var t = o.GetIl2CppType();
        int? count = null;
        try { count = o.TryCast<Il2CppSystem.Collections.ICollection>()?.Count; } catch { }

        string? reference = null; int? index = null; string? table = null;
        var ir = o.TryCast<InteropReference>();
        if (ir != null) try { reference = ir.ID.GetInfo()?.Name; } catch { }
        var dr = o.TryCast<FM.UI.DatabaseRecordReference>();
        if (dr != null) { index = dr.m_index; table = dr.Type.ToString(); }

        var items = new List<string>();
        if (count > 0)
            for (int i = 0; i < Math.Min(count.Value, 5); i++)
            {
                var it = ItemAt(o, i);
                items.Add(it == null ? "null" : $"{it.GetIl2CppType().FullName}: {SafeToString(it)}");
            }

        Dictionary<string, object?>? entries = null;
        var rec = o.TryCast<Record>();
        if (rec != null)
        {
            entries = new();
            foreach (var kv in rec)
                entries[PropName(kv.Key)] = kv.Value == null ? null : Brief(kv.Value);
        }

        var props = t.GetProperties().Select(p => $"{p.PropertyType?.Name} {p.Name}").Take(60).ToList();
        return new { type = t.FullName, reference, table, index, count, entries, firstItems = items, toString = SafeToString(o), properties = props };
    }

    static Il2CppSystem.Object? ItemAt(TypedValue v, int i)
    {
        var r = v.TryCast<ReferenceTypedValue>();
        return r?.Value == null ? null : ItemAt(r.Value, i);
    }

    static Il2CppSystem.Object? ItemAt(Il2CppSystem.Object o, int i)
    {
        var list = o.TryCast<Il2CppSystem.Collections.IList>();
        var col = o.TryCast<Il2CppSystem.Collections.ICollection>();
        return list != null && col != null && i < col.Count ? list[i] : null;
    }

    static string? SafeToString(Il2CppSystem.Object o) { try { return o.ToString(); } catch { return null; } }
}
