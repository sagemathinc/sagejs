# Precision-resource graph bridge audit

## Question and conclusion

The Phase-4 plan asks whether the current native compiler can retain exact
relation/HNF owners while rebuilding precision-dependent Arb state for unit
lattice reduction and `getfu`. A minimal cross-module probe on integration
commit `944a12911` shows that the required mechanism already exists. No
compiler, FFI declaration, native adapter, or ownership change is justified by
this boundary.

The reusable pattern is:

1. keep arbitrary-precision exact state in caller-owned `FmpzMatrix` roots;
2. keep one caller-owned precision scratch root and a distinct published root;
3. invoke an imported native leaf that calls the declared resident Arb adapter;
4. overwrite only precision scratch on every attempt;
5. revalidate retained exact state; and
6. copy the accepted active prefix to published state only after success.

That is sufficient for the current cubic path. Its unit-lattice and `getfu`
translation uses exact `IntegerBuffer` triples plus checked `Float64Buffer`
scratch; it does not currently require a live `RealNumberBuffer` or
`ComplexNumberBuffer` to coexist with the FMPZ graph. General complex-signature
work may later justify a separate probe, but it is not evidence for changing
this boundary now.

## Existing declared resources

The generated FLINT declaration already provides all required ownership
semantics:

- `FmpzMatrix` is an owned, variable-size exact resource with checked public
  borrowing and deterministic close;
- `positive_rational_log_balls_resource` borrows mutable output and immutable
  numerator/denominator roots, validates aliases, dimensions, active entries,
  count, and precision, and exports outward dyadic endpoints;
- `integer_log_sqrt_balls_prefix_resource` provides the analogous logical-prefix
  operation used by the production cubic class-number graph; and
- Arb objects are lexical implementation details of those adapters. No Arb
  pointer or host object escapes the isolated call.

The declaration and its adapter already permit the same exact root to survive
multiple calls with different precision. Recreating a persistent Arb owner
would add a lifetime problem that this interface intentionally avoids.

## Minimal composed graph

[`precision_resource_graph_leaf.py`](precision_resource_graph_leaf.py) contains
two imported native leaves. One reads an unbounded exact matrix; the other
rebuilds rigorous positive-rational log endpoints through the declared Arb
operation. [`precision_resource_graph_bridge.py`](precision_resource_graph_bridge.py)
connects them under one native root and forces a 32-bit attempt followed by a
128-bit retry. The exact owner contains entries beyond 64 bits, so the test does
not accidentally reduce the question to bounded machine storage.

The emitted isolated core contains
`sagejs_flint_positive_rational_log_balls_resource`, all three imported/root
functions occur in IR, and the core contains no Node-API, V8, Python, or host
callback. Imported resource identity therefore survives native call-graph
cloning; the bridge is ordinary typed Python rather than handwritten C.

## Differential and failure evidence

`check_precision_resource_graph_bridge.cjs` exercises generated JavaScript,
GMP, and native automatic execution. All three agree entry-for-entry on:

- the six retained exact entries;
- the 128-bit dyadic Arb endpoint matrix;
- the selected precision and attempt count; and
- the failed-retry and alias-rejection publication state.

An independent CPython `decimal` oracle at 160 decimal digits verifies that all
three published intervals enclose `log(1)`, `log(4)`, and `log(1/4)`; the first
interval is exactly zero. The successful bridge reads the exact owner before
and after both Arb calls and obtains the same arbitrary-precision checksum.

Two negative schedules prove the transactional cut:

- a retry at invalid precision 5000 fails after the first scratch attempt but
  leaves exact, published, and diagnostic roots unchanged; and
- aliasing scratch with the numerator root is rejected before publication and
  likewise leaves exact, published, and diagnostic roots unchanged.

The scratch root is intentionally allowed to change on a failed retry. It is
private attempt state, not published mathematical state, and may be overwritten
on the next retry.

## Integration guidance

The exact relation/HNF owner should remain authoritative across a return to the
driver. A precision restart needs only a fresh or reusable precision scratch
root plus a separate publication root. The driver should pass the new precision
and rerun the imported precision leaf; it should not reconstruct accepted exact
relations, expose an Arb owner, or add a general borrow-checking language
feature.

This audit does **not** claim that the current class-group driver already wires
the unit suffix end to end, that every complex-signature numeric operation has a
declared adapter, or that a failed multi-stage computation is automatically
transactional. Atomicity remains an algorithm-level scratch-then-publish
discipline, demonstrated here at the smallest relevant cut.

An authentic `bnfnewprec` trace discovered after this probe requires 2176- and
2240-bit logs, with at least 2304 working bits for the 2240-bit exponential.
That does not change the ownership conclusion: the declared Arb endpoint
resource accepts precision through 4096. It does expose a separate coordinated
capacity task in the translated `getfu` arithmetic. Its current dependent caps
range from 1856 through 2048 bits across regulator, division, square root,
modular `log(2)`, the `log(2)` constant, product/sum/resize, integer-real
conversion, and exponential workspaces. This lane deliberately does not lift
one validator in isolation. The unit/precision owner must widen all dependent
resources together and add a forced 2240-bit retry with at least 2304-bit
working-precision evidence.
