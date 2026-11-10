// Modèle de compilation : signatures seulement, aucun code du jeu (voir ../Directory.Build.props).
using System;
using SI.Core;

namespace SI.Bindable
{
    public class Bindings : Il2CppSystem.Object
    {
        public Bindings(IntPtr pointer) : base(pointer) { }
        public void Unbind(ref Key key, ValueChangedCallback callback) => throw null;

        public struct Key
        {
            private ulong m_key;
        }

        public sealed class ValueChangedCallback : Il2CppSystem.MulticastDelegate
        {
            public ValueChangedCallback(IntPtr pointer) : base(pointer) { }
            public static implicit operator ValueChangedCallback(Action<Key, TypedValue> action) => throw null;
        }
    }

    public sealed class BindingSubsystem : Bindings
    {
        public BindingSubsystem(IntPtr pointer) : base(pointer) { }
    }

    public static class BindingUtils
    {
        public static RequestBuilder BuildRequest(Bindings bindings, TypedValue source) => throw null;
        public static Bindings.Key Request(Bindings bindings, TypedValue source, string property, Il2CppSystem.Object owner, Bindings.ValueChangedCallback callback) => throw null;

        public sealed class RequestBuilder : Il2CppSystem.ValueType
        {
            public RequestBuilder(IntPtr pointer) : base(pointer) { }
            public RequestBuilder AddContext(Il2CppSystem.ReadOnlySpan<char> name, TypedValue value) => throw null;
            public Bindings.Key Bind(Il2CppSystem.ReadOnlySpan<char> property, Il2CppSystem.Object owner, Bindings.ValueChangedCallback callback) => throw null;
        }
    }
}
