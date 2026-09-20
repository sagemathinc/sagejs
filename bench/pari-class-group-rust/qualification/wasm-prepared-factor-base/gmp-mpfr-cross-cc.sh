#!/bin/sh
# gmp-mpfr-sys's use-system-libs build probes compile and then execute a
# target program.  That is impossible while cross-compiling to Wasm.  This
# qualification-only compiler adapter replaces only those two metadata probes
# with executable scripts containing the authenticated prepared library ABI.
# This artifact uses the last Rug release whose bindings match prepared GMP
# 6.2.1, so the reported version is the real linked library version. Every
# other compiler invocation is delegated to the prepared WASI clang.
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
    cat > "$output" <<'EOF'
#!/bin/sh
cat > system_gmp.out <<'DATA'
#undef _LONG_LONG_LIMB
#define __GNU_MP_VERSION 6
#define __GNU_MP_VERSION_MINOR 2
#define __GNU_MP_VERSION_PATCHLEVEL 1
#define GMP_LIMB_BITS 32
#define GMP_NAIL_BITS 0
#define __GMP_CC "Sage.js prepared WASI clang"
#define __GMP_CFLAGS "wasm32-wasip1; no assembly; no threads"
DATA
EOF
  else
    echo "unexpected MPFR probe in integer-only qualification crate" >&2
    exit 1
  fi
  chmod +x "$output"
  exit 0
fi

exec "${SAGEJS_WASI_CLANG:?SAGEJS_WASI_CLANG is required}" "$@"
