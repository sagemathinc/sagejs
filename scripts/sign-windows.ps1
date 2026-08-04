param(
  [string]$Sagejs = "build/sea/sagejs.exe",
  [string]$Sagepython = "build/sea/sagepython.exe",
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "Windows Authenticode signing must run on Windows"
}
if (-not $VerifyOnly) {
  if (-not $env:SAGEJS_WINDOWS_CERTIFICATE_PFX_BASE64) {
    throw "SAGEJS_WINDOWS_CERTIFICATE_PFX_BASE64 is required"
  }
  if (-not $env:SAGEJS_WINDOWS_CERTIFICATE_PASSWORD) {
    throw "SAGEJS_WINDOWS_CERTIFICATE_PASSWORD is required"
  }
}
foreach ($executable in @($Sagejs, $Sagepython)) {
  if (-not (Test-Path $executable -PathType Leaf)) {
    throw "Missing executable: $executable"
  }
}

$kits = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
$signTool = Get-ChildItem -Path $kits -Filter signtool.exe -Recurse |
  Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $signTool) {
  throw "signtool.exe was not found under $kits"
}

$temporaryRoot = if ($env:RUNNER_TEMP) {
  $env:RUNNER_TEMP
} else {
  [IO.Path]::GetTempPath()
}
$certificate = Join-Path $temporaryRoot "sagejs-signing-$PID.pfx"
$timestamp = if ($env:SAGEJS_WINDOWS_TIMESTAMP_URL) {
  $env:SAGEJS_WINDOWS_TIMESTAMP_URL
} else {
  "http://timestamp.digicert.com"
}

try {
  if (-not $VerifyOnly) {
    [IO.File]::WriteAllBytes(
      $certificate,
      [Convert]::FromBase64String($env:SAGEJS_WINDOWS_CERTIFICATE_PFX_BASE64)
    )
  }
  foreach ($executable in @($Sagejs, $Sagepython)) {
    if (-not $VerifyOnly) {
      Write-Host "Authenticode signing $executable"
      & $signTool.FullName sign /v /fd SHA256 /td SHA256 /tr $timestamp `
        /d "Sage.js research mathematics" /f $certificate `
        /p $env:SAGEJS_WINDOWS_CERTIFICATE_PASSWORD $executable
      if ($LASTEXITCODE -ne 0) {
        throw "signtool failed for $executable"
      }
    }
    & $signTool.FullName verify /pa /v $executable
    if ($LASTEXITCODE -ne 0) {
      throw "Authenticode verification failed for $executable"
    }
  }

  & $Sagejs --version
  if ($LASTEXITCODE -ne 0) { throw "Signed sagejs did not start" }
  & $Sagepython --jupyter-kernel-self-test
  if ($LASTEXITCODE -ne 0) { throw "Signed sagepython Jupyter runtime failed" }
  $factor = "factor(2026)" | & $Sagejs
  if ($LASTEXITCODE -ne 0 -or $factor -notmatch "2 \* 1013") {
    throw "Signed sagejs native factorization failed"
  }
} finally {
  if ($certificate -and (Test-Path $certificate)) {
    Remove-Item -Force $certificate
  }
}
