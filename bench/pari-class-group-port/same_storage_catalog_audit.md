# Same-storage catalog control

This is an unqualified shared-host diagnostic for one deliberately fixed
splitting-degree workload. It asks whether the translated algorithm is itself
slow, or whether its current storage/lowering model is slow.

## Boundary

The workload is the cubic `x^3 - 20018*x + 20034`, index `1`, and the frozen
eager sequence of 1,230 primes. The active output contains 1,230 grouped
offsets/counts, 1,833 grouped degree/multiplicity entries, and 2,270 expanded
degrees.

`generate_same_storage_catalog_c.py` reads the ordinary Python implementations
of the F2 and bounded Flx factorization graph. Its restricted benchmark-local
AST emitter mechanically changes:

- `UInt64Buffer` residue storage to `uint64_t[]`;
- `IntegerBuffer` control, metadata, offsets and outputs to `int64_t[]`;
- typed `uint64` locals to `uint64_t`; and
- remaining signed degree/index/control locals to `int64_t`.

It does not substitute PARI's `get_fs`. The emitted program calls the translated
`bounded_pari_prime_degree_catalog` graph, including its admission checks, p=2
path, odd-prime path, HIGHBIT reductions, factor sorting, eager prime order, and
both grouped and expanded output publication. Forty-six source functions are
emitted; one unused diagnostic DDF entry point is harmlessly eliminated by the
C compiler. The timed loop has static storage and contains no GMP, N-API,
`malloc`, `realloc`, or `free` calls.

This is not a production backend. Python exceptions become process failure,
and signed overflow safety is justified only by the fixed workload's existing
admission contract. The experiment therefore supplies a performance ceiling,
not a proposed implementation.

## Exactness

The C control and both Sage.js native backends reproduced state
`[0,1230,1833,2270]` and every active grouped/full output. The canonical output
SHA-256 was:

```
fae750ef6a9451595b4dbe2f80594f7fc8c5c23a19bf40835b5a217912f31ce9
```

The generated C SHA-256 was
`d95f3eb0f6e9cf2284e52254ac8a8f3f75ff7626c3115ec19f2d930f97837d7f`;
the compared Sage.js core SHA-256 was
`6235b3d04dc9140b6c110b2d4911f513ab1e7af91cbcbbb40dea96bcedc14334`.

## Timing

The harness used three warm-up batches followed by seven alternating batches.
Every measured arm exceeded one second. Compilation, argument packing, process
startup, serialization, and output checking were outside the clocks. Storage
and output buffers were reused between iterations. The C control used 800
iterations per batch. Tagged used 16 and GMP used 12.

| arm | milliseconds/catalog, seven wall-clock batches | geometric mean |
| --- | --- | ---: |
| same-storage C, tagged pairing | 1.3946, 1.3817, 1.3846, 1.3822, 1.3831, 1.3841, 1.4059 | 1.3880 |
| Sage.js tagged | 78.5779, 78.8600, 78.2517, 78.7073, 78.3930, 78.2692, 78.8138 | 78.5529 |
| same-storage C, GMP pairing | 1.3802, 1.3793, 1.3777, 1.4045, 1.3981, 1.3817, 1.3829 | 1.3863 |
| Sage.js GMP | 105.5750, 106.1184, 127.7469, 128.8236, 128.5857, 130.9912, 130.9607 | 122.1909 |

The paired geometric-mean native/control ratios were **56.59x for tagged** and
**88.14x for GMP**. Thread/process CPU clocks closely tracked wall clocks. The
late GMP drift is another reason these are `qualifiedTiming: false`; it does not
affect the much tighter tagged result.

The earlier bounded catalog comparison showed that replacing the residue
workspace alone improved the exact implementation by about 30% with GMP and
41% with tagged. This control is much more decisive: applying machine storage
to the signed transitive graph as well produces a further order-of-magnitude
change and even lands in the same millisecond regime as the separately measured
PARI output-contract control. Thus explicit residue storage does **not** close
the splitting-degree gap. The evidence instead points to exact signed scalar
and `IntegerBuffer` lowering, allocation/conversion behavior, and call-boundary
execution as the next compiler mechanisms to isolate.

## Reproduction

Starting with fixtures produced by `check_bounded_prime_degree_catalog.cjs`:

```sh
prlimit --as=4294967296 -- timeout 600s node \
  bench/pari-class-group-port/benchmark_same_storage_catalog.cjs \
  /tmp/sagejs-bounded-prime-degree-catalog-WyXXWF/fixtures.json \
  /tmp/sagejs-analytic-invhr-d88QqB/fixtures.json tagged 16 800

prlimit --as=4294967296 -- timeout 600s node \
  bench/pari-class-group-port/benchmark_same_storage_catalog.cjs \
  /tmp/sagejs-bounded-prime-degree-catalog-WyXXWF/fixtures.json \
  /tmp/sagejs-analytic-invhr-d88QqB/fixtures.json gmp 12 800
```

The compiler was Ubuntu GCC 15.2.0 with `-O3 -std=c11` and
`-D_POSIX_C_SOURCE=200809L`. Each JSON report records all source, fixture,
generated-C, executable, and native-core hashes and has
`qualifiedTiming:false`.
