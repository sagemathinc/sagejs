# Hyperelliptic oracle corpus

This directory generates the compact offline fixture in
`test/data/hyperelliptic/local-data-v1.json`. Runtime tests read only that
fixture; Sage, PARI, and Magma are development oracles, not dependencies.

The normalization is fixed throughout:

```text
y^2 + h(x)y = f(x)
L_q(T) = det(1 - T Frob_q)
```

Polynomial and model coefficients are stored in ascending order. Every integer
in the fixture is a decimal string so the format is independent of JavaScript's
safe-integer limit.

## Reproduce the data

The default paths match the development machines described in the project
plan. Override them with `SAGE`, `MAGMA`, or `PYTHON` when necessary.

```sh
node bench/hyperelliptic/run-oracles.cjs --write
node --test test/hyperelliptic-oracles.cjs
```

Generation compares four independent routes before writing anything:

- `exhaustive_oracle.py` implements tiny extension fields, projective point
  counts, Newton reconstruction, Hasse--Witt matrices, and stable `p`-rank in
  ordinary Python without a mathematical package;
- `sage_oracle.py` uses Sage's hyperelliptic finite-field and Jacobian APIs;
- `pari_oracle.py` calls PARI `hyperellcharpoly` through Sage's in-process
  binding;
- `magma_oracle.cjs` generates a Magma program on stdin, checks zeta
  numerators and extension point counts, and enumerates every Jacobian element
  for an independent order histogram.

Sage's invariant factors must reproduce Magma's full element-order histogram,
not merely have the same product. PARI 2.17 does not accept the two generalized
characteristic-2 cases; the fixture records that limitation and requires the
other three oracles to agree there.

The fixture contains source, harness, and executable SHA-256 provenance. Its
own deterministic hash excludes only `generated_at_utc`, so timestamps do not
make verification flaky.

## Benchmark the oracle baselines

`benchmark-oracles.cjs` measures the complete 25-row local-polynomial,
extension-count, and Jacobian-order workload. Each backend performs several
repetitions inside one resident process, separating the first algorithm
evaluation from warm evaluations while also reporting total process wall time.
The JSON result records the host, versions, exact workload and harness hashes,
and a result digest. Group enumeration is intentionally excluded from repeated
warm samples because it measures a different stage and can retain large caches.

```sh
node bench/hyperelliptic/benchmark-oracles.cjs --repeat 3 \
  > bench/hyperelliptic/oracle-benchmark.json
```

The production genus-2 benchmark separates the one-crossing packed smalljac
stream from exact public polynomial materialization:

```bash
node bench/hyperelliptic/benchmark-smalljac.cjs \
  --limits 10000,100000 --repeat 3 \
  > bench/hyperelliptic/smalljac-benchmark.json
```

It records wall/CPU/RSS samples, prime and good-row counts, a SHA-256 digest of
the complete packed stream, and an independent public-result checksum. Use a
larger `--limits` value only when the several-minute native `10^6` workload is
desired on the current host.

At production-sized bounds, use `--packed-only` so the benchmark measures the
single native traversal without also retaining tens of thousands of Python
polynomials. `--curves quintic,sextic` compares the two supported model
degrees, while `--public-mode streamed` measures the bounded public iterator
without materializing the complete result:

```bash
node bench/hyperelliptic/benchmark-smalljac.cjs \
  --limits 1000000,2000000 --repeat 1 --packed-only
node bench/hyperelliptic/benchmark-smalljac.cjs \
  --limits 100000 --repeat 1 --curves quintic,sextic \
  --public-mode streamed
```

Every new-format sample records both SHA-256 and the same numeric FNV-1a
stream digest as the standalone C harness, making exact
boundary/standalone comparisons independent of timing.

For the no-Node baseline, compile `smalljac_batch.c` against the same pinned
archives and run it with a stop bound and repetition count:

```bash
cc -O2 -std=c11 -DSAGEJS_HAVE_SMALLJAC=1 \
  -Ipackages/flint/include -Ipackages/flint/.native/prefix/include \
  packages/flint/src/hyperelliptic/smalljac.c \
  bench/hyperelliptic/smalljac_batch.c \
  packages/flint/.native/prefix/lib/libsmalljac.a \
  packages/flint/.native/prefix/lib/libff_poly.a \
  packages/flint/.native/prefix/lib/libgmp.a -pthread -lm \
  -o /tmp/sagejs-smalljac-batch
/tmp/sagejs-smalljac-batch 100000 3 'x^5+x+1'
```

The checked-in Linux x64 receipt is
`smalljac-benchmark-linux-x64.json`. At `10^5`, the packed Node boundary used
1.953246% more CPU than the median standalone C sample, comfortably within the
15% gate. Exact public polynomial materialization is intentionally reported as
a separate cost rather than hidden inside the foreign-library boundary.

### Wasm smalljac differential benchmark

After `pnpm build:wasm` and the native FLINT package build, compare the same
pinned genus-2 source closure through the native and Wasm packed adapters:

```bash
node bench/hyperelliptic/wasm-smalljac-benchmark.mjs 100000 3 \
  > bench/hyperelliptic/wasm-smalljac-benchmark.json
```

The harness warms both reactors, performs one smalljac traversal per sample,
and requires a byte-exact digest match over primes, good flags, coefficient
counts, both signed coefficients, and row statuses. Its JSON receipt also
records the content-addressed Wasm artifact, timings, copied-byte route
evidence, normalization, and native/Wasm ratio. Bounds are limited to one
131071-value Wasm request; production calls cover larger intervals through the
public bounded chunk iterator.

The output path is intentionally not prescribed or checked in: benchmark
receipts are meaningful only with their host identity. This harness is an
oracle-cost baseline, including exhaustive counts and group-structure checks;
it is not a claim about the eventual Sage.js production backend.

## Scope

The cases deliberately stay small enough for exhaustive reproduction while
covering genus 2 and 3, degrees 5 through 8, odd/even models, nonzero `h`,
characteristic 2, quadratic twists, bad reductions, ordinary and
supersingular examples, every possible `p`-rank, and cyclic through rank-four
Jacobian structures. Large-prime and dense-interval throughput belongs in the
benchmark harness; it does not inflate the runtime fixture.
