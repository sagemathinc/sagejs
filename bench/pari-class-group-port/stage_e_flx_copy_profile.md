# Stage-E `int64_pari_flx_copy` profile

Date: 2026-09-16

This report profiles the first copy helper exposed by fixed `UInt64Buffer`
view virtualization.  It distinguishes source checks from the machine work
that survives GCC `-O3`, and tests whether a local checked specialization is a
better next step than propagating the region's existing facts through the
whole call.

## Frozen inputs

- Compiler: `2d22ea208d7b1eaf6a77c17c2b495d7b1757f741`.
- Stage-E native artifact: `/tmp/sagejs-stage-a-catalog-aFllaE`.
- Generated `kernel_core.c` SHA-256:
  `04923fbaef0dd5f2b67aedbd3d016ef2c54e26d0ebaab65032224955f1804853`.
- Fixture: `/tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json`.
- Fixture SHA-256:
  `f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312`.
- Boundary: packet zero at the tagged catalog entry; packing and assertions
  are excluded.
- Compiler flags remain the generated artifact's ordinary GCC `-O3` flags.

Every timing candidate was checked on all four frozen packets through the
JavaScript, GMP, and tagged backends and on the malformed-input panel.  Timing
uses three warmup rounds and seven alternating pairs with at least 900 ms per
retained batch.  The two important candidates were repeated in a fresh Node
process, giving 14 alternating pairs each.

## Exact dynamic counts

Instrumentation at the private copy entry and at its provenance operations
gives these packet-zero counts:

| Quantity | Count |
| --- | ---: |
| Calls | 55,903 |
| Descending calls (`out > a`) | 43,036 |
| Ascending calls | 12,867 |
| Calls with actual source/destination overlap | 0 |
| Degree `-1` | 1,644 |
| Degree `0` | 5,390 |
| Degree `1` | 12,158 |
| Degree `2` | 29,043 |
| Degree `3` | 7,668 |
| Degree outside `[-1, 3]` | 0 |
| Copied coefficients | 147,507 |
| Tail zero stores | 355,620 |

Consequently the function constructs 111,806 virtual views, performs 650,634
logical view accesses, and executes 503,127 loop iterations.  Counting source
proof obligations gives 1,222,531 dynamic checks: five logical-index sites
(650,634), three checked loop-latch additions (503,127), and two `da + 1`
sites (68,770).  That number is deliberately **not** a machine-branch count.

## What survives compilation

Disassembly of
`build/Release/obj.target/sagejs_native_kernel/kernel.o`, section
`.text.hot.tagged_sagejs_checked_r0_int64_pari_flx_copy`, shows:

- The private copy body is 660 bytes (`0x294`).
- The two view constructions retain six failure branches per call in total,
  plus pointer selection and adjustment.
- GCC unrolls the coefficient loops.  Descending logical bounds become one
  negative-degree test and one `da <= 8` comparison; ascending logical bounds
  become a degree dispatch.  They are not two helper calls per coefficient.
- The tail still tests the signed index on each of its 355,620 iterations.
- The three checked loop latches compile to raw `add`/`lea`; there is no
  per-iteration overflow branch.
- One `da + 1` overflow `jo` survives on the ascending path.  The other is
  commoned/proved into a raw `lea`.
- There are 23 static out-of-line relocations to the copy symbol: 20 in the
  `flx_small_ddf` constant-propagated body and three in `flx_small_degfact`.
  The status/output ABI also requires a stack-passed seventh argument, an
  output spill/load, and a status test around retained calls.

Thus source-check counts substantially overstate actual machine checks.  In
particular, deleting latch checks cannot remove half a million overflow
branches because GCC already removed them.

## Controlled transformations

These are generated-C diagnostics, not proposed handwritten production code.
The unsafe variants define a proof ceiling: they preserve the original loop
shape but assume the region facts rather than retaining the dynamic fallback.

| Variant | Candidate/baseline | Effect | Copy bytes | ELF text delta |
| --- | ---: | ---: | ---: | ---: |
| View checks only, unsafe | 1.03468 | 3.47% slower | 508 | -1,248 |
| Logical bounds only, unsafe | 0.98671 | 1.33% faster | 639 | -374 |
| Loop latches only, unsafe | 0.99277 | 0.72% faster | 665 | -64 |
| `da + 1` only, unsafe | 1.00708 | 0.71% slower | 692 | +384 |
| Per-access guarded logical bounds | 0.99115 pooled | 0.89% faster | 1,176 | +5,386 |
| All copy checks, original shape, unsafe | 0.96674 pooled | **3.33% faster** | 288 | -3,280 |

The checked local specialization retains exact behavior by using direct
indices only when `-1 <= da <= 8`, otherwise executing the original signed
index helper.  Its first seven-pair run was 1.034% faster, but the fresh repeat
was only 0.735% faster.  Their pooled geometric ratio is 0.99115.  The code
growth is also substantial, and static copy relocations rise from 23 to 24.

The whole original-shape proof ceiling is stable: its first run was 3.722%
faster and its fresh repeat was 2.929% faster, for a pooled geometric ratio of
0.96674.  It reduces the copy body from 660 to 288 bytes, the static copy
relocations from 23 to 20, and total ELF text by 3,280 bytes.

A naive function-level fast wrapper with raw loops and a fully checked fallback
was rejected: GCC vectorized and duplicated the loops, growing code by roughly
6--8 KiB and slowing the catalog by roughly 14--15% whether or not the fallback
was marked cold.

## Conclusion

The best first experiment is **whole-call fact propagation while preserving
the generated loop shape**, not a local checked fast-path clone.  The region
already knows the two nine-word spans and the degree interval.  Propagating
those facts through `int64_pari_flx_copy` can jointly remove view validation,
logical index scaffolding, redundant arithmetic/status paths, and eventually
retained status/output ABI calls.  The measured ceiling is a robust 3.33% at
smaller code size.

Local checked specialization is possible and exact, but the tested form does
not outperform whole-call propagation: it has a sub-1% pooled win and severe
code growth.  It is useful only as evidence that an interval-view proof can be
consumed locally; it should not itself become the emitter policy.

The production mechanism should be generic, based on proven fixed-span views,
scalar intervals, and infallible-call summaries.  It must not select this
function by its PARI name.
