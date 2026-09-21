#!/bin/sh
# Qualification-only replacement for gmp-mpfr-sys compile-and-execute target
# probes. The reported values come from the authenticated toolchain receipt;
# all ordinary compilation uses its WASI clang.
set -eu

output=
source_name=
previous=
for argument in "$@"; do
  if [ "$previous" = "-o" ]; then output=$argument; fi
  previous=$argument
  case "$argument" in
    *system_gmp.c) source_name=system_gmp ;;
    *system_mpfr.c) source_name=system_mpfr ;;
  esac
done

if [ -n "$source_name" ]; then
  test -n "$output"
  if [ "$source_name" = system_gmp ]; then
    limb_bits=${SAGEJS_GMP_LIMB_BITS:-32}
    cat > "$output" <<'EOF'
#!/bin/sh
cat > system_gmp.out <<'DATA'
#undef _LONG_LONG_LIMB
#define __GNU_MP_VERSION 6
#define __GNU_MP_VERSION_MINOR 2
#define __GNU_MP_VERSION_PATCHLEVEL 1
PLACEHOLDER_LIMB_BITS
#define GMP_NAIL_BITS 0
#define __GMP_CC "Sage.js prepared WASI clang"
#define __GMP_CFLAGS "wasm32-wasip1; no assembly; no threads"
DATA
EOF
    sed -i "s/PLACEHOLDER_LIMB_BITS/#define GMP_LIMB_BITS $limb_bits/" "$output"
  else
    cat > "$output" <<'EOF'
#!/bin/sh
cat > system_mpfr.out <<'DATA'
#define MPFR_VERSION_MAJOR 4
#define MPFR_VERSION_MINOR 2
#define MPFR_VERSION_PATCHLEVEL 2
#define MPFR_VERSION_STRING "4.2.2"
DATA
EOF
  fi
  chmod +x "$output"
  exit 0
fi

exec "${SAGEJS_WASI_CLANG:?SAGEJS_WASI_CLANG is required}" "$@"
