# Bounded splitting-degree catalog experiment

This experiment changes storage, not mathematics. For odd primes, canonical
polynomial coefficients and polynomial scratch use `UInt64Buffer`; signed
degrees and control metadata remain exact `IntegerBuffer` values. The defining
polynomial and equation index remain exact at admission. Prime 2 deliberately
uses the unchanged exact `F2x` path. The eager prime order, Shoup power schedule,
HIGHBIT reduction points, grouped/full output order, and failure publication
contract are unchanged.

The split is necessary because the baseline workspace interleaves unsigned
residues with signed degree values, including degree `-1`. Encoding `-1` as an
unsigned sentinel would change the mathematical source representation, so this
experiment instead supplies a distinct metadata owner. The unsigned arithmetic
remains safe in the declared `p <= 3037000493`, degree-at-most-four corridor:
the translated HIGHBIT checks reduce an accumulator before the next product can
wrap a 64-bit word.

## Differential result

`check_bounded_prime_degree_catalog.cjs` passed CPython, JavaScript, GMP, and
tagged execution for prime counts `[1230,63,64,63]`. The complete first field
published state `[0,1230,1833,2270]`; every grouped degree/multiplicity and full
degree entry matched the frozen analytic fixture.

Evidence is `/tmp/sagejs-bounded-prime-degree-catalog-WyXXWF/fixtures.json`.
The generated core SHA-256 is
`6235b3d04dc9140b6c110b2d4911f513ab1e7af91cbcbbb40dea96bcedc14334`.
Its bounded multiplication uses direct unsigned-word buffer accesses and no
exact-buffer index helper. It still contains exact scalar arithmetic: the
compiler has no signed machine-scalar annotation for degrees and offsets.
The generated bounded multiplication has 20 `mpz_t` local declarations and
160 static `mpz_*` call sites, versus 23 and 179 in the baseline multiplication.
Thus this experiment isolates residue storage but does not claim to have made
the complete control graph machine-sized.

## Shared-host diagnostic timing

The reproducible command is:

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  prlimit --as=4294967296 timeout 600s node \
  bench/pari-class-group-port/benchmark_bounded_prime_degree_catalog.cjs \
  /tmp/sagejs-bounded-prime-degree-catalog-WyXXWF/fixtures.json 8
```

Three warmup batches preceded seven alternating pairs of eight calls. Packing
and compilation were outside the timer. Every retained batch exceeded one
second before division by eight.

| Pair | Bounded ms/call | Exact ms/call | Ratio |
| ---: | ---: | ---: | ---: |
| 1 | 104.840 | 150.921 | 0.695 |
| 2 | 105.301 | 152.368 | 0.691 |
| 3 | 105.229 | 150.314 | 0.700 |
| 4 | 105.110 | 152.654 | 0.689 |
| 5 | 105.235 | 150.037 | 0.701 |
| 6 | 105.806 | 150.351 | 0.704 |
| 7 | 105.711 | 151.585 | 0.697 |

The geometric-mean ratio is **0.69668**, a diagnostic improvement of about
30.3%. This is shared-host evidence, not a qualified timing, a comparison with
PARI, or a whole-class-group speedup. Explicit bounded residue storage helps
materially, but by itself does not close the splitting-degree gap. The next
language-level experiment should test a checked signed machine scalar for
degrees and offsets before changing the factorization algorithm.
