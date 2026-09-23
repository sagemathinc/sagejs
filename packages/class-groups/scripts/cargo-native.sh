#!/bin/sh
# Invoke Cargo with one explicit GMP/MPFR domain shared by Rug and FLINT.
set -eu

package=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
prefix=${SAGEJS_FLINT_PREFIX:-"$package/../flint/.native/prefix"}
for required in \
  "$prefix/include/gmp.h" \
  "$prefix/include/mpfr.h" \
  "$prefix/lib/libgmp.a" \
  "$prefix/lib/libmpfr.a" \
  "$prefix/lib/libflint.a"
do
  test -f "$required" || {
    echo "class-group native arithmetic dependency missing: $required" >&2
    echo "build @sagemath/sagejs-flint or set SAGEJS_FLINT_PREFIX" >&2
    exit 2
  }
done
grep -Eq '^#define[[:space:]]+__GNU_MP_VERSION[[:space:]]+6([[:space:]]|$)' "$prefix/include/gmp.h" || {
  echo "class-group core requires GMP major version 6" >&2
  exit 2
}
grep -Eq '^#define[[:space:]]+MPFR_VERSION_MAJOR[[:space:]]+4([[:space:]]|$)' "$prefix/include/mpfr.h" || {
  echo "class-group core requires MPFR major version 4" >&2
  exit 2
}

export SAGEJS_FLINT_PREFIX="$prefix"
export SAGEJS_GMP_PREFIX="$prefix"
export SAGEJS_MPFR_PREFIX="$prefix"
export CPATH="$prefix/include${CPATH:+:$CPATH}"
export LIBRARY_PATH="$prefix/lib${LIBRARY_PATH:+:$LIBRARY_PATH}"
exec cargo "$@"
