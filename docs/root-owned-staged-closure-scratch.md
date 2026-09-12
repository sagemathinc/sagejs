# Fixed root-owned scratch for staged exact closure

This is a qualified smaller alternative to adding borrowed `NativeExactArena`
parameters for the integer-lattice part of
[staged cubic closure](cubic-staged-exact-closure-design.md). It does not claim
that the complete cubic proof suffix has already been extracted or timed.

## Existing API and ownership

Allocate a bounded set of matrices once in the root arena. Pass ordinary
`FmpzMatrix` borrows, scalar logical dimensions, and any `NativeIntegerVector`
scratch to a private source-transparent helper. The helper creates no exact
owners, cannot close the borrowed matrices, and returns only scalar status or
exact scalar results. Root ownership and its checkpoint remain live throughout
every attempt, including recoverable insufficiency and subsequent collection.

Four existing FFI operations supply the necessary logical shapes:

- `fmpz_matrix_hnf_prefix_into`
- `fmpz_matrix_snf_prefix_into`
- `fmpz_matrix_hnf_transform_prefix`
- `fmpz_matrix_lll_transform_prefix`

They were already supported by ordinary FFI and the generic GMP backend.
This change admits them to the fmpz closed-program whitelist. Their existing
adapters validate shapes and aliases, borrow FLINT windows on the top-left
logical prefix, clear the windows before returning, and refresh retained-size
telemetry on mutated roots. They never resize, return, or free the root matrix.

The helper's ordinary exact scalar temporaries clear on all exits. Temporary
FLINT windows remain local to each FFI call. Matrix entries and any promoted
limbs retained in their roots belong to the same still-live root checkpoint.
There is no child checkpoint, slab, rewind, or implicit increase in capacity.
The generated GMP and fmpz witness each contain one checkpoint entry in the
root and none in the helper.

This does not introduce a stronger allocator contract: foreign-resource size
reporting remains the existing physical-memory telemetry, and freed checkpoint
temporaries do not reclaim bump storage. The complete attempt sequence must
still satisfy the unchanged root checkpoint limit, not merely each attempt in
isolation. Root-owned capacity remains allocated until the outer return.

## Exactness and executable witness

`bench/native_root_owned_prefix_scratch.py` is a generic integer-lattice
witness with one root-owned workspace and one private helper. It repeatedly
attempts logical row counts $2,6,4,6$, returns rank insufficiency at the first
prefix, then checks exact HNF transforms, Smith invariants, dependency-kernel
identities, and LLL transforms for later prefixes. Unused capacity contains
nonzero data and sentinels: it is not silently treated as extra zero relations.

Its first three rows form an upper-triangular integer matrix with diagonal
$2,3,5$. Every later row is an explicit integer combination of those rows, so
every admitted full-rank prefix has row-lattice index $30$. That simple exact
argument provides an oracle independent of agreement between native backends.
An unrelated retained integer and the original matrix entries are checked
after every helper call, including small-to-large GMP/FLINT promotion.

`test/native-root-owned-prefix-scratch.cjs` compares the actual same-source
dynamic JavaScript, GMP, and fmpz implementations on small, negative, 80-bit,
and 255-bit inputs. A separate generated-core sanitizer process exercises
both the public fmpz adapter and the generated GMP entry through
repeated successful attempts, helper exceptions, semantic-budget failure,
checkpoint exhaustion, unchanged publication on failure, and later successful
calls. It uses a 3 MiB checkpoint for successful cases. A local Linux x64
ASan/UBSan run of this witness reported maximum checkpoint high-water values
of 201,136 bytes for fmpz and 208,640 bytes for GMP, with zero upstream
checkpoint allocations. These are witness measurements, not full cubic-suffix
memory estimates. Windows and Wasm still
need their normal platform qualification; a local Unix sanitizer run is not
evidence that those runtime gates passed.

## Applying this to the actual suffix

Choose capacity from the bounded stage schedule and admitted relation count,
not the global 1,024-row maximum. The current relation collection allocation
bound can exceed the proof prefix considerably. In particular, allocating
every square transform at global maximum size would defeat this design.

Replace shape-dependent allocating SNF calls with preallocated Smith output
and explicit logical-prefix SNF; likewise pass logical dimensions to HNF,
dependency HNF transforms and LLL. Keep raw relation count, compact proof count,
and active dependency dimensions separate. Ignore or reset stale scratch
outside the current prefix; never read it as new principal witnesses.

Two concrete integration issues remain:

1. The suffix currently aliases borrowed foreign matrices into locals. Private
   fmpz helpers admit borrowed parameters but not arbitrary foreign-resource
   locals. Pass the intended matrix directly, or use explicit helper branches;
   do not introduce an unrelated backend fallback accidentally.
2. BF interval evaluation currently operates on the entire shape of its input
   matrix. Fixed capacity is mathematically possible using the existing
   bounded 256-value envelope: fill unused inputs with the exact positive
   integer $1$, allocate four endpoint rows per capacity entry, and consume
   only the actual value/term counts. This additional work has not been timed
   or integrated here. An explicit logical-prefix interval adapter may be a
   better measured follow-up than any new ownership language feature.

Only a complete extracted suffix, exact replay, root high-water measurements,
and out-of-sample timings can decide whether this representation is sufficient
for the whole campaign. The witness establishes a working reusable lattice
mechanism; it does not establish new class-group performance or proof claims.
