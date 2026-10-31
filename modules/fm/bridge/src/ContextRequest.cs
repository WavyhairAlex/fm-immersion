using System;
using SI.Bindable;
using SI.Core;

namespace Archivix;

// Requête avec contexte : certaines propriétés du jeu (joueur à un poste, rôle personnalisé…) ne répondent
// que si l'on précise le contexte (ex. TeamSelectionIndex = 3). Sans contexte, elles ne répondent jamais.
static class ContextRequest
{
    // Segment de chemin "Propriete{Contexte=valeur}" → (propriété, contexte, valeur) ; null si pas de contexte.
    public static (string Prop, string Ctx, double Value)? Parse(string seg)
    {
        int open = seg.IndexOf('{');
        if (open < 0 || !seg.EndsWith('}')) return null;
        var inner = seg[(open + 1)..^1];
        int eq = inner.IndexOf('=');
        if (eq <= 0) return null;
        if (!double.TryParse(inner[(eq + 1)..], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v)) return null;
        return (seg[..open], inner[..eq], v);
    }

    // Valeur de contexte : entier si possible (index de sélection, de poste…), sinon réel.
    public static TypedValue Number(double v) =>
        v == Math.Floor(v) && Math.Abs(v) <= int.MaxValue ? TypedValue.Create((int)v) : TypedValue.Create(v);

    // Lance la requête (thread principal) ; renvoie la clé pour pouvoir la désinscrire.
    public static Bindings.Key Bind(Bindings b, TypedValue src, string prop, string ctx, double value,
        Il2CppSystem.Object owner, Bindings.ValueChangedCallback cb)
    {
        var rb = BindingUtils.BuildRequest(b, src);
        rb = rb.AddContext(Il2CppSystem.MemoryExtensions.AsSpan(ctx), Number(value));
        return rb.Bind(Il2CppSystem.MemoryExtensions.AsSpan(prop), owner, cb);
    }
}
