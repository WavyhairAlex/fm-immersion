using System;
using System.Collections.Generic;
using System.Globalization;
using SI.Bindable;
using SI.Core;

namespace Archivix;

// Requête avec contexte : certaines propriétés du jeu (joueur à un poste, moral, rôle personnalisé…) ne répondent
// que si l'on précise le contexte. Sans contexte, elles ne répondent jamais. Les contextes requis par chaque
// propriété sont listés dans archivix\config\decouverte.json.
//
// Syntaxe d'un segment de chemin : "Propriete{Contexte=valeur,Autre=valeur}", où valeur est un nombre,
// true/false, ou une référence : @team (équipe du club humain), @human (manager humain), @person (joueur courant de l'effectif).
static class ContextRequest
{
    public sealed record Ctx(string Name, double? Number, string? Ref, bool? Bool = null);

    public static (string Prop, List<Ctx> Ctxs)? Parse(string seg)
    {
        int open = seg.IndexOf('{');
        if (open < 0 || !seg.EndsWith('}')) return null;
        var list = new List<Ctx>();
        foreach (var part in seg[(open + 1)..^1].Split(','))
        {
            int eq = part.IndexOf('=');
            if (eq <= 0) return null;
            var name = part[..eq].Trim();
            var val = part[(eq + 1)..].Trim();
            if (val.StartsWith('@')) list.Add(new Ctx(name, null, val[1..]));
            else if (bool.TryParse(val, out var bv)) list.Add(new Ctx(name, null, null, bv));
            else if (double.TryParse(val, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) list.Add(new Ctx(name, v, null));
            else return null;
        }
        return list.Count == 0 ? null : (seg[..open], list);
    }

    // Valeur de contexte numérique : entier si possible (index de sélection, de poste…), sinon réel.
    public static TypedValue Number(double v) =>
        v == Math.Floor(v) && Math.Abs(v) <= int.MaxValue ? TypedValue.Create((int)v) : TypedValue.Create(v);

    // Lance la requête (thread principal) ; refs résout @team / @human / @person. null si une référence manque.
    public static Bindings.Key? Bind(Bindings b, TypedValue src, string prop, List<Ctx> ctxs, Func<string, TypedValue?> refs,
        Il2CppSystem.Object owner, Bindings.ValueChangedCallback cb)
    {
        var rb = BindingUtils.BuildRequest(b, src);
        foreach (var c in ctxs)
        {
            var value = c.Ref != null ? refs(c.Ref) : c.Bool is bool bo ? TypedValue.Create(bo) : Number(c.Number!.Value);
            if (value == null) return null;
            rb = rb.AddContext(Il2CppSystem.MemoryExtensions.AsSpan(c.Name), value);
        }
        return rb.Bind(Il2CppSystem.MemoryExtensions.AsSpan(prop), owner, cb);
    }
}
