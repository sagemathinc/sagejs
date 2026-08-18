param(
  [Parameter(Mandatory = $true)][string]$FfpolySource,
  [Parameter(Mandatory = $true)][string]$SmalljacSource,
  [Parameter(Mandatory = $true)][string]$Prefix,
  [string]$DependencyPrefix = $Prefix,
  [string]$Compiler = "clang-cl.exe",
  [string]$Librarian = "llvm-lib.exe",
  [switch]$AddressSanitizer
)

$ErrorActionPreference = "Stop"

$ffpolyObjects = @(
  "cstd", "ff", "ff2k", "ffext", "ffpoly", "ffpolyfromroots",
  "ffpolysmall", "polyparse"
)

# This is the complete link closure of smalljac_Lpolys for genus one.  In
# particular STgroups.c and smalljac_moments.c implement the unrelated public
# Sato-Tate statistics API and are not reachable from this entry point.
$smalljacObjects = @(
  "ecurve", "ecurve_ladic", "ecurve_ff2", "hcpoly", "hecurve", "hecurve1",
  "hecurve2_ladic", "hecurve2", "igusa", "jac", "jacorder", "jacstructure",
  "nfpoly", "pointcount", "prime", "smalljac", "smalljac_special",
  "smalljactab", "smalljac_g23", "smalljac_tiny", "mpzpolyutil", "mpzutil",
  "polyparse"
)

$objectRoot = Join-Path $SmalljacSource ".sagejs-objects"
$ffpolyObjectRoot = Join-Path $objectRoot "ffpoly"
$smalljacObjectRoot = Join-Path $objectRoot "smalljac"
New-Item -ItemType Directory -Force $ffpolyObjectRoot, $smalljacObjectRoot | Out-Null

$commonFlags = @("/nologo", "/c", "/O2", "/MD", "/std:c11")
if ($AddressSanitizer) {
  $commonFlags = @("/nologo", "/c", "/O1", "/Zi", "/MD", "/std:c11", "/fsanitize=address")
}

foreach ($name in $ffpolyObjects) {
  $output = Join-Path $ffpolyObjectRoot "$name.obj"
  $source = Join-Path $FfpolySource "$name.c"
  & $Compiler @commonFlags "/DSAGEJS_FFPOLY_PORTABLE=1" "/I$DependencyPrefix\include" "/Fo$output" $source
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$ffpolyLibrary = Join-Path $Prefix "lib\ff_poly.lib"
New-Item -ItemType Directory -Force (Split-Path $ffpolyLibrary) | Out-Null
& $Librarian "/OUT:$ffpolyLibrary" ($ffpolyObjects | ForEach-Object {
  Join-Path $ffpolyObjectRoot "$_.obj"
})
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ffpolyInclude = Join-Path $Prefix "include\ff_poly"
New-Item -ItemType Directory -Force $ffpolyInclude | Out-Null
Copy-Item (Join-Path $FfpolySource "*.h") $ffpolyInclude -Force
Copy-Item (Join-Path $FfpolySource "ff_poly.h") (Join-Path $Prefix "include\ff_poly.h") -Force

foreach ($name in $smalljacObjects) {
  $output = Join-Path $smalljacObjectRoot "$name.obj"
  $source = Join-Path $SmalljacSource "$name.c"
  & $Compiler @commonFlags "/DSAGEJS_FFPOLY_PORTABLE=1" "/I$Prefix\include" "/I$DependencyPrefix\include" "/Fo$output" $source
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$smalljacLibrary = Join-Path $Prefix "lib\smalljac.lib"
& $Librarian "/OUT:$smalljacLibrary" ($smalljacObjects | ForEach-Object {
  Join-Path $smalljacObjectRoot "$_.obj"
})
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item (Join-Path $SmalljacSource "smalljac.h") (Join-Path $Prefix "include\smalljac.h") -Force
