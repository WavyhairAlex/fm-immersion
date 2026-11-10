// Modèle de compilation : signatures seulement, aucun code du jeu (voir ../Directory.Build.props).
using System;

namespace SI.Core
{
    public class TypedValue : Il2CppSystem.Object
    {
        public TypedValue(IntPtr pointer) : base(pointer) { }
        public static TypedValue Null => throw null;
        public bool IsNull => throw null;
        public Il2CppSystem.Type DataType => throw null;
        public string AsString() => throw null;
        public static TypedValue Create(bool value) => throw null;
        public static TypedValue Create(double value) => throw null;
        public static TypedValue Create(int value) => throw null;
        public static TypedValue CreateCopyFrom(TypedValue other) => throw null;
        public static ReferenceTypedValue GetReferenceTypedValue() => throw null;
    }

    public class TypedValue<TVal> : TypedValue
    {
        public TypedValue(IntPtr pointer) : base(pointer) { }
        public TVal Value => throw null;
        public void SetValue(TVal value) => throw null;
    }

    public sealed class ReferenceTypedValue : TypedValue<Il2CppSystem.Object>
    {
        public ReferenceTypedValue(IntPtr pointer) : base(pointer) { }
    }

    public sealed class NumericTypedValue : TypedValue<DynamicNumber>
    {
        public NumericTypedValue(IntPtr pointer) : base(pointer) { }
    }

    public struct DynamicNumber
    {
        private ulong m_value;
        private int m_kind;
        public double GetDouble() => throw null;
    }

    public class Record : Il2CppSystem.Collections.Generic.Dictionary<uint, TypedValue>
    {
        public Record(IntPtr pointer) : base(pointer) { }
    }

    public static class GameSubsystems
    {
        public static T Get<T>() => throw null;
    }
}
