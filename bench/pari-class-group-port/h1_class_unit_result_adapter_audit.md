# H1 field-neutral result-adapter audit

## Scope

`h1_class_unit_result_adapter.cjs` adapts the internally complete real-cubic
H1 owner bundle for

```text
x^3 - 20018*x + 20034
```

to the immutable field-neutral
`class_unit_correspondence_result.cjs` contract. It is deliberately a narrow,
data-only adapter. It does not execute PARI, compile mathematical code, create
an owner-bundle authority, or create a final publication authority.

The result remains an upstream-assumed internal correspondence. It has class
number one, unit rank two, exact units and norms, order-two torsion, a rigorous
regulator enclosure, and equal-bound honesty evidence. It always records
`correspondence_complete=true` and `public_complete=false` as distinct facts.

## Not the matched flag-zero payload

This adapter is the stronger independent replay/certification-oriented
post-pass. It is **not** the matched `bnfinit(nf, 0)` workload:

- the matched PARI flag-zero record stops at 192-bit compact/log unit state;
- PARI reports no expanded fundamental units there;
- the Sage.js H1 replay retries to 2304 bits, expands exact units and relation
  words, and independently constructs a rigorous regulator enclosure; and
- none of that stronger post-pass work belongs in a flag-zero timing claim.

The neutral envelope retains an immutable `workload-boundary-evidence` owner
which says exactly this. A separate compact p192 correspondence control is
required for matched flag-zero comparison.

## Authority boundary

Submitted bytes never grant their own authority. The focused validation makes
two independent invocations of the existing live/native H1 producer.

1. The candidate invocation supplies the raw numeric owner bundle.
2. The existing detached CPython cold replay verifies its presentation, all 73
   principal relations, HNF/Smith transformations, exact units and norms,
   packed logarithms, regulator identities, torsion, assumptions, terminal
   state, and 811-cell atomic publication.
3. The exact units independently generate a rigorous
   `RegulatorEnclosure`; serialized known intervals are not accepted as input.
4. The live factor-base/preparation/class/relation counters independently pass
   `compose_h1_honesty_terminal`, producing the equal-bound source skip.
5. A second live/native invocation supplies the trusted raw owner bundle and
   repeats all three replays. A JavaScript canonical digest over this second
   raw native bundle and its proof receipts is the mathematical authority
   root. It is not a Python-generated expected result and is not derived from
   candidate bytes.
6. The injected synchronous replay capability accepts the candidate only when
   its complete evidence object equals that independently captured trusted
   object.

The adapter then seals the neutral result but returns only
`ready-for-out-of-band-publication-authority`. Publication requires a second
branded `ClassUnitCorrespondenceResult` authority. That authority compares
every retained `replay-*` owner and every material class/unit/torsion/proof
projection against the second native capture before the neutral publisher's
first assignment.

## Retained data

The envelope retains every logical prefix used by the existing H1 cold replay,
including field basis/tensor data, factor-base ideals and norms, relation
records and principal generators, HNF/Smith transformations, exact unit
provenance, packed logs/phases, retry states, torsion state, and terminal state.
The corresponding `replay-*` owners use canonical decimal integers and explicit
logical lengths and capacities.

The field-neutral projections additionally retain:

- the exact 8-by-8 class presentation and trivial invariant list;
- two exact power-basis units and their exact norms;
- the exact dyadic hull of the published packed regulator and determinant;
- the complete rigorous-regulator authority as canonical bytes;
- the exact torsion generator `-1`;
- the equal-bound honesty receipt as canonical bytes; and
- the matched-versus-post-pass workload distinction as canonical bytes.

The full rigorous authority is intentionally preserved even though it does not
prove unit saturation index one. The envelope therefore remains nonpublic.

## Transactional behavior and negative checks

The adapter verifies and seals into detached bytes before publication. The
neutral publisher verifies into another detached candidate before its first
assignment. Repeating publication of the same envelope is idempotent; a
different verified envelope conflicts without changing the current result.

The focused checker coordinates mutations of the class presentation, exact
units, torsion, cold-replay identity, honesty evidence, and rigorous regulator
evidence. It also reseals a changed neutral envelope with a fresh envelope hash
while retaining the independent mathematical replay. Each mutation is rejected.

## Qualification

The focused authentic check is Linux-x64-only and requires the frozen prepared,
analytic, and Kummer H1 fixtures plus an already-built integration runtime. It
performs no PARI call after the prepared boundary. Final receipt hashes are
recorded by the checker rather than embedded as acceptance constants.

### Runtime qualification attempts

The first isolated-runtime attempt stopped before mathematical replay because
the newly built root runtime did not contain the optional native MPC
dependencies. No authority receipt was retained.

The first attempt using the qualified integration runtime links reached native
kernel compilation but OpenBLAS aborted after ten allocation retries under the
4 GiB aggregate process-tree ceiling. It ran for 455.4 seconds, reached
2,395,640 KiB maximum per-process RSS and 3,715,920 KiB maximum aggregate tree
RSS, and retained no partial receipt. This is infrastructure evidence rather
than mathematical evidence. The corrected qualification pins OpenBLAS, OpenMP,
MKL, and BLIS to one thread while keeping the same runtime links and memory
ceiling.

The corrected thread-pinned attempt also stopped before mathematical replay:
OpenBLAS exhausted its allocation retries after 68.2 seconds even though the
aggregate tree reached only 1,422,240 KiB RSS (1,437,700 KiB maximum
per-process RSS). The run still inherited a 4 GiB virtual-address `ulimit`
inside the independently enforced 4 GiB aggregate-RSS supervisor. The low RSS
and unchanged OpenBLAS error isolate that extra address-space limit—not the
adapter evidence—as the remaining qualification blocker. No partial authority
receipt was retained.

The final infrastructure-corrected attempt retained the 4 GiB aggregate-RSS
monitor and all four one-thread backend settings but removed the unintended
virtual-address limit. It passed the OpenBLAS allocation point, confirming that
diagnosis, and then stopped after 79.2 seconds in the linked integration
runtime's Tree-sitter initialization with `table index is out of bounds`. Peak
aggregate RSS was 1,305,300 KiB. The linked compiler runtime was therefore not
a coherent immutable validation input while other integration work was active.
No mathematical replay ran and no partial authority receipt was retained. A
complete authentic receipt now requires one immutable, self-consistent runtime
containing both the compiled frontend and native MPC dependencies.

A subsequent archived-runtime preflight verified that the completed lane build
receipt and required compiler/frontend files were present, linked `dist` to
those lane-generated bytes, and retained only the integration lane's qualified
FLINT `.native` link. The cheap Tree-sitter parse did not start: Node resolved
the scratch-backed `dist` symlink to its physical archive directory and could
not resolve `web-tree-sitter` from that directory's module ancestry. In
accordance with the preflight gate, no heavy checker was started. A coherent
qualification environment must either restore a non-destructive copy of this
archived `dist` beneath the lane worktree or explicitly bind the lane's
`node_modules` during module resolution, then pass the same cheap preflight
before replay.

With the lane's `node_modules` bound explicitly through `NODE_PATH`, that cheap
Tree-sitter/frontend preflight passed against the archived compiler bytes. The
single authorized checker then stopped after 5.0 seconds, before native
compilation or mathematical replay, because `standalone-library.cjs` derives
the project root from the physical `dist` location and consequently searched
for `src/baselib/builtins.py` beside the scratch archive. Peak aggregate RSS
was only 310,924 KiB and no partial receipt was retained. Thus `NODE_PATH`
repairs dependency lookup but not source-relative runtime lookup; the immutable
archived `dist` must be non-destructively restored beneath the lane worktree
for an authentic qualification run.

The archived `dist` was then restored non-destructively beneath the lane
worktree: 174 MiB and 527 files were copied while the scratch archive remained
unchanged, and all 526 file bindings in its completed build receipt matched
their recorded lengths and SHA-256 hashes. The stronger parser plus
source-resolution preflight passed. The single authorized checker progressed
to the kernel worker and stopped after 103.8 seconds because
`packages/flint/build/Release/sagejs_flint.node` was absent from the lane.
Linking the qualified `.native` tree supplies MPC/FLINT libraries but does not
supply this direct Node addon. Peak aggregate RSS was 1,268,644 KiB; no
mathematical replay completed and no partial receipt was retained. The final
coherent-runtime prerequisite is therefore the corresponding qualified FLINT
`build` tree in addition to `.native`.

Finally, the exact 26,425,320-byte qualified FLINT addon was linked from the
known integration build (`sha256
00d9e9f219fc7e2da103838f69b8cbce6561abeb828e4e712efce8e11b4bc929`).
The addon loaded 819 exports, and the combined addon, parser, standalone
source-resolution, restored-dist, and receipt preflight passed. The single
authorized checker then stopped after 81.7 seconds during recursive native
source lowering: a subsequent Tree-sitter `Parser` initialization raised
`table index is out of bounds`. Peak aggregate RSS was 1,519,980 KiB. Because
the immutable compiler bytes, dependency tree, source tree, FLINT libraries,
and direct addon were all fixed and independently preflighted, the remaining
blocker is localized to compiler frontend lifecycle/reentrancy on the real
multi-module H1 call graph. No mathematical replay completed and no partial
authority receipt was retained.
