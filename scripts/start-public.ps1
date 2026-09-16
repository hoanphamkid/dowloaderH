$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendUrl = 'http://127.0.0.1:3000'
$ownedServer = $null

function Test-ProjectBackend {
  try {
    $response = Invoke-WebRequest -Uri "$backendUrl/api/health" -UseBasicParsing -TimeoutSec 2
    $health = $response.Content | ConvertFrom-Json
    if ($response.StatusCode -ne 200 -or $health.status -ne 'ok' -or -not $health.versions) {
      return $false
    }
    foreach ($name in @('yt-dlp', 'FFmpeg', 'FFprobe')) {
      $version = $health.versions.PSObject.Properties[$name]
      if (-not $version -or [string]::IsNullOrWhiteSpace([string]$version.Value)) {
        return $false
      }
    }
    return $true
  } catch {
    return $false
  }
}

function Test-BackendPortInUse {
  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  return @($listeners | Where-Object { $_.Port -eq 3000 }).Count -gt 0
}

$cloudflaredCommand = Get-Command cloudflared.exe, cloudflared -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cloudflaredCommand) {
  $cloudflaredPath = $cloudflaredCommand.Source
} elseif (Test-Path -LiteralPath 'C:\cloudflared\cloudflared.exe' -PathType Leaf) {
  $cloudflaredPath = 'C:\cloudflared\cloudflared.exe'
} else {
  throw 'Chưa tìm thấy cloudflared. Đặt cloudflared.exe vào C:\cloudflared\ hoặc thêm vào PATH rồi chạy lại.'
}

try {
  if (Test-ProjectBackend) {
    Write-Host "Đã có backend hoạt động tại $backendUrl. Dùng lại, không khởi động thêm."
  } else {
    if (Test-BackendPortInUse) {
      throw 'Cổng 3000 đang được sử dụng nhưng /api/health chưa xác nhận đúng backend. Nếu backend đang khởi động, hãy chờ rồi chạy lại. Script không dừng tiến trình đang có.'
    }

    $nodeCommand = Get-Command node.exe, node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $nodeCommand) {
      throw 'Chưa tìm thấy Node.js trong PATH. Hãy cài Node.js rồi mở lại PowerShell.'
    }

    # Force the child backend to use the same address as the tunnel. Restore the caller's environment.
    $previousHost = [Environment]::GetEnvironmentVariable('HOST', 'Process')
    $previousPort = [Environment]::GetEnvironmentVariable('PORT', 'Process')
    try {
      $env:HOST = '127.0.0.1'
      $env:PORT = '3000'
      $ownedServer = Start-Process -FilePath $nodeCommand.Source -ArgumentList 'server/server.js' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    } finally {
      [Environment]::SetEnvironmentVariable('HOST', $previousHost, 'Process')
      [Environment]::SetEnvironmentVariable('PORT', $previousPort, 'Process')
    }

    Write-Host 'Đang chờ backend khởi động...'
    $ready = $false
    $startupTimer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($startupTimer.Elapsed.TotalSeconds -lt 45) {
      $ownedServer.Refresh()
      if ($ownedServer.HasExited) {
        throw 'Backend không khởi động được. Chạy npm run dev -w server trong thư mục dự án để xem lỗi chi tiết.'
      }
      if (Test-ProjectBackend) {
        $ready = $true
        break
      }
      Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
      throw 'Backend chưa sẵn sàng sau 45 giây. Kiểm tra yt-dlp và FFmpeg bằng npm run dev -w server.'
    }
    Write-Host "Backend đã sẵn sàng tại $backendUrl."
  }

  Write-Host 'Giữ cửa sổ này mở. Dùng URL https://...trycloudflare.com bên dưới cho VITE_API_URL trên Vercel, rồi Redeploy.'
  Write-Host 'URL có thể thay đổi khi chạy lại tunnel. Nhấn Ctrl+C để dừng phiên này.'
  # HTTP/2 works on networks that block outbound QUIC/UDP port 7844.
  & $cloudflaredPath tunnel --protocol http2 --url $backendUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Cloudflare Tunnel đã dừng với mã lỗi $LASTEXITCODE. Xem thông báo phía trên."
  }
} finally {
  # An existing backend belongs to its original caller and must remain running.
  if ($ownedServer) {
    $ownedServer.Refresh()
    if (-not $ownedServer.HasExited) {
      Stop-Process -InputObject $ownedServer -Force -ErrorAction SilentlyContinue
    }
    $ownedServer.Dispose()
  }
}
