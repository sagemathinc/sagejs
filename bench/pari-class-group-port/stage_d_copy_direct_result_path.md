# From virtual fixed views to a direct-result `flx_copy`

This is a read-only study against the frozen Stage-D catalog evidence committed
in experiment revision `01469e2a3` and a current-compiler audit at `07741b130`.
The exact dynamic census is the one documented in
[`stage_d_dynamic_check_profile.md`](stage_d_dynamic_check_profile.md): fixture
SHA256 `f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312`,
Stage-D generated-core SHA256
`9229631d082657b648a256bd51a03512bfff659596df1e9235dc4ed3b6b8b3d2`, and
instrumented-core SHA256
`9958f2708b26d2fc417f31b9fbf3f0c41d0294e8ed2df90cfea4ead63c9ccaf3`.

Compiler commit `d5221c010` extends authenticated direct access only to
`Int64Buffer`; this function uses `UInt64Buffer`. Commit `07741b130` revokes
stale constant-range authority but adds no dynamic-range proof. Inspection at
that exact compiler revision therefore confirms that neither subsequent change
removes any of the 15 `int64_pari_flx_copy` sites in the frozen census. No
active worktree was modified for the study.

## Conclusion

The smallest sound path is **not** to change the Python function's parameters
to physical `UInt64Buffer` views. The views should be proof-only facts on the
guarded private clone, while the emitted direct core keeps the compact existing
arguments `(w, a, da, out)`. A physical source view would incorrectly require a
valid source for `da == -1`; two physical views would also lose the base-order
fact needed for overlap direction and increase ABI pressure.

The minimum compiler work is four general pieces:

1. represent an authenticated virtual span as `(owner, base, length)` without a
   run-time object or a non-alias promise;
2. propagate `-1 <= da <= 8` and the relational return summary `result == da`;
3. prove bounded parametric `range(int64)` induction, including negative steps
   and nonzero starts, and authorize an access when its offset interval is a
   subrange of a validated span;
4. compute private-function infallibility to a fixed point and emit a scalar
   direct-result ABI for every eligible function, independent of its name.

That is enough to make the private copy core infallible. The ordinary public
entry and checked fallback stay unchanged and continue to accept/reject all
ordinary inputs with current semantics.

## Exact contract

The private direct core needs this contract:

```
pre:
  same owner w
  -1 <= da <= 8
  valid_span(w, out, 9)
  da < 0 OR valid_span(w, a, da + 1)
alias/effect:
  source and destination may overlap
  read  w[a:a+da+1] iff da >= 0
  write w[out:out+9]
post:
  result == da
failure:
  none under the preconditions
```

Inside the current 393-word private arena, the stronger
`valid_span(w, a, 9)` is acceptable and easier to propagate. It must not become
a public precondition: with `da == -1`, the function reads no source words,
zeros all nine destination words, and returns `-1`.

The alias clause is essential. `out > a` copies downward; otherwise it copies
upward. This is memmove semantics. The proof must not introduce `restrict`,
disjointness, or a `memcpy` transformation.

## What current virtual views do and do not prove

The committed fixed-view verifier already proves:

- constant complete ranges such as `range(9)` over a length-nine view;
- `range(length)` when `length` is exactly the checked view length;
- the normalized reverse form `last = length - 1; view[last - index]` over
  `range(length)`.

The three copy loops do not all match those syntactic forms:

- `range(da, -1, -1)` has a negative step;
- `range(da + 1)` is a dynamic prefix of a length-nine destination;
- `range(da + 1, 9)` has a dynamic nonzero start.

Therefore merely constructing virtual length-nine views does not make the
function infallible. The missing general rule is: an authenticated scalar
interval for a parametric range may prove that every produced offset lies in a
validated view, including negative-step and subrange loops. This should be an
IR proof reconstructed after deserialization, not a trusted source annotation.

## Exact check reduction

The frozen packet executes 55,903 semantic copy calls. Today the copy has 15
static check sites and 1,873,165 dynamic checks:

| family | static sites | dynamic checks |
| --- | ---: | ---: |
| checked `base + i` | 5 | 650,634 |
| full-buffer bounds | 5 | 650,634 |
| range-latch arithmetic | 3 | 503,127 |
| `da + 1` arithmetic | 2 | 68,770 |
| **total** | **15** | **1,873,165** |

The exact staged effects are:

- only `da in [-1, 8]`: remove 2 sites / 68,770 checks (3.67%);
- virtual spans plus that degree bound: remove 12 sites / 1,370,038 checks
  (73.14%);
- add the parametric range theorem: remove the remaining 3 sites / 503,127
  checks (26.86%), leaving zero internal failure sites.

An intermediate implementation may validate source and destination spans at
call sites, then invoke an infallible core. At most two validations per semantic
call are 111,806 dynamic checks, so this still removes a net 1,761,359 of the
current checks (94.03%). The final private-arena implementation should derive
all slot spans from the one outer 393-word guard and have zero per-copy span
checks.

## Call and ABI effect

There are 55,903 semantic invocations. GCC already inlines 25,122 (44.94%). The
compiled object retains 21 static call sites and approximately 30,781 dynamic
out-of-line calls, allocated as follows:

| semantic caller | dynamic out-of-line calls |
| --- | ---: |
| `flxq_powu` | 21,600 |
| `_flx_small_ddf` | 5,326 |
| `_flx_divrem` | 2,625 |
| `flx_small_squarefree` | 1,230 |
| **total** | **30,781** |

The current status ABI uses seven GP words on SysV x86-64: status pointer,
output pointer, two-word buffer, `a`, `da`, and `out`; `out` spills to the
stack. A direct scalar ABI uses five: the buffer pair, `a`, `da`, and `out`, all
in registers. At every retained call this removes the output temporary
store/load and the status test/branch, in addition to removing the checks in
both inlined and out-of-line copies.

Direct ABI does not itself prove that GCC will remove a call instruction. The
conservative expectation is still 21 static / 30,781 dynamic calls, but each is
cheaper. The empirical upper bound after ordinary inlining is elimination of
all 21 / 30,781. This must be measured from the actual generated object; a
mechanical direct C copy compiled to 405 bytes versus 341 bytes for the existing
checked private region because GCC chose more aggressive vectorization, so code
size is not guaranteed to fall.

## Generic direct-result eligibility

This mechanism can be completely name-independent. For each private verified
variant, derive an ephemeral effect/failure summary from IR. A scalar-returning
function is eligible exactly when:

1. every reachable path returns a value of the declared scalar type;
2. no reachable path has an explicit raise;
3. every potentially failing arithmetic, bounds/view, conversion, division,
   resource, or FFI operation has an independently verified no-failure proof;
4. every private callee on a reachable path is itself direct-result eligible,
   or the call is otherwise proved unable to fail;
5. no ownership or cleanup obligation requires a fallible exit.

Compute this as a monotone fixed point over call-graph SCCs. Recursive SCCs can
be conservatively rejected initially. The current checked private graph is
acyclic, so copy becomes eligible immediately once its local proofs close.
Eligibility must be recomputed after IR loading/transformation and fail closed
if any proof witness is stale or mutated.

Emission then follows return shape rather than source identity:

- scalar: `T private_fn(args...)`;
- no result: later permit `void` under the same proof;
- multi-result and owned-resource results remain on the status ABI initially.

Only private-to-private calls are rewritten. A fallible status-ABI caller may
call a direct-result callee. Public exports and unproved/fallback calls retain
the checked ABI. No PARI name, module path, function name, or source spelling is
part of the selection rule.

## Smallest implementation sequence

1. **General virtual-span authority.** Derive proof-only `(owner, base, length)`
   facts from the guarded arena and preserve owner aliasing. Do not pass views
   in the machine ABI.
2. **Interval-aware subrange proof.** Generalize checked view access from exact
   full-range patterns to any authenticated `range(int64)` offset interval
   contained in the span. Cover positive/negative unit steps first.
3. **Scalar summaries.** Infer `da in [-1, 8]` at every copy call and
   `copy.result == da`; preserve bounded callee-result facts through loops with
   a fixed point rather than invalidating them wholesale.
4. **Generic infallibility pass.** Scan local failure operations and solve
   callee dependencies. Mark only reconstructed private variants.
5. **Generic direct scalar ABI.** Emit the direct private core and rewrite
   eligible private calls; retain one checked public/fallback implementation.
6. **Validate and measure.** Require all four frozen packets / 7,081 active
   outputs, malformed public fallbacks, degrees `-1..8`, left/right/exact
   overlap, sanitizers, symbol/relocation/text-size census, and at least seven
   alternating timing pairs.

The first nontrivial milestone is not “all callers direct.” It is one private
`flx_copy` core with zero reachable failure operations and a direct scalar
return, callable from still-fallible status-ABI parents. That is a reusable
compiler feature and isolates the performance effect cleanly.
