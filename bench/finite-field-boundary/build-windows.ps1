param(
  [string]$Node = "node",
  [string]$Build = "$PSScriptRoot\build"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Build | Out-Null

$nodeVersion = (& $Node -p "process.versions.node").Trim()
$headers = Join-Path $Build "node-v$nodeVersion"
if (-not (Test-Path (Join-Path $headers "include\node\node_api.h"))) {
  $archive = Join-Path $Build "node-v$nodeVersion-headers.tar.gz"
  Invoke-WebRequest -Uri "https://nodejs.org/download/release/v$nodeVersion/node-v$nodeVersion-headers.tar.gz" -OutFile $archive
  tar -xzf $archive -C $Build
}

$nodeLibrary = Join-Path $Build "node.lib"
if (-not (Test-Path $nodeLibrary)) {
  Invoke-WebRequest -Uri "https://nodejs.org/download/release/v$nodeVersion/win-x64/node.lib" -OutFile $nodeLibrary
}

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$visualStudio = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
if (-not $visualStudio) { throw "Visual Studio C++ Build Tools are required" }
$vcvars = Join-Path $visualStudio "VC\Auxiliary\Build\vcvars64.bat"

$source = Join-Path $PSScriptRoot "napi_modular.c"
$delayLoadSource = Join-Path $PSScriptRoot "win_delay_load_hook.cc"
$output = Join-Path $Build "modular.node"
$include = Join-Path $headers "include\node"
$command = "call `"$vcvars`" && cl /nologo /O2 /DNDEBUG /LD /I`"$include`" `"$source`" `"$delayLoadSource`" /link /LIBPATH:`"$Build`" node.lib delayimp.lib /DELAYLOAD:node.exe /OUT:`"$output`" /IMPLIB:`"$(Join-Path $Build 'modular.lib')`""
cmd.exe /d /s /c $command
if ($LASTEXITCODE -ne 0) { throw "Node-API addon compilation failed" }

Write-Output "Built $output (copy the architecture-independent modular.wasm into $Build)"
