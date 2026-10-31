using System;
using System.IO;
using System.Linq;

namespace Archivix;

// L'écran Tactique de FM27 est-il ouvert ? Lu dans le fil d'événements de l'interface que le jeu tient pour son
// rapporteur de plantage (LocalLow\Sports Interactive\Football Manager 27\backtrace\bt-breadcrumbs-*), sans aucune
// requête au jeu. Les lectures de la tactique pendant que cet écran est ouvert ont coïncidé avec deux arrêts de FM27.
static class TacticsScreen
{
    const string Panel = "\"panel.name\":\"TacticalPlannerTool\"";
    static readonly string Dir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "LocalLow",
        "Sports Interactive", "Football Manager 27", "backtrace");

    // null = inconnu (fichier absent ou illisible) : l'appelant doit alors s'abstenir.
    public static bool? IsOpen()
    {
        try
        {
            // Le jeu tourne sur plusieurs fichiers (bt-breadcrumbs-0, -1…) : on garde l'événement le plus récent, tous fichiers confondus.
            var files = new DirectoryInfo(Dir).GetFiles("bt-breadcrumbs-*");
            if (files.Length == 0) return null;
            long bestTs = -1; string? last = null;
            foreach (var file in files)
            {
                using var fs = new FileStream(file.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                using var sr = new StreamReader(fs);
                for (string? line; (line = sr.ReadLine()) != null;)
                {
                    if (!line.Contains(Panel) || !(line.Contains("\"Panel Opened\"") || line.Contains("\"Panel Opening\"")
                        || line.Contains("\"Panel Closed\"") || line.Contains("\"Panel Closing\""))) continue;
                    long ts = Timestamp(line);
                    if (ts < SessionStart) continue;   // événement d'un lancement précédent (ex. écran resté « ouvert » lors d'un plantage)
                    if (ts >= bestTs) { bestTs = ts; last = line; }
                }
            }
            if (last == null) return false;   // écran Tactique absent du fil d'événements
            return last.Contains("\"Panel Opened\"") || last.Contains("\"Panel Opening\"");
        }
        catch { return null; }
    }

    // Début du lancement en cours (ms depuis 1970, UTC), comme les horodatages du fil d'événements.
    static readonly long SessionStart =
        new DateTimeOffset(System.Diagnostics.Process.GetCurrentProcess().StartTime.ToUniversalTime()).ToUnixTimeMilliseconds();

    static long Timestamp(string line)
    {
        const string key = "\"timestamp\":";
        int i = line.IndexOf(key, StringComparison.Ordinal);
        if (i < 0) return 0;
        i += key.Length;
        int j = i;
        while (j < line.Length && char.IsDigit(line[j])) j++;
        return long.TryParse(line.AsSpan(i, j - i), out var v) ? v : 0;
    }
}
