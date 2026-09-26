# Stage-F copy code-shape matrix

Date: 2026-09-16

## Decision

The smallest useful generic emission policy is now clear:

- inline only the small proof guard and dispatcher;
- keep a nontrivial private fast clone out of line;
- keep the ordinary checked fallback out of line, and optionally cold;
- do not ask GCC to choose independently whether to clone either complete body
  into the dispatcher or its callers.

On the exact Stage-F artifact this policy reduces the copy dispatcher from
1,512 bytes to 21 bytes, reduces linked ELF text by 8,418 bytes, and improves
the catalog boundary by 5.68% relative to unchanged Stage F. A direct paired
comparison against the next-best shape confirms a 3.61% improvement.

This is useful compiler evidence, but it is **not Stage-F completion**. The
winner remains 6.79% slower than Stage D. Attribute-only layout changes halve
the original regression but do not recover it. Stage F therefore remains
rejected as an integration candidate until private proved call edges avoid the
runtime dispatcher and checked status/output ABI.

## Frozen identities

- Compiler: `670dda5539173ab937a47dffb5c150466b39aa38`.
- Stage-D-harness / Stage-E phase control: generated-core SHA-256
  `04923fbaef0dd5f2b67aedbd3d016ef2c54e26d0ebaab65032224955f1804853`.
- Stage F source: generated-core SHA-256
  `fb1d6667be87a3e741b8a43ef36f25944a8c8dc631143c131b81ee8a0e7c4c37`.
- Fixture SHA-256:
  `f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312`.

Every candidate is a disposable mechanical transformation of the same
generated Stage-F C source. The build retains the generated `-O3` flags. The
only diagnostic rebuild difference was `-fopt-info-inline-all`; that rebuild
matched the corresponding symbol and linked-code layout.

## Shapes tested

The experiment holds the Python source, compiler proofs, wrapper guard,
checked fallback behavior, outputs, and build flags constant. It changes only
the generated C presentation of the copy wrapper and its local fast clone.

1. **Current**: both wrapper and fast clone use the existing hot-inline macro.
2. **Always-inline fast**: the fast clone is `always_inline`; no standalone
   fast symbol survives.
3. **No-inline fast**: the fast clone is `noinline`; GCC remains free to inline
   the ordinary checked fallback into the wrapper.
4. **No-inline fast, tiny wrapper**: both substantial callees are `noinline`,
   leaving an inlineable guard and two tail calls.
5. **No-inline wrapper**: the wrapper is `noinline`; GCC fuses the fast body
   into it.
6. **Syntactically fused**: the generated fast body is placed directly in the
   wrapper source and the standalone clone is removed.
7. **Likely true arm**: the current guard uses `__builtin_expect(..., 1)`.
8. **No-inline fast, cold false arm**: the winning small-dispatch shape also
   marks the checked fallback `cold`.

These are code-shape probes, not proposed handwritten C implementations. The
policy must be selected from generic body size, call-graph, proof, and effect
facts rather than from `int64_pari_flx_copy`'s name.

## Correctness replay

Before retaining timing, every candidate passed:

- four frozen packets under JavaScript, GMP, and tagged backends: 12 valid
  comparisons;
- all 7,081 active tagged outputs and every post-call buffer;
- nine malformed packets under all three backends: 27 comparisons.

The malformed cases cover short state, bad degree, short coefficients, short
primes, short word workspace, short output, nonmonic input, invalid prime, and
oversized prime. Results, exception names/messages, and mutated buffers matched
the unchanged Stage-F build.

## Complete matrix

Each isolated comparison used three warmups and seven alternating pairs,
targeted 1,200 ms per batch, and rejected batches shorter than 900 ms. The
ratio is candidate divided by its unchanged Stage-F arm from the same process.

| Shape | Checked fallback | Wrapper | Fast clone | Linked ELF text | Wrapper / fast relocations | Candidate mean | Candidate / current F |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Current Stage F | 660 B | 1,512 B | 421 B | 353,209 B | 22 / 1 | about 2.45 ms | 1.0000 |
| Always-inline fast | 660 B | 1,426 B | absent | 352,543 B | 24 / 0 | 2.575773 ms | 1.052544 |
| No-inline fast | 660 B | 592 B | 421 B | 348,319 B | 19 / 21 | 2.351369 ms | 0.955662 |
| No-inline fast, tiny wrapper | 660 B | **21 B** | 421 B | 344,791 B | 17 / 24 | **2.311393 ms** | **0.943218** |
| No-inline wrapper | 660 B | 1,512 B | absent | 347,103 B | 40 / 0 | 2.677270 ms | 1.095108 |
| Syntactically fused | 660 B | 1,433 B | absent | 351,879 B | 23 / 0 | 2.468353 ms | 1.010508 |
| Likely true arm | 660 B | 1,037 B | 421 B | 352,417 B | 19 / 1 | 2.603168 ms | 1.065475 |
| No-inline fast, cold false arm | 307 B | 19 B + 5 B cold | 421 B | **343,735 B** | 18 / 24 | 2.313628 ms | 0.945741 |

Relocation counts include calls from the surviving dispatcher and calls
created when GCC partially inlines the dispatcher into callers. They are code
shape evidence, not a dynamic call count.

The seven retained samples for the timing winner were:

```text
current F: 2.444697, 2.442974, 2.455029, 2.442936,
           2.445653, 2.454392, 2.468206 ms
tiny:      2.309897, 2.313516, 2.307731, 2.317952,
           2.310438, 2.310083, 2.310149 ms
```

The cold-fallback form is statistically equivalent to the winner. It saves a
further 1,056 bytes of linked text, but its measured 0.945741 ratio does not
justify a performance claim beyond the simpler tiny-wrapper result.

## Direct controls

The two most important conclusions were repeated without relying on separate
matrix processes.

### Tiny wrapper versus no-inline fast

| Arm | Geometric mean |
| --- | ---: |
| No-inline fast, 592-byte wrapper | 2.391876 ms |
| No-inline fast, 21-byte wrapper | 2.305413 ms |
| Ratio | **0.963852** |

Thus preventing fallback-body absorption improves the already useful
no-inline-fast shape by another 3.61%.

### Tiny wrapper versus Stage D

| Arm | Geometric mean |
| --- | ---: |
| Stage D | 2.180235 ms |
| Stage-F tiny wrapper | 2.328240 ms |
| F / D | **1.067885** |

The original Stage-F result was about 12.6–12.8% slower than Stage E/D-style
control code. The best attribute layout cuts that loss roughly in half but
still fails the no-regression gate.

The retained direct-control samples were:

```text
no-inline fast: 2.397942, 2.398671, 2.408233, 2.404895,
                2.401613, 2.372467, 2.359737 ms
tiny wrapper:   2.299560, 2.301552, 2.311175, 2.310571,
                2.307584, 2.304849, 2.302630 ms

Stage D:        2.177114, 2.169149, 2.168643, 2.182524,
                2.182520, 2.187456, 2.194361 ms
tiny wrapper:   2.314781, 2.317182, 2.318982, 2.326622,
                2.330816, 2.369237, 2.320518 ms
```

## Why GCC made the current shape expensive

The all-inline diagnostic makes the mechanism explicit. In the unchanged
shape GCC first clones the wrapper at several call sites, then absorbs one or
both substantial branches into those clones. Representative final decisions
report net growth of `+72` and `+181` internal size units per call.

With both substantial callees non-inline, the same dispatcher inlining reports
net growth `+11`. Its complete machine code is only a degree interval test and
two tail calls:

```asm
lea 1(%r9), %rax
cmp $9, %rax
jbe fast
jmp checked
```

This is why `always_inline`, syntactic fusion, wrapper `noinline`, and a branch
likelihood hint all lose: each leaves a large hot body at the wrong level of
the call graph. The result depends on semantic code shape, not merely on
whether one named function has an inline attribute.

## What remains after code-shape repair

The 421-byte fast clone still has the checked ABI:

```c
int fast(status *, int64_t *output, {data, length}, a, da, out)
```

On x86-64, `out` is stack-passed. Callers retain status tests and output
reloads, and the callee retains a frame. More importantly, the clone begins
with two complete nine-word view-span validations; those paths can still set
status and fail. It is therefore not yet an infallible private arithmetic
routine.

The next generic compiler step is not another attribute campaign:

1. propagate the two view-span facts and scalar interval facts through proved
   private call edges;
2. compute a failure-effect fixed point over call-graph strongly connected
   components;
3. for scalar-returning clones whose failure paths are all discharged, emit a
   direct-result private ABI and rewrite only proved edges to call it;
4. retain the current checked status/output ABI for public and unproved calls;
5. apply the measured tiny-dispatch/no-inline-body policy when a runtime guard
   remains necessary.

For copy, a direct private signature can return `da` in `rax` and pass the
buffer pieces plus `a`, `da`, and `out` in registers. That removes the status
pointer, output pointer, stack argument, status return test, and output reload.
This is the architectural work required to decide whether Stage F can become
a real improvement.

## Disposable reproduction notes

The frozen source artifacts used while collecting this report were:

```text
Stage-D harness control /tmp/sagejs-stage-a-catalog-ag3Jht
Stage F current         /tmp/sagejs-stage-a-catalog-2sJXqU
always-inline fast      /tmp/sagejs-stage-f-shape-always-inline-fast-uTZspt
no-inline fast          /tmp/sagejs-stage-f-shape-noinline-fast-ugXJsG
tiny wrapper            /tmp/sagejs-stage-f-shape-noinline-fast-tiny-AVxES6
no-inline wrapper       /tmp/sagejs-stage-f-shape-noinline-wrapper-J9Ofnq
syntactically fused     /tmp/sagejs-stage-f-shape-fused-wrapper-d4ciFz
likely true arm         /tmp/sagejs-stage-f-shape-likely-cold-false-tsRLG5
cold-fallback tiny      /tmp/sagejs-stage-f-shape-noinline-fast-cold-false-KrrpPC
```

These paths are disposable. Their generated-core hashes, in matrix order after
current Stage F, are:

```text
4eb8005eb8964baf4c5b4dfad722e694b6455d45d84560d88f4093e3e4e94716
c88d997a0edeeafbabe9b4dcd4d743a5420161ef8f0b02fd82890a69310ca56f
80cc7575bf8abf0106337a928ffea29afc21bec71f4962506f18448718389af2
40c77b20dbf608a3371aa371fa4f2882875a71f737ce1742b9033b54d445ea06
8b2bcdfd23f21c8a2e84687e56f7654beba535f512c3ebaa7cfdcf25b3bd9aca
8761de4f1829183f13dc49db7ccc27dccbd2d8890f63dfa247e71e72d62eef98
a96f96f03c32117024265f1ffae8a1b6d50b0ab1c0d8edb09f805b1b7ba3bfc4
```

Replay any two built artifacts with the committed harness:

```bash
node bench/pari-class-group-port/benchmark_virtualized_fixed_views.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  FIRST_BUILD_DIRECTORY SECOND_BUILD_DIRECTORY
```

The generator used only mechanical declaration/definition attribute changes,
one source-level body fusion, or one `__builtin_expect` wrapper change. No
Python, IR, proof, algorithm, or frozen input was changed.
