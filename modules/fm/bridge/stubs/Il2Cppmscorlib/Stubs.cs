// Modèle de compilation : signatures seulement, aucun code du jeu (voir ../Directory.Build.props).
using System;
using Il2CppInterop.Runtime.InteropTypes;
using Il2CppInterop.Runtime.InteropTypes.Arrays;

namespace Il2CppSystem
{
    public class Object : Il2CppObjectBase
    {
        public Object(IntPtr pointer) : base(pointer) { }
        public Object() : base(IntPtr.Zero) => throw null;
        public Type GetIl2CppType() => throw null;
        public new virtual string ToString() => throw null;
    }

    public class ValueType : Object
    {
        public ValueType(IntPtr pointer) : base(pointer) { }
    }

    public class Delegate : Object
    {
        public Delegate(IntPtr pointer) : base(pointer) { }
        public static bool operator ==(Delegate d1, Delegate d2) => throw null;
        public static bool operator !=(Delegate d1, Delegate d2) => throw null;
        public override bool Equals(object obj) => throw null;
        public override int GetHashCode() => throw null;
    }

    public class MulticastDelegate : Delegate
    {
        public MulticastDelegate(IntPtr pointer) : base(pointer) { }
    }

    public class Type : Reflection.MemberInfo
    {
        public Type(IntPtr pointer) : base(pointer) { }
        public virtual string FullName => throw null;
        public Il2CppReferenceArray<Reflection.PropertyInfo> GetProperties() => throw null;
    }

    public sealed class ReadOnlySpan<T> : ValueType
    {
        public ReadOnlySpan(IntPtr pointer) : base(pointer) { }
    }

    public static class MemoryExtensions
    {
        public static ReadOnlySpan<char> AsSpan(string text) => throw null;
    }
}

namespace Il2CppSystem.Reflection
{
    public class MemberInfo : Object
    {
        public MemberInfo(IntPtr pointer) : base(pointer) { }
        public virtual string Name => throw null;
    }

    public class PropertyInfo : MemberInfo
    {
        public PropertyInfo(IntPtr pointer) : base(pointer) { }
        public virtual Type PropertyType => throw null;
    }
}

namespace Il2CppSystem.Collections
{
    public class ICollection : Il2CppObjectBase
    {
        public ICollection(IntPtr pointer) : base(pointer) { }
        public int Count => throw null;
    }

    public class IList : Il2CppObjectBase
    {
        public IList(IntPtr pointer) : base(pointer) { }
        public Object this[int index] { get => throw null; set => throw null; }
    }
}

namespace Il2CppSystem.Collections.Generic
{
    public class List<T> : Object
    {
        public List(IntPtr pointer) : base(pointer) { }
        public List() : base(IntPtr.Zero) => throw null;
        public Enumerator GetEnumerator() => throw null;

        public sealed class Enumerator : ValueType
        {
            public Enumerator(IntPtr pointer) : base(pointer) { }
            public bool MoveNext() => throw null;
            public T Current => throw null;
        }
    }

    public class Dictionary<TKey, TValue> : Object
    {
        public Dictionary(IntPtr pointer) : base(pointer) { }
        public Dictionary() : base(IntPtr.Zero) => throw null;
        public Enumerator GetEnumerator() => throw null;

        public sealed class Enumerator : ValueType
        {
            public Enumerator(IntPtr pointer) : base(pointer) { }
            public bool MoveNext() => throw null;
            public KeyValuePair<TKey, TValue> Current => throw null;
        }
    }

    public sealed class KeyValuePair<TKey, TValue> : ValueType
    {
        public KeyValuePair(IntPtr pointer) : base(pointer) { }
        public TKey Key => throw null;
        public TValue Value => throw null;
    }
}
