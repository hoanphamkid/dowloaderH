$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $projectRoot '.tools'
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

# Download portable dependencies into this project only; do not modify system PATH.
$release = Invoke-RestMethod 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
$ytAsset = $release.assets | Where-Object name -eq 'yt-dlp.exe'
$sumAsset = $release.assets | Where-Object name -eq 'SHA2-256SUMS'
if (-not $ytAsset -or -not $sumAsset) { throw 'Cannot locate official yt-dlp release assets.' }
$ytTarget = Join-Path $toolsDir 'yt-dlp.exe'
Invoke-WebRequest -UseBasicParsing $ytAsset.browser_download_url -OutFile $ytTarget
$checksums = (Invoke-WebRequest -UseBasicParsing $sumAsset.browser_download_url).Content
if ($checksums -is [byte[]]) { $checksums = [Text.Encoding]::UTF8.GetString($checksums) }
$match = [regex]::Match($checksums, '(?m)^([a-fA-F0-9]{64})\s+\*?yt-dlp\.exe\s*$')
if (-not $match.Success -or (Get-FileHash -LiteralPath $ytTarget -Algorithm SHA256).Hash -ne $match.Groups[1].Value) { throw 'yt-dlp SHA256 verification failed.' }
Write-Host 'yt-dlp downloaded and verified.'

$ffUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
$archive = Join-Path $toolsDir 'ffmpeg-release-essentials.zip'
Invoke-WebRequest -UseBasicParsing $ffUrl -OutFile $archive
$ffHashText = (Invoke-WebRequest -UseBasicParsing ($ffUrl + '.sha256')).Content
if ($ffHashText -is [byte[]]) { $ffHashText = [Text.Encoding]::UTF8.GetString($ffHashText) }
$ffHash = [regex]::Match($ffHashText, '[a-fA-F0-9]{64}').Value
if (-not $ffHash -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $ffHash) { throw 'FFmpeg SHA256 verification failed.' }
Expand-Archive -LiteralPath $archive -DestinationPath $toolsDir -Force
$ffBinary = Get-ChildItem -LiteralPath $toolsDir -Filter 'ffmpeg.exe' -Recurse | Select-Object -First 1
if (-not $ffBinary) { throw 'FFmpeg executable not found after extraction.' }
Write-Host 'FFmpeg downloaded and verified.'

$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) { Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination $envPath }
$envText = Get-Content -LiteralPath $envPath -Raw
$ytRelative = './.tools/yt-dlp.exe'
$ffRelative = './' + $ffBinary.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
$envText = [regex]::Replace($envText, '(?m)^YT_DLP_PATH=.*$', ('YT_DLP_PATH=' + $ytRelative))
$envText = [regex]::Replace($envText, '(?m)^FFMPEG_PATH=.*$', ('FFMPEG_PATH=' + $ffRelative))
[IO.File]::WriteAllText($envPath, $envText, (New-Object Text.UTF8Encoding $false))
Write-Host 'Portable setup complete. Run npm install, then npm run dev.'
