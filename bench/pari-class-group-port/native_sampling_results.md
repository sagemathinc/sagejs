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
