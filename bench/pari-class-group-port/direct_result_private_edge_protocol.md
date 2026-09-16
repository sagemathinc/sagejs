# Protocol: direct-result private copy edge

## Question

Can the checked-region compiler replace proved private calls to
`int64_pari_flx_copy` with one infallible scalar-returning core, while retaining
the ordinary checked function for every public or unproved call, and thereby
reduce real machine work without repeating Stage F's code-shape regression?

This protocol freezes the answer before the implementation fixes its symbol
name. The eventual report must bind the actual symbol and record every command
below; no acceptance criterion may be relaxed after timing.

## Frozen workload and controls

The only admissible catalog fixture is the raw file:

```text
/tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json
sha256 f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
```

It contains four packets. Packet zero has 7,081 active outputs and is the timed
packet. The frozen baseline build input is:

```text
/tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented
```

For protocol development, these compiler-`670dda553` artifacts remain useful
immutable references:

```text
Stage E  /tmp/sagejs-stage-a-catalog-ag3Jht
         core sha256 04923fbaef0dd5f2b67aedbd3d016ef2c54e26d0ebaab65032224955f1804853
Stage F  /tmp/sagejs-stage-a-catalog-2sJXqU
         core sha256 fb1d6667be87a3e741b8a43ef36f25944a8c8dc631143c131b81ee8a0e7c4c37
```

Stage F is a negative control, not a performance baseline: it removes five
generated checks but is 1.126--1.128 times slower after introducing a wrapper,
a second body, 5,534 object-text bytes, two surviving private symbols, and eight
call instructions.

The final experiment must rebuild Stage D, Stage E, and the direct-result
candidate from the *same clean compiler commit*. Historical Stage-D/E artifacts
may orient debugging but cannot establish the causal ratio.

Two external numbers are orientation only:

- same-algorithm fixed-storage C ceiling: about **1.39 ms/catalog**;
- matched PARI 2.17.4 output-contract control: about **2.03 ms/catalog**.

They are earlier shared-host measurements, not arms in the same alternating
process. Report candidate/C and candidate/PARI ratios, but never present those
ratios as same-run measurements.

## Required construction

Build all three compiler arms from one commit with the existing driver. Until
the candidate mode is named below as `stage-g`, substitute its final mode name
without changing any other argument:

```bash
FIXTURE=/tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json
BASE=/tmp/sagejs-view-proof-catalog-aGpIpX/no-proof-instrumented
COMPILER=/home/user/sagejs-worktrees/virtual-u64-fixed-views
DRIVER=bench/pari-class-group-port/check_stage_a_catalog_region.cjs

test "$(sha256sum "$FIXTURE" | cut -d' ' -f1)" = \
  f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
test -z "$(git -C "$COMPILER" status --porcelain)"
git -C "$COMPILER" rev-parse HEAD

node "$DRIVER" "$FIXTURE" "$BASE" "$COMPILER" stage-d > /tmp/direct-stage-d.json
node "$DRIVER" "$FIXTURE" "$BASE" "$COMPILER" stage-e > /tmp/direct-stage-e.json
node "$DRIVER" "$FIXTURE" "$BASE" "$COMPILER" stage-g > /tmp/direct-stage-g.json
```

Record the exact compiler commit, clean status, output directories, generated
core hashes, binding hash, addon hash, and compiler flags. Reject the evidence
if any arm reports a different compiler identity or fixture digest.

## Semantic gates

### Complete catalog replay

Use the independent harness, relabeling its first comparison arm as Stage E in
the report:

```bash
node bench/pari-class-group-port/benchmark_virtualized_fixed_views.cjs \
  "$FIXTURE" STAGE_E_DIRECTORY CANDIDATE_DIRECTORY
```

Before timing, this must pass:

1. four packets under each of JavaScript, GMP, and tagged execution: 12 valid
   comparisons;
2. exact outcome and every post-call buffer in every comparison;
3. the tagged result against the frozen oracle, including all 7,081 active
   packet-zero outputs; and
4. nine malformed catalog cases under all three backends: 27 comparisons.

The malformed cases are short state, bad degree, short coefficients, short
primes, short word workspace, short output, nonmonic polynomial, invalid prime,
and oversized prime. Match return value or exception name/message and every
post-call buffer.

### Public copy fallback

The ordinary exported `int64_pari_flx_copy` remains checked and must be
differentially replayed against Stage E through JavaScript, GMP, and tagged
backends. Cover:

- `da` at `-2, -1, 0, 1, 3, 8, 9`;
- valid and invalid source and destination nine-word spans;
- `out < a`, `out == a`, and `out > a`;
- left overlap, right overlap, exact overlap, and disjoint spans; and
- buffers whose contents make copy direction observable.

For every case compare outcome, error text, and the complete buffer. This test
is outside the catalog timer. The direct private core must not become host
callable.

## Structural proof gates

The actual direct-core symbol remains a parameter, written below as
`DIRECT_SYMBOL`. Acceptance requires all of the following:

1. **One core.** Exactly one private direct-result copy core is emitted. There
   is no `__local_fast_0` clone and no per-call degree/span dispatch wrapper.
2. **Direct ABI.** The core returns the scalar result directly. Its prototype
   and definition have no `sagejs_native_status *` and no output pointer. The
   buffer pair, `a`, `da`, and `out` fit in the ordinary scalar/buffer ABI.
3. **No reachable failure.** The direct body contains no status setter, error
   return, signed buffer-index helper, view/bounds failure text, checked
   arithmetic helper, raise, division failure, resource acquisition, or FFI
   operation. Its three range latches and both `da + 1` expressions must carry
   authenticated no-overflow authority in reconstructed IR.
4. **Proof provenance.** Every removed view access is backed by structural
   authority reconstructed after IR loading. Mutating any degree, span, range,
   owner, or step premise must revoke direct eligibility and restore the
   checked call.
5. **Eligible edges are direct.** Rewritten private callers invoke the direct
   core with no status/output temporary, status branch, or runtime guard.
6. **Ineligible edges stay checked.** Any edge that lacks the complete proof
   still invokes the unchanged checked source implementation. Public exports
   and malformed entry dispatch remain unchanged.
7. **Aliasing is preserved.** Neither IR nor C may claim `restrict`,
   disjointness, or `memcpy` semantics. The `out > a` direction remains the
   memmove-safe descending copy.

The candidate build driver must fail closed on these properties once the
symbol/metadata spelling is fixed. A source-text count alone is not sufficient:
also inspect the reconstructed prepared IR and the emitted prototype/body.

## Machine-shape gates

Set paths from each build JSON and bind the final symbol:

```bash
E_OBJ=STAGE_E_DIRECTORY/build/Release/obj.target/sagejs_native_kernel/kernel.o
G_OBJ=CANDIDATE_DIRECTORY/build/Release/obj.target/sagejs_native_kernel/kernel.o
E_ADDON=STAGE_E_DIRECTORY/build/Release/sagejs_native_kernel.node
G_ADDON=CANDIDATE_DIRECTORY/build/Release/sagejs_native_kernel.node
DIRECT_SYMBOL=THE_FINAL_DIRECT_CORE_SYMBOL

size "$E_OBJ" "$G_OBJ" "$E_ADDON" "$G_ADDON"
nm -S --size-sort "$E_OBJ" > /tmp/direct-stage-e.nm
nm -S --size-sort "$G_OBJ" > /tmp/direct-stage-g.nm
objdump -dr "$E_OBJ" > /tmp/direct-stage-e.objdump
objdump -dr "$G_OBJ" > /tmp/direct-stage-g.objdump
objdump -dr --disassemble="$DIRECT_SYMBOL" "$G_OBJ" \
  > /tmp/direct-core.objdump
```

Record:

- generated core, private-core, adapter, object text, linked ELF text, and
  addon bytes;
- every surviving `tagged_sagejs_checked_r0_*` and direct-result symbol with
  its size;
- total object and linked-addon call instructions;
- PC-relative relocations to the checked copy, direct core, ordinary fallback,
  and every newly surviving private helper; and
- callers containing each relevant relocation.

Commands for the count portion are:

```bash
objdump -d "$E_OBJ" | rg -c '\bcall\s'
objdump -d "$G_OBJ" | rg -c '\bcall\s'
objdump -d "$E_ADDON" | rg -c '\bcall\s'
objdump -d "$G_ADDON" | rg -c '\bcall\s'

objdump -r "$E_OBJ" | rg 'int64_pari_flx_copy|DIRECT_SYMBOL'
objdump -r "$G_OBJ" | rg 'int64_pari_flx_copy|DIRECT_SYMBOL'
```

Replace `DIRECT_SYMBOL` in the last expressions with its escaped actual name;
do not literally search the placeholder.

The candidate passes the machine gate only if:

1. relevant checked-copy/status relocations decrease;
2. total copy-related relocations do not increase;
3. total call instructions do not increase;
4. combined bytes for the direct core plus any new copy wrappers/clones do not
   exceed the Stage-E checked-copy body; and
5. object and ELF text do not grow. Any unrelated newly surviving private
   symbol is a hard stop requiring an inlining explanation before timing.

These gates deliberately reject the Stage-F shape before spending a timing
campaign on it.

## Timing protocol

Only after all semantic, structural, and machine gates pass, run two isolated
fresh Node processes. Each invocation performs three warmup rounds followed by
seven alternating Stage-E/candidate pairs. Each arm calibrates independently
to a 1,200 ms target, and every retained batch must be at least 900 ms:

```bash
node bench/pari-class-group-port/benchmark_virtualized_fixed_views.cjs \
  "$FIXTURE" STAGE_E_DIRECTORY CANDIDATE_DIRECTORY \
  > /tmp/direct-result-run-1.json

node bench/pari-class-group-port/benchmark_virtualized_fixed_views.cjs \
  "$FIXTURE" STAGE_E_DIRECTORY CANDIDATE_DIRECTORY \
  > /tmp/direct-result-run-2.json
```

Do not run the two processes concurrently. Packing, build work, result
assertions, and process startup remain outside the timed boundary. Preserve all
14 per-arm observations in the permanent report; do not report only a pooled
number.

The causal performance gate is:

- candidate/Stage-E is below `1.0` in both fresh processes;
- the pooled geometric ratio is at most `0.99`; and
- no retained candidate batch is more than 1% slower than its paired Stage-E
  batch without an explained host outlier and a complete fresh rerun.

A smaller improvement is evidence about the mechanism but not enough to adopt
this code shape as a performance optimization. A regression rejects the shape;
it does not justify broadening the proof or hiding the comparison.

Also build Stage D from the same compiler tip and report candidate/Stage-D.
Stage D is a regression reference, not the primary causal arm, because the
direct-result change is layered on Stage E.

## External orientation and gap closure

For each isolated candidate geometric mean `G`, report:

```text
ratio to historical PARI = G / 2.03
ratio to mechanical C     = G / 1.39
fraction of E-to-C gap closed = (E - G) / (E - 1.39)
```

Interpret the milestones explicitly:

- `G <= 2.03 ms`: reaches the historical matched PARI control;
- `G <= 1.529 ms`: within 10% of the mechanical-C ceiling;
- `G <= 1.4595 ms`: within 5% of that ceiling;
- `G <= 1.39 ms`: reaches or exceeds the diagnostic ceiling.

An isolated direct-copy change is expected to close only part of the remaining
gap. Failing to reach PARI or C is not by itself rejection if the same-tip
causal and machine-shape gates pass. Conversely, an apparent external milestone
does not rescue a same-tip regression.

## Decision table

| Result | Decision |
| --- | --- |
| Semantic or proof gate fails | Reject; fix correctness/proof before any timing |
| Machine shape grows or calls increase | Reject current emission shape; do not optimize around it |
| Correct and smaller, but pooled ratio above 0.99 | Record mechanism; do not adopt as a performance win |
| Correct, machine gates pass, both runs improve, pooled ratio at most 0.99 | Accept direct-result edge mechanism for this graph |
| Win depends on global unsafe flags or handwritten name-specific C | Reject as compiler evidence |

The final report must distinguish a reusable compiler mechanism from this one
copy helper. Eligibility is derived from failure/effect summaries and proof
authority, never from a PARI function name.
