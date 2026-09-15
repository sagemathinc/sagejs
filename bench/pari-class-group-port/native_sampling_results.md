# Prepared-path native sampling

This diagnostic preserves PARI 2.17.4 correspondence and the existing default
64-word workspace policy. It is not a qualified timing or a complete engine
result. The earlier paired prepared-path gap remains approximately 35x.

`sample_prepared_attempt.cjs` uses a Linux x64 calling-thread CPU timer and a
bounded, lock-free PC capture buffer. It brackets the existing native invocation,
including its JS/native bridge, without modifying mathematical source. A known
hot-loop control and exception/recovery control precede kernel capture. Signal
state is restored after each call; unsupported platforms are diagnostic gaps,
not new production requirements. This is host diagnostic C, not mathematical C.

The archived `native-samples-20260915.json` records the exact probe arguments,
mapping identities and executable hashes. The companion symbolized JSON resolves
PCs through ELF PT_LOAD offsets and sized symbols, checking recorded binary
hashes. Unknown addresses remain unknown; percentages include unresolved samples.

The capture contains 31 fresh native calls (one warmup and three batches of ten),
3,104 samples over 3,136,016,611 calling-thread CPU nanoseconds, zero dropped
samples and zero timer overruns. The prepared probe retained its exact checks:
class number 3, invariants [3], regulator agreement, 58 relations, and work
counters 491/54/12. The isolated mathematical core SHA-256 is
`1291731544988743817e203152756b746c20cb24c14589484dbb3695ec7dabda`.

Exclusive samples in malloc (174), free (152), and realloc (132) total 458,
or 14.76% of all samples. Another 646 samples (20.81%) are unresolved in libc;
they must not be assigned to allocation without further evidence. GMP allocation
and copying routines also appear. These are PC samples, not allocation counts
or inclusive stacks. Removing the directly measured 14.76% alone would only
predict about 1.17x improvement, not closure of the full gap.

The next diagnostic is allocation counts/bytes and temporary-lifetime attribution
on the matched path, followed by a bounded reusable-storage experiment. PARI's
stack allocation is an important representation property to preserve, not a
reason to change its arithmetic or stopping rules. Tagged scalar initialization
alone does not establish a heap allocation: small values use lazy big storage.

## Generated-code lifetime observation

Inspection of this exact core shows that `tagged_pari_signed_real_sum` declares
130 tagged local slots and copies all six scalar arguments into local owners.
In particular, copying a big mantissa invokes `sagejs_tagged_make_big` followed
by `mpz_set`; cleanup calls `mpz_clear` for initialized big storage. Small
arguments do not allocate through this copy path. This is a concrete candidate
for borrowed read-only inputs and reusable temporary capacity, not evidence that
all 130 slots allocate on every execution. Initialization/cleanup code also has
resumption paths, so counting emitted call sites is not a dynamic allocation
count. Any reuse must preserve recursion, aliasing, all-exit cleanup and the
existing isolated-core ownership contract.

Reproduce symbolization with:

```sh
node bench/pari-class-group-port/test_native_symbolization.cjs
node bench/pari-class-group-port/symbolize_native_samples.cjs \
  bench/pari-class-group-port/native-samples-20260915.json /tmp/new-symbolized.json
```

Reproduction requires the exact sampled ELF files at their recorded paths;
otherwise attribution fails or is explicitly unresolved. Fresh capture uses
`sample_prepared_attempt.cjs --kernel` followed by the archived `probeArguments`,
under the existing CPU ledger and 4 GiB limit. The successful capture cost 41.87
CPU seconds including setup. Build products remain untracked and reproducible.

The sampler and symbolizer received separate safety and attribution reviews.
Focused symbolization tests pass. This diagnostic does not resolve the existing
broader missing-addon and stale architecture-manifest validation gaps, nor the
remaining prepared-input dependencies or frozen-panel coverage requirements.

## Profile after small-block arena reuse

`arena-reuse-native-samples-20260915.json` and its `native-symbolized` companion
capture the new GMP arena core `5f27b6bda505603f999e5f492aff7a32b8f8bd50ec7817428fe6d3fd005f9d7a`.
The controls pass, as do all prepared output and work assertions. Across 31
calls, 2,782 PCs were captured with no drops or timer overruns; 54 remain
unresolved. Exact sampled binary hashes match during symbolization.

| Exclusive symbol | Samples | Percent of all PCs |
| --- | ---: | ---: |
| `__gmpz_set` | 282 | 10.14% |
| `__gmpz_sizeinbase` | 231 | 8.30% |
| `__gmpn_copyi_zen` | 155 | 5.57% |
| `sagejs_native_gmp_free` | 142 | 5.10% |
| `sagejs_native_gmp_checkpoint_allocate` | 133 | 4.78% |
| `sagejs_native_gmp_realloc` | 108 | 3.88% |
| `__tls_get_addr` | 107 | 3.85% |
| `__gmpz_export` | 105 | 3.77% |
| `sagejs_native_gmp_malloc` | 76 | 2.73% |

These allocator names are our arena hooks, **not libc heap calls**. Allocation
counting separately records only 30 malloc and zero realloc calls after warmup.
The hooks still perform substantial bookkeeping despite reusing memory. GMP
copying and size/export work are also visible; exclusive samples do not reveal
their callers or establish which source operation is responsible.

A concrete next diagnostic is caller attribution for size/export and copying.
For example, `exact-runtime.cjs` converts exact buffer indices with
`mpz_sizeinbase` and `mpz_export`; those are candidates, not an attribution of
all samples to indexing. Preserve overflow, negative-index, and Windows
integer-width semantics in any replacement. The old tagged and new GMP profiles
are different backends/builds and are not a paired per-symbol speed comparison.
