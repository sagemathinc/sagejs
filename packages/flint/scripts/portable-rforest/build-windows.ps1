param(
  [Parameter(Mandatory = $true)][string]$RforestSource,
  [Parameter(Mandatory = $true)][string]$Prefix,
  [string]$DependencyPrefix = $Prefix,
  [string]$Compiler = "clang-cl.exe",
  [string]$Librarian = "llvm-lib.exe",
  [switch]$AddressSanitizer
)

$ErrorActionPreference = "Stop"

# Exact closure of upstream MPZFFTOBJECTS and RFORESTOBJECTS.
$rootObjects = @(
  "zzmisc", "moduli", "split", "reduce", "split_reduce", "crt",
  "recompose", "crt_recompose", "mpnfft", "fermat", "mpnfft_mod",
  "mpzfft", "zzmem", "hwmpz", "hwmpz_tune", "hwmem", "rtree",
  "rforest"
)
$fftObjects = @("mod62", "fft62")
$objectRoot = Join-Path $RforestSource ".sagejs-objects"
$fftObjectRoot = Join-Path $objectRoot "fft62"
New-Item -ItemType Directory -Force $objectRoot, $fftObjectRoot | Out-Null

$commonFlags = @(
  "/nologo", "/c", "/O2", "/MD", "/std:c11",
  "/DZ_USE_128_BIT_TYPES=1", "/I$DependencyPrefix\include"
)
if ($AddressSanitizer) {
  $commonFlags = @(
    "/nologo", "/c", "/O1", "/Zi", "/MD", "/std:c11",
    "/fsanitize=address", "/DZ_USE_128_BIT_TYPES=1",
    "/I$DependencyPrefix\include"
  )
}

foreach ($name in $rootObjects) {
  $output = Join-Path $objectRoot "$name.obj"
  $source = Join-Path $RforestSource "$name.c"
  & $Compiler @commonFlags "/Fo$output" $source
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
foreach ($name in $fftObjects) {
  $output = Join-Path $fftObjectRoot "$name.obj"
  $source = Join-Path $RforestSource "fft62\$name.c"
  & $Compiler @commonFlags "/Fo$output" $source
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$library = Join-Path $Prefix "lib\rforest.lib"
New-Item -ItemType Directory -Force (Split-Path $library) | Out-Null
$objects = @($rootObjects | ForEach-Object {
  Join-Path $objectRoot "$_.obj"
}) + @($fftObjects | ForEach-Object {
  Join-Path $fftObjectRoot "$_.obj"
})
& $Librarian "/OUT:$library" $objects
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$include = Join-Path $Prefix "include"
$licenses = Join-Path $Prefix "share\licenses\rforest"
New-Item -ItemType Directory -Force $include, $licenses | Out-Null
Copy-Item (Join-Path $RforestSource "rforest.h") $include -Force
Copy-Item (Join-Path $RforestSource "LICENSE") $licenses -Force
Copy-Item (Join-Path $RforestSource "COPYING") $licenses -Force
