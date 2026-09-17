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

The next checkpoint adds the corresponding emitter/runtime fragment.
It can emit only while the structural authority verifies.  Private stores keep
all range/capacity checks but defer spare clearing; one canonicalizer clears
the dirty interval before every boundary named by the claim, on failure, and
before publication.  The ordinary public GMP/FLINT setters are unchanged.
Focused probes cover poisoned spare limbs, big-to-small-to-zero history,
post-canonicalization raw-hash equality, revoked authority, every escape label,
and continued full clearing in the standard public path.

## Authority-wired fused result

The retained compiler path now consumes the proof inside `generateHostCore`.
It propagates ownership through renamed parameters in the complete reachable
call graph, registers only the root buffers named by the authenticated claim,
and makes the ordinary GMP/FLINT setters skip spare clearing only when their
buffer is currently registered.  All unregistered or rejected paths generate
the same canonical setter source as before.  Root success and failure both run
the canonicalizer before publication.  The emitted host-core audit records the
root, buffers, authority version, publication rule, and escape boundaries.

One bounded fused build/profile used the pinned input SHA-256
`22a997866388571cd3c12e1a3ea5c5cc3a7fe89217b253bb0e779007f6fe9b77`
and granted authority only to `prep_kummer_catalog_tau`.  This is the real
compiler path, not the earlier generated-C no-clear substitution.  The
uninstrumented generated core hash is
`fbdec56981b2795c06a71bc1027b1b5b87d970387cad2c91db047b013028089b`;
the timing-instrumented core is
`3b9b29b3072b3b3ccc6d3880f620ed71265450ac25c4e3ed3f26156646bfcb8f`,
and the 13,638,504-byte addon is
`42129744a234327af62eb3b9382e6d6b57e78c6ec023bbb26537209426a412af`.
The one-job build completed in 333 seconds and peaked at 2,441,448 KiB
aggregate process-tree RSS.  A profile-only child then completed in 5 seconds
at 1,006,424 KiB peak aggregate RSS.

Preparation fell from the frozen 1,845,356,805 ns baseline to 1,532,522,604 ns,
a 16.95% improvement.  The inclusive root fell from 2,753,604,486 ns to
2,381,579,814 ns, a 13.51% improvement.  All 1,188 tracked writes now report
zero capacity words cleared while preserving 582 logical words written.  The
eight stage timers close exactly to the inclusive interval and the external
timer closes at 99.990%.  This exceeds the predeclared 10% phase-retention
threshold.

The relation, compact, combined-owner, and terminal-RNG hashes remain exactly
`b0c647186a5fed5317c7135ccf16623a930631382ad7963e12af4ded2db7259a`,
`80cec2acce5b95ec48beff67b800410eedb5e580e25029aa79d4d63dc40b1c2d`,
`a0ae8b44555295c035a3603ce4c18dde8dd174bff80b79d34f61d86423a13b5e`,
and `9b90d634807d362bf99925a13ecb99eb54b867a16f9f3acb335fffcf085e401b`.
Every frozen relation counter, root word, and p192 `getfu` word agrees, and
`public_complete` remains false.  Focused generated-C tests additionally prove
canonical cleanup on both success and failure, poisoned big-to-small-to-zero
history, post-canonicalization raw-hash equality, and byte-identical standard
public behavior when authority is absent or revoked.

Two admission failures preceded the qualified profile and are not mathematical
failures.  The first timer injection split an unbraced generated conditional;
the corrected 100 MB C source passed `cc -std=gnu11 -fsyntax-only` before the
retry.  The retry built successfully, but an extra 4 GiB *virtual-address*
`prlimit` prevented V8 from allocating the packed input despite resident RSS
remaining below the aggregate cap.  The authorized profile-only child reused
the exact built addon under the 4 GiB aggregate-RSS monitor without that
incompatible virtual-address restriction.
