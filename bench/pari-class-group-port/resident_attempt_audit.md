# Resident prepared-attempt diagnostic audit

Read-only review of `probe_resident_class_attempt.cjs` and
`/tmp/sagejs-prepared-class-inputs-JXLwHg/inputs.json`. No benchmark was run
during this audit. Input SHA256:
`37abbff3ea5a0fbbd81d4261a737f19808a2b85220c725417d0f315d15c0e10c`.

## Boundary and reset

The probe accurately labels itself **not a qualified PARI comparison**.
The measured region contains one `f.gmp(...args)` call; it excludes source
compilation, input preparation, owner construction, snapshot restoration,
and output decoding. This is a prepared, single-attempt, warm-call diagnostic,
not full `bnfinit`, a cold invocation, retrying collection, or a unit-map API.

All mutable arguments are independently owned. The reset closures restore
both signed sizes and every limb for packed integers, and all entries for
typed integer/float buffers. Scalar arguments are immutable. The exported
initial checkpoint has attempt stage 0, relation count 0, chain stage 0, and
log-completed count 0. Therefore subsequent invocations do not accidentally
exercise the terminal idempotent fast return. The warm-up is also reset from
the same checkpoint, including numerical caches.

The 280 exported `(name,type)` pairs exactly match the current Python entry
signature. It would be useful for the probe to assert this itself so a stale
artifact cannot silently change positional meanings. The current signature
match was checked read-only, not inferred from argument count alone.

The probe checks acceptance and repeated result equality, but should also
compare its result to the independently replayed `fixture.summary.cp[0]`.
That is a post-computation assertion, not using the oracle as input. As
written, a deterministic wrong result could satisfy its self-consistency
checks. Existing separate differential checkers provide the stronger
correctness evidence; the probe should not imply that repetition replaces
them.

## Oracle data are not supplied as answers

The serialized artifact also contains `expected` and `summary.cp`, but the
probe constructs arguments exclusively from `inputs[0]` and `names`.
`class_number`, `class_invariants`, `accept_regulator`, and `hnf_result_h`
are entirely initialized to sentinel 77, not the expected answer. Relation
and log checkpoints are empty. The native call computes those outputs.

Prepared quantities are still substantial: number-field arithmetic and
embeddings, factor-base/ideal packets, permutation and search policy, prime
products, and analytic inverse hR. These are legitimate *declared prepared
inputs*, not evidence that their cost is included. Here `hnf_k0=3`, log
precision=192, additional relations=7 and target=58 agree with the actual
default source-driver trace. The inverse hR triple is a declared analytic
input, not the expected class number or regulator. The diagnostic does not
execute the whole driver honesty branch, even though the separate actual
driver trace verifies that this field has KCZ=KCZ2 and needs no extra honesty
work.

## Packed storage and capacity

The current policy reserves at least 64 limbs per ordinary integer owner,
4 per CUP owner, and increases a whole owner's fixed per-entry capacity if
the supplied input requires more. This happens before execution and is not
result-dependent automatic growth. The large input exception is:

| Owner | Entries | Maximum input bits | Fixed limbs per entry | Bytes |
| --- | --- | --- | --- | --- |
| admission_products | 9 | 94,042 | 1,470 | 105,876 |

The resulting packed owners occupy **271,240,904 bytes**, and reset snapshots
another **271,240,904 bytes**: **542,481,808 bytes** combined. This satisfies
the stated 1-GiB owner-plus-snapshot guard. It is not an RSS bound: parsed JSON,
temporary BigInt arrays, generated-code compilation, GMP temporaries, addon
memory, and output decoding are additional.

Several scratch dimensions are deliberately very conservative: for example,
`hnf_rank_state`, `hnf_profile`, and `hnf_occupied` each reserve 11,881 exact
entries (6,130,596 bytes at 64 limbs), although their live requirements are
much smaller. `relation_records` reserves 32,130 entries (16,579,080 bytes).
Right-sizing these requires the individual helper's capacity contract, not
trimming a buffer merely to its observed nonzero prefix.

Capacity based on input magnitude only guarantees that inputs fit, not that
all intermediates fit. Arithmetic overflow remains an explicit failure.
Any future fixed-capacity tuning must retain representative differential
tests and output/intermediate range checks.

## Most concrete runtime overhead to investigate later

The generated packed setter performs a full-capacity zero-fill **on every
store**, even when the value is zero or fits one limb:

```c
memset(slot, 0, buffer->word_capacity * sizeof(*slot));
```

Current generator: `tools/native-kernel/c-backend.cjs:3475–3495` for the GMP
setter (and line 3428 for the nearby representation path). At the diagnostic
capacity, each ordinary store zeros 512 bytes before any live-limb export;
a CUP store zeros 32 bytes. Thus capacity affects execution cost as well as
resident size. This is a concrete operation count per store, **not a measured
attribution of elapsed time**. Whether dead high limbs must remain zero for
the public packed format, native validation, snapshot semantics, and other
backends needs review before eliminating any writes.

The earlier generated prepared-attempt core confirms the same operation at
line 2107, but its cache entry is historical: key
`322ec0b551c69826217b7445c74f8e5c7b1fd74cf7f84351ad9efc0c0854e456`,
source hash `14d4b5b852cc462fae92999788d62b0bc936bcd493df1350a3918d70a5bf377a`.
It predates the new CUP entry and must not be presented as the current
compiled closure. The generator evidence above remains current; a subsequent
probe should record its actual source/core hashes and capacity map.

For eventual comparable timings, first freeze matching prepared boundaries
and outputs, serialize work on the host, record both primitive and complete
call costs, and distinguish fixed-capacity representation effects from
algorithmic work. This audit recommends no speculative compiler change.
