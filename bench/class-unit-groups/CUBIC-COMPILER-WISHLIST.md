# Cubic class-number compiler wishlist

This is a measured implementation wishlist, not a request to compile the
entire cubic class-number module. The current algorithm already avoids general
relation search on the representative fields below. The remaining gap to PARI
is mostly exact representation, object construction, and proof-state traffic
around very small arithmetic kernels.

## Reproduce the boundary

Use a built source checkout on an otherwise idle host:

```sh
SAGEJS_USE_SOURCE=1 SAGEJS_OPT_LEVEL=O2 \
  SAGEJS_CUBIC_PROFILE_SAMPLES=7 \
  node bin/sagejs --python \
  bench/class-unit-groups/cubic-compiler-boundaries.py

SAGEJS_USE_SOURCE=1 SAGEJS_OPT_LEVEL=O2 \
  SAGEJS_CUBIC_PROFILE_SAMPLES=7 \
  SAGEJS_CUBIC_KERNEL_TARGET=javascript \
  node bin/sagejs --python \
  bench/class-unit-groups/cubic-compiler-boundaries.py
```

The profiler uses three nontrivial pinned LMFDB cubics: discriminants 588,
4027, and 5448, with class numbers 3, 6, and 8. It constructs a fresh
isomorphic field and prepares its maximal order outside each timer. Both proof
modes must return the exact expected class number. Inclusive boundary timings
are nested and must not be added together.

On the 2026-08-27 Linux x64 development host, the optimized public scalar
medians were approximately 0.095 seconds for 588, 0.284/0.348 seconds for 4027
(conditional/unconditional), and 0.292/0.283 seconds for 5448. Direct GP/PARI
on the pinned cubic family takes roughly 1--3 milliseconds warm. This is a real
gap, but it is not explained by one uniformly slow arithmetic primitive.

The complete pinned 10-field, 20-policy Sage/PARI run matched every exact class
number. Its Sage.js/PARI geometric-mean ratio was 52.5, median 86.6, and worst
105.3. The empty-factor-base discriminant-23 case was only 6--7 times slower,
while the harder scalar paths were commonly 85--105 times slower. Matched O0
and O2 process runs were within about 1--2% on the three hard representatives;
the current optimizer neither helps nor materially harms this scalar path.

Compiling the complete ordinary Python module with
`--explain-optimizations` at O2 currently reports:

```text
pass math.strict-float-region.v1: regions 0 -> 0
pass math.closed-ring-region.v1: regions 0 -> 0
no optimization candidates
```

## Work already removed in the source algorithm

The packed principal-factor proposer used to recheck the same power-basis
shape and decode the same defining polynomial for every modular lift. Reusing
one exact order norm form removes roughly 16% on discriminant 588 and 6--9% on
5448 in alternating old/new measurements. The exact HNF support selector also
already knows the retained row rank; carrying that rank forward avoids building
a full presentation merely to rediscover that a short prefix is one pivot
short. This is a smaller, roughly presentation-sized win.

These changes are high-level state-flow corrections. They do not require a new
compiler target and remain ordinary CPython-parseable mathematics.

## Ranked missing capabilities

### 1. Resident small exact relation matrices

The exact HNF support selector, deletion trials, and final presentation work on
matrices with only a handful of rows and 4--10 columns. On the measured fields,
their inclusive cost is about 20--69 ms. The discriminant-4027 unconditional
selector alone performs seven deletion trials and spends about 38 ms rebuilding
small exact HNFs.

The desired capability is not a faster scalar determinant call. It is one
resident packed exact-matrix region that computes HNF support, tests the
bounded row-deletion schedule, and returns the retained support plus rank in a
single coarse boundary. A dynamic ordinary-Python oracle must remain available,
and the region must return the identical canonical HNF lattice and source-row
support. An initial end-to-end acceptance target is 8% on discriminant 4027
without more than 3% regression on 588 or 5448.

### 2. Persistent packed cubic factor records

Materializing packed factor records into general prime-ideal objects costs
about 27--47 ms on the two larger fields. The native finite-algebra splitting
is not that expensive; converting the result into several independently
fingerprinted representations is. The producer, relation validator, and proof
issuer should share one immutable, owner-bound packed factor authority until a
public ideal is actually requested.

This is primarily a representation and proof-state task. A compiler can help
only after the ownership boundary is explicit. Acceptance should require exact
detached factor-base replay, mutation rejection, cancellation/resource caps,
and at least 8% end-to-end improvement on 4027 and 5448.

### 3. Guarded bounded-integer cubic regions

The candidate and factor-row kernels are mathematically good candidates for V8
when every coefficient, norm, exponent, and intermediate product is proved to
fit a guarded signed range. Today their generated JavaScript fallbacks operate
through generic exact-integer buffers. Forcing those fallbacks made the public
path 7--38% slower than the authenticated native kernels in matched tests.
Thus simply selecting JavaScript is not an optimization.

The missing compiler proof is a guarded `Number`/fixed-width representation
for a complete bounded enumeration-and-row batch, with overflow guards before
publication and the current exact implementation as fallback. It should fuse
enough work to avoid per-buffer conversion. In a direct target microbenchmark,
the current native candidate kernel took about 57 microseconds call-only and
181 microseconds including fresh buffers, while its generic generated
JavaScript target took about 1.50 and 1.64 milliseconds respectively. Both
returned identical metadata. The public `javascript` diagnostic route is even
more conservative: it deliberately withholds the production validation token
and therefore includes independent relation revalidation. A useful success
criterion is end-to-end improvement on a newly proved representation, not a
microbenchmark or the current forced-fallback route.

### 4. Lazy authenticated certificate encoding

The completed discriminant-588 producer spends about 10--15 ms encoding proof
state, roughly 10% of its entire scalar call. A scalar caller needs a retained
proof authority, but it does not necessarily need every detached JSON-shaped
object immediately. A module-issued immutable live receipt could retain the
already verified canonical primitives and construct the detached certificate
only when requested.

This must not become a trusted cache of mutable public objects. Live and
detached verification must remain independent, pre-seal mutation must fail
closed, and cancellation must be polled around any deferred construction.

### 5. Optimization explanations for exact integer regions

The current optimizer correctly declines this module, but it gives no local
reason because neither existing pass recognizes an exact-integer candidate.
Add a candidate-only explanation pass before adding lowering. It should report
range facts, unsupported exact operations, potential materializations, copied
bytes, boundary count, and rejected V8/Wasm/native targets for the norm-form,
candidate-enumeration, and small-matrix regions.

This item has no direct speed claim. Its purpose is to prevent speculative
compiler work from being justified by language labels rather than measured
regions.

## Rejected shortcuts

- The present generic generated-JavaScript candidate kernel is about 26 times
  slower call-only than the native target on this bounded input. V8 needs a
  different proved representation, not merely a different dispatch choice.
- Retaining every HNF support row avoided deletion trials on one field but
  increased later proof/presentation work and regressed another field.
- Replacing the compact packed-factor materializer with the independent public
  materializer was 5--8% slower.
- Adding another handwritten native scalar kernel is not justified: the
  measured native kernel bodies are already sub-millisecond. The expensive
  boundaries are state conversion and repeated exact object/proof work.

## Required acceptance evidence

Every implementation should retain the same three fields, both proof modes,
O0/O2 differential results, native and generated-JavaScript fallbacks, exact
class number and presentation, proof status, cancellation behavior, and
detached replay. Performance evidence must include whole public scalar time,
boundary counts and copied bytes, not only the optimized inner loop. Broader
acceptance remains the pinned 10-field cubic smoke corpus followed by the
100-field stratified corpus.
