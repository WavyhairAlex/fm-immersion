// Modèle de compilation : signatures seulement, aucun code du jeu (voir ../Directory.Build.props).
using System;
using Il2CppSystem.Collections.Generic;

namespace SI.Bindable.Reference.Core
{
    public struct PropertyID
    {
        public uint id;
    }

    public struct ContextID
    {
        public uint id;
    }

    public struct ReferenceID
    {
        public uint id;
        public ReferenceIDInfo GetInfo() => throw null;
    }

    public class IdentifierInfo : Il2CppSystem.Object
    {
        public IdentifierInfo(IntPtr pointer) : base(pointer) { }
        public string Name => throw null;
    }

    public class IdentifierInfo<TIdentifier> : IdentifierInfo
    {
        public IdentifierInfo(IntPtr pointer) : base(pointer) { }
    }

    public class PropertyIDInfo : IdentifierInfo<PropertyID>
    {
        public PropertyIDInfo(IntPtr pointer) : base(pointer) { }
    }

    public class ContextIDInfo : IdentifierInfo<ContextID>
    {
        public ContextIDInfo(IntPtr pointer) : base(pointer) { }
    }

    public class ReferenceIDInfo : IdentifierInfo<ReferenceID>
    {
        public ReferenceIDInfo(IntPtr pointer) : base(pointer) { }
    }

    public class IdentifierSet<TDerived, TIdentifier, TIdentifierInfo> : Il2CppSystem.Object where TDerived : new()
    {
        public IdentifierSet(IntPtr pointer) : base(pointer) { }
        public static TDerived Instance => throw null;
        public Dictionary<uint, TIdentifierInfo> m_idToInfo => throw null;
        public TIdentifierInfo GetInfo(uint id) => throw null;
    }

    public class PropertyIdentifierSet : IdentifierSet<PropertyIdentifierSet, PropertyID, PropertyIDInfo>
    {
        public PropertyIdentifierSet(IntPtr pointer) : base(pointer) { }
        public PropertyIdentifierSet() : base(IntPtr.Zero) => throw null;
    }

    public class ContextIdentifierSet : IdentifierSet<ContextIdentifierSet, ContextID, ContextIDInfo>
    {
        public ContextIdentifierSet(IntPtr pointer) : base(pointer) { }
        public ContextIdentifierSet() : base(IntPtr.Zero) => throw null;
    }
}
