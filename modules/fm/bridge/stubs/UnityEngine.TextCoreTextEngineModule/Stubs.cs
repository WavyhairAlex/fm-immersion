// Modèle de compilation : signatures seulement, aucun code du jeu (voir ../Directory.Build.props).
using System;

namespace UnityEngine.TextCore.Text
{
    public class FontAsset : ScriptableObject
    {
        public FontAsset(IntPtr pointer) : base(pointer) { }
    }
}
