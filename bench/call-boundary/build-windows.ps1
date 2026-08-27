param(
  [string]$Node = "node",
  [string]$Python = "python",
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

$napiSource = Join-Path $PSScriptRoot "napi_add.c"
$delayLoadSource = Join-Path $PSScriptRoot "win_delay_load_hook.cc"
$napiOutput = Join-Path $Build "add.node"
$nodeInclude = Join-Path $headers "include\node"
$napiCommand = "call `"$vcvars`" && cl /nologo /O2 /DNDEBUG /LD /I`"$nodeInclude`" `"$napiSource`" `"$delayLoadSource`" /link /LIBPATH:`"$Build`" node.lib delayimp.lib /DELAYLOAD:node.exe /OUT:`"$napiOutput`" /IMPLIB:`"$(Join-Path $Build 'add.lib')`""
cmd.exe /d /s /c $napiCommand
if ($LASTEXITCODE -ne 0) { throw "Node-API addon compilation failed" }

$pythonPrefix = (& $Python -c "import sys; print(sys.base_prefix)").Trim()
$pythonInclude = (& $Python -c "import sysconfig; print(sysconfig.get_path('include'))").Trim()
$pythonLibrary = (& $Python -c "import sys; print(f'python{sys.version_info.major}{sys.version_info.minor}.lib')").Trim()
$pythonSuffix = (& $Python -c "import sysconfig; print(sysconfig.get_config_var('EXT_SUFFIX'))").Trim()
$pythonSource = Join-Path $PSScriptRoot "python_add.c"
$pythonOutput = Join-Path $Build "boundary_add$pythonSuffix"
$pythonCommand = "call `"$vcvars`" && cl /nologo /O2 /DNDEBUG /LD /I`"$pythonInclude`" `"$pythonSource`" /link /LIBPATH:`"$(Join-Path $pythonPrefix 'libs')`" `"$pythonLibrary`" /OUT:`"$pythonOutput`" /IMPLIB:`"$(Join-Path $Build 'boundary_add.lib')`""
cmd.exe /d /s /c $pythonCommand
if ($LASTEXITCODE -ne 0) { throw "CPython extension compilation failed" }

Write-Output "Built $napiOutput and $pythonOutput"
