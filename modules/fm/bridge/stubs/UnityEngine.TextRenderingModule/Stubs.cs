// Modèle de compilation : signatures seulement, aucun code du jeu (voir ../Directory.Build.props).
using System;

namespace UnityEngine
{
    public sealed class Font : Object
    {
        public Font(IntPtr pointer) : base(pointer) { }
        public static Font CreateDynamicFontFromOSFont(string fontname, int size) => throw null;
    }

    public enum FontStyle { Normal, Bold, Italic, BoldAndItalic }

    public enum TextAnchor { UpperLeft, UpperCenter, UpperRight, MiddleLeft, MiddleCenter, MiddleRight, LowerLeft, LowerCenter, LowerRight }
}
