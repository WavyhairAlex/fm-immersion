# Publie une version du plugin FM27 (Archivix Bridge) sur GitHub Releases, dans le dépôt public
# amnesix-nt/simloom (le code reste privé ; Simloom ne peut télécharger que depuis un dépôt public).
#
#   .\publier.ps1 -FMDir "G:\Steam\steamapps\common\Football Manager 27"
#
# Compile la DLL en local (elle dépend des DLL d'interop du jeu, qui ne peuvent pas aller dans la CI),
# calcule les empreintes SHA-256 et crée la release « fm-bridge-vX.Y.Z » avec :
#   ArchivixBridge.dll, chemins.json, fm-bridge.json (manifeste lu par Simloom).
# La release n'est jamais marquée « latest » : ce statut reste à la release de l'appli,
# que le système de mise à jour de Simloom lit (releases/latest/download/latest.json).
param(
  [Parameter(Mandatory = $true)][string]$FMDir,
  [switch]$Brouillon
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
[xml]$proj = Get-Content (Join-Path $here 'ArchivixBridge.csproj')
$version = $proj.Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1
$plugin = Select-String -Path (Join-Path $here 'src\Plugin.cs') -Pattern 'const string Version = "([^"]+)"'
if ($plugin.Matches[0].Groups[1].Value -ne $version) { throw "Version du .csproj ($version) différente de Plugin.Version ($($plugin.Matches[0].Groups[1].Value))." }

dotnet build (Join-Path $here 'ArchivixBridge.csproj') -c Release -p:FMDir="$FMDir" | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Compilation échouée.' }

$dist = Join-Path $here 'dist'
Remove-Item $dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $dist | Out-Null
Copy-Item (Join-Path $here 'bin\Release\net6.0\ArchivixBridge.dll') $dist
Copy-Item (Join-Path $here 'config\chemins.json') $dist

$files = foreach ($name in 'ArchivixBridge.dll', 'chemins.json') {
  $f = Get-Item (Join-Path $dist $name)
  [ordered]@{ name = $name; size = $f.Length; sha256 = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest = [ordered]@{ version = $version; game = 'FM27'; bepinex = '6.0.0-be'; files = @($files) }
[IO.File]::WriteAllText((Join-Path $dist 'fm-bridge.json'), ($manifest | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))

$tag = "fm-bridge-v$version"
# Notes passées par fichier UTF-8 : Windows PowerShell 5.1 transmet mal les accents en argument (« installÃ© »).
$notes = Join-Path $dist 'notes.md'
[IO.File]::WriteAllText($notes, "Plugin FM27 (Archivix Bridge) $version, installé et mis à jour par Simloom. Lecture seule : ne modifie ni le jeu ni les sauvegardes.", [Text.UTF8Encoding]::new($false))
$ghArgs = @('release', 'create', $tag, '--repo', 'amnesix-nt/simloom', (Join-Path $dist 'ArchivixBridge.dll'), (Join-Path $dist 'chemins.json'), (Join-Path $dist 'fm-bridge.json'),
  '--title', "Plugin FM27 $version", '--notes-file', $notes, '--latest=false')
if ($Brouillon) { $ghArgs += '--draft' }
gh @ghArgs
Write-Host "Publié : $tag"
