# H1 preparation authenticated-shape experiment

## Verdict

Hypothesis 1 is strongly supported, but the obvious global implementation is
not safe to release.  The retained branch contains measurement machinery and
evidence only; it does not change the public compiler/runtime behavior.

Among the five largest authenticated integer buffers, four are untouched during
preparation.  `prep_kummer_catalog_tau` performs 582 logical-word reads and 582
logical-word writes, but its 1,188 exact stores clear 4,866,048 capacity words.
This is capacity-scaled work, not logical-length-scaled work.

Reducing only that authenticated buffer's capacity from 4096 words per slot to
one word improved preparation from 1.845 s to 1.460 s (20.91%).  A diagnostic
generated-C control that skipped spare-limb clearing improved preparation to
0.158 s (91.43%) and the inclusive root from 2.754 s to 0.283 s (89.71%).  All
three executions produced identical frozen relation, compact, owner, terminal
RNG, root, and p192 `getfu` evidence.  These are one-sample diagnostic profiles,
not a timing qualification series.

## Why the global correction was rejected

The public packed-IntegerBuffer ABI requires unused limbs to be zero.  Raw
canonical buffer equality and resumable evidence may observe or hash spare
limbs, and the JavaScript and Wasm backends clear them.  Removing the clear from
the global GMP/FLINT setters would therefore create cross-backend and public ABI
divergence even though ordinary numerical reads use `sizes[position]`.

The provisional global `c-backend.cjs` edit and its test change were reverted
before commit.

## Narrow safe design

Introduce a compiler-owned **private noncanonical IntegerBuffer region**, not a
new public buffer representation:

1. The checked public wrapper validates canonical input once.  A private-graph
   proof may grant `sizes` authority only to owned, non-escaping buffers whose
   aliases remain inside the compiled root.
2. Stores in that region write only the actual limbs and authoritative signed
   size.  Capacity/range checks remain unchanged.  Any unknown call, exported
   view, raw-limb access, alias escape, or fallback boundary revokes the proof.
3. Before a buffer crosses a public/output, raw-hash, resumable-state, JS/Wasm,
   or foreign-library boundary, generated canonicalization clears only the
   newly spare interval (or all spare limbs for the initial implementation).
4. Failure remains atomic: canonical public owners are not published until the
   private root succeeds and canonicalization completes.  Dynamic fallback and
   all unproved calls retain today's fully clearing setter.
5. Differential tests must poison spare limbs, exercise shrink/grow/zero and
   negative values, force every revocation boundary, and compare full raw
   buffers across GMP, FLINT, JavaScript, and Wasm—not merely logical values.

This contract is general and source-transparent, and the measured H1 root is a
legitimate first consumer.  It should be implemented as a separate compiler
campaign rather than smuggling noncanonical storage through the existing public
`IntegerBuffer` ABI.

The follow-up source checkpoint adds the first fail-closed portion of that
campaign in `private-integer-buffer-authority.cjs`: a complete private graph is
structurally authenticated, while raw-limb access, an unknown call, alias
escape, fallback, or any subsequent graph mutation revokes authority.  Its
claim names every mandatory canonicalization boundary and atomic publication
rule.  It intentionally emits no no-clear code yet; emission must wait until a
reviewed canonicalizer can consume this authority.  Thus this checkpoint cannot
weaken public behavior even if used incorrectly.

The next checkpoint adds the corresponding dormant emitter/runtime fragment.
It can emit only while the structural authority verifies.  Private stores keep
all range/capacity checks but defer spare clearing; one canonicalizer clears
the dirty interval before every boundary named by the claim, on failure, and
before publication.  The ordinary public GMP/FLINT setters are unchanged.
Focused probes cover poisoned spare limbs, big-to-small-to-zero history,
post-canonicalization raw-hash equality, revoked authority, every escape label,
and continued full clearing in the standard public path.  Wiring this fragment
into H1 remains a separate reviewed step; no fused artifact was rebuilt.
