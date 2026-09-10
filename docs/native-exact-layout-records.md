# Scalar layout records in closed exact programs

The cubic dimensioned-workspace experiment exposed two compiler limitations:
the signature classifier treated every record parameter as prime-field
arithmetic, and the exact backend families did not consistently support
record parameters. A helper taking a layout and exact values consequently
failed on `abs`; correcting dispatch alone then failed in tagged signature
generation.

This change admits **private scalar layout records**, not a new public exact
record ABI. An ordinary `NativeRecord` whose fields are all `uint64` may be
constructed and passed through a closed graph of ordinary private helpers.
The selected entry still takes the existing scalar/buffer/resource types.
Word-only public record graphs and prime-modulus records retain their prior
lowering. Selecting an exact record helper as a public entry fails explicitly.
Borrowed fields, record-vector operations and cross-representation record
escapes are outside this new transformation and fail closed if encountered.

## Lowering and correctness argument

After typed source lowering and dependency closure, but before exact analysis,
the compiler replaces each eligible record value with one fresh scalar per
field. It expands helper parameters and call arguments in schema order,
replaces construction and copying componentwise, and replaces projection with
a scalar copy. `scalarRecordBindings` retains the source-value/field mapping
in inspectable IR. Fresh names exclude all existing parameter and local names.

The simulation relation identifies a record with the tuple of its field
values. Construction establishes this relation, projection preserves the
selected value, and copying preserves the whole tuple. RHS computations have
already occurred in the typed IR before the stores; distinct record bindings
have disjoint generated locals, and a self-copy is harmless. Passing the tuple
by value preserves call-frame separation, including recursive calls. Branch
and loop structure is retained. No field mutation or arbitrary method call is
admitted by the original exact lowerer. Thus the transformation preserves the
accepted source semantics without relying on record object identity.

Every erased field is a scalar: the transformation introduces no allocator,
pointer, owner, destructor, lifetime extension or interpreter callback. Exact
owner parameters remain unchanged. Arena/FFI lifetime rejection and exact
backend qualification run on the transformed call graph. This is an argument
about compiler lowering, not a proof of a class-group algorithm or a formal
verification of the compiler.

## Evidence and boundaries

`test/native-exact-layout-records.cjs` checks ordinary CPython record aliasing
and recursion, exact/word dispatch, private ABI enforcement, field-erasure IR,
fresh-name collisions, tuple helpers, expanded borrowed workspace helpers,
and a complete record/vector/FLINT-matrix call graph. Generated JavaScript,
GMP and FLINT agree on positive and negative 300-bit values and capacities
1, 64, 74, 128 and 512; invalid dimensions decline. The arena root is explicitly
asserted to retain the qualified `fmpz` backend, rather than silently measuring
a different implementation. A separate scalar recursive entry exercises GMP
and tagged execution. The generated core is checked for host-runtime symbols.

The cubic source-copy experiment forwards layout through 39 functions. All
512 permitted layout sizes have disjoint regions in the independent integer
layout test; capacity 64 reproduces the old geometry exactly. Actual full
64-word publications agree on 41 reused controls in controlled serial `opt`
timing: sums of per-field medians are 208.426 ms before and 207.264 ms after;
the largest individual median ratio is 1.024. Both artifacts use the identical
one-page FLINT archive, with five warmups and seven alternating paired rounds
of sixteen calls. Buffer construction/loading/public dispatch are excluded.
These data support no material regression on this panel, not universal speed
equivalence. The timed compiler precedes the final additional guard preserving
public word-record helper graphs; its artifact identity is retained, and no
timing result should be relabeled as a different build.

The isolated research core is about 19 MB and is not production-qualified.
Neither the cubic source allowance nor the production resource limits change.
Full platform qualification, the complete native suite and integration against
current main remain release work. The broader goal—competitiveness for costly
cubic fields—remains incomplete.

Local qualification on this branch passes the architecture gate and strict
Python checks (382 modules), plus 27 focused record/workspace/word regression
tests, including the existing record-vector sanitizer check. The WASI case
is skipped because its prepared toolchain is unavailable. The broad
`pnpm test:native` command started rebuilding the complete dependency prefix;
that preparation was deliberately terminated before installation. Its failed
receipt is retained, and it is not a native-suite pass. The isolated compiler
change may be reviewed separately, but these local results do not qualify a
release or the large experimental cubic program.

The subsequent `pnpm test:changed -- --base HEAD` invocation completed the full
eight-stage build (including 42 production kernel families) and the architecture
gate, then exited nonzero on a modular-form source-freeze assertion in the unit
tests. The remaining changed-file pipeline was not completed. This failure is
not a record-lowering regression witness, but it remains an integration gate;
no inventory was refreshed merely to make it pass. Draft PR #205 is stacked
on the arena-recycling prototype PR #204, not on current main.
