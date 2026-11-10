// Modèle de compilation : signatures seulement, aucun code du jeu (voir ../Directory.Build.props).
using System;
using SI.Bindable.Reference.Core;

namespace SI.Interop
{
    public class InteropReference : Il2CppSystem.Object
    {
        public InteropReference(IntPtr pointer) : base(pointer) { }
        public InteropReference() : base(IntPtr.Zero) => throw null;
        public ReferenceID ID => throw null;
    }
}
