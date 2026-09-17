# Authentic field3 packed class `cleanarch`

This lane closes the packed-real join left open by the mixed-signature leaf
qualification. It consumes the 42-cell logical `C` prefix exported as
`live.c` by `check_field3_live_class_suffix.cjs` after the resident field3
driver and class suffix run in one CPython process. No checked-in answer
fixture or final-composer input is added.

## Source correspondence

`field3_packed_class_cleanarch.py` specializes pristine PARI 2.17.4
`src/basemath/buch2.c:899-932` to degree four and signature `(2,1)` while
reusing the repository's exact packed-real helpers. For each live column it:

1. sums the real components of the three already-weighted archimedean entries;
2. forms `s = -sum/4`;
3. adds `s` at the two real places and `2*s` at the complex place;
4. reduces imaginary components modulo `2*pi`, `2*pi`, and `4*pi` using
   exact packed division, floor, multiplication, and signed addition; and
5. publishes the detached scratch owner only when all columns succeed.

The companion retry leaf reproduces the caller's
`nbits2extraprec(gexpo(C)+64)-gprecision(C)` status using the same packed
owner. An insufficient-accuracy mutation must return retry without changing
the output sentinel.

## Differential replay

The checker accepts a generated `live-class-join.json`, the pristine PARI
source tree, and its pinned archive. It ignores the joined class answers and
passes only `live.c` to cleanarch. It compiles an instrumented source cut that
calls PARI's actual static `cleanarch(C,4,...)`, then requires exact packed
output and retry-status equality under CPython, JavaScript, GMP, and tagged
native execution.

Run with an artifact emitted by the live suffix checker:

```bash
node bench/pari-class-group-port/check_field3_live_packed_cleanarch.cjs \
  /tmp/sagejs-field3-resident-retry-.../live-class-join.json \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

This proves the authentic packed `C -> cleanarch(C)` join for the retained
two-column field3 class suffix. It does not connect units, honesty, the final
composer, or public completion, and the live join artifact remains an
external generated input rather than a durable repository fixture.
