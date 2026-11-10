// Modèle de compilation : signatures seulement, aucun code du jeu (voir ../Directory.Build.props).
using System;
using SI.Interop;

namespace FM.UI
{
    public enum DatabaseTableType
    {
    }

    public class DatabaseRecordReference : InteropReference
    {
        public DatabaseRecordReference(IntPtr pointer) : base(pointer) { }
        public int CombinedIndexAndType => throw null;
        public DatabaseTableType Type => throw null;
        public int m_index { get => throw null; set => throw null; }
    }

    public class GameReference : InteropReference
    {
        public GameReference(IntPtr pointer) : base(pointer) { }
        public GameReference() : base(IntPtr.Zero) => throw null;
        public static GameReference GetInstance() => throw null;
    }

    public class TacticReference : InteropReference
    {
        public TacticReference(IntPtr pointer) : base(pointer) { }
        public TacticReference() : base(IntPtr.Zero) => throw null;
        public int m_index { get => throw null; set => throw null; }
        public bool m_is_full_tactic { get => throw null; set => throw null; }
        public DatabaseTableType m_type { get => throw null; set => throw null; }
        public void SetCombinedIndexAndType(int value) => throw null;
    }

    public class TeamTacticReference : TacticReference
    {
        public TeamTacticReference(IntPtr pointer) : base(pointer) { }
        public TeamTacticReference() : base(IntPtr.Zero) => throw null;
    }

    public class MatchTacticReference : TacticReference
    {
        public MatchTacticReference(IntPtr pointer) : base(pointer) { }
        public MatchTacticReference() : base(IntPtr.Zero) => throw null;
    }
}
