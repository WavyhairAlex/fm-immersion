// Modèle de compilation : signatures seulement, aucun code du jeu (voir ../Directory.Build.props).
using System;

namespace UnityEngine.InputSystem.Controls
{
    public class KeyControl : Il2CppSystem.Object
    {
        public KeyControl(IntPtr pointer) : base(pointer) { }
        public bool wasPressedThisFrame => throw null;
    }
}

namespace UnityEngine.InputSystem
{
    public class Keyboard : Il2CppSystem.Object
    {
        public Keyboard(IntPtr pointer) : base(pointer) { }
        public static Keyboard current => throw null;
        public Controls.KeyControl f8Key => throw null;
    }
}
