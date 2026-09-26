# Row 4 Phase 6 matched resident boundary

Row 4 uses the field-neutral resident root also exercised by row 1, with
row-4-specific prepared authentication, public capacities, and expected terminal
state. Compilation, native-owner allocation, input authentication, result
inspection, full replay, subprocesses, filesystem work and publication are all
outside the one-call clock.

The generic allocation policy originally gave mutable exact owners 16 GMP
words per slot. That was not a valid row-4 bound: `prep_base_state[6]` is the
factor-base product, and the successful computation materializes a 3,693-bit
integer there. The row-4 host now derives that owner's capacity from its
mathematical provenance. The selected rational primes are a subset of the
authenticated `analytic_primes` catalog, so

```text
bit_length(product(selected primes))
  <= sum(bit_length(p) for p in analytic_primes).
```

For this prepared authority the catalog has 1,230 primes and the right-hand
side is 14,924 bits, hence `ceil(14924 / 64) = 234` words. Only
`prep_base_state` receives that capacity; all unrelated owners keep the normal
input-derived/16-word policy. This is deliberately a conservative derived
bound, not a measured-value allowance or a large global buffer. Invalid catalog
entries are rejected before allocation.

The pristine reference helper prepares PARI's degree-three number field before
`READY`, restores its stack for each sample and clocks only
`bnfinit0(nf, 0)`. The common projection checks the field, class number 2,
invariants `[2]`, rank-two unit/regulator semantics, torsion order two and log
shape. The default focused check separately reruns the untimed fresh correctness
transaction and fails closed on any mismatch. It also checks the derived
capacity constant, rejects an invalid-prime mutation and rejects a semantic
class-number mutation of the common projection.

The fresh replay runs as an isolated preflight process and exits before the
large resident native-owner graph is allocated. Keeping both graphs alive in
one Node process exceeded the 4 GiB validation ceiling even though neither
individual phase did. Process isolation therefore enforces the resource limit
without moving replay, allocation, compilation or serialization into the timed
boundary.

This is adapter readiness, not a performance claim. Qualification and ratio
publication remain false until the quiet-host alternating protocol runs.

```sh
prlimit --as=4294967296 --cpu=1200 -- \
  node bench/pari-class-group-port/row4_phase6_matched_kernel_check.cjs
```

The bounded check produced
`/scratch/row4-phase6-matched-kernel-check-capacity-v1.json` with SHA-256
`3fac9647015dc7af21b01a6890568762b40f48abe5e0b82308a2e3fc71c39b9b`.
It matched the exact common projection, rejected both mutation classes and
replayed fresh correctness result
`5a6ef404472dbf4d39ecd6afc1e0f8cd33ba2e789078e045d43c5ab488dab3de`.
The development-only sample was 6.947 s for the Sage.js resident call and
0.574 s for the prepared PARI call. These are not qualification timings.
