# Row-6 public cubic profile

This evidence profiles the optimized Linux row-6 public cubic path at commit
`f4199f4da0c0da6bc79d02950e6b5d71b7fb13ad`. The input is

```text
x^3 - 2000000000010*x + 2000000000018
```

The profiled release-test executable has SHA-256
`e98bbb11acda050d4a37dfbf3add727d974e0d96c101234366765c617c8d4c73`.
This digest, rather than the mutable `target/` pathname, identifies the exact
code that produced these results. Other lanes changed unrelated source files
after this executable was built, so rebuilding from the subsequently dirty
worktree is not an equivalent reproduction.

## Native result

The headline measurements are the internal stage clocks from a native run
pinned to Linux CPU 3:

| Stage | Time |
| --- | ---: |
| preparation | 310.079621 ms |
| relation collection | 2.722034818 s |
| candidate authentication | 2.098935397 s |
| unit and analytic completion | 979.604167 ms |
| total | 6.185608103 s |

The exact command was:

```sh
taskset -c 3 target/release/deps/compact_cubic_presentation-0fe3132291e345f8 \
  --exact row6_completes_conditionally_end_to_end_from_coefficients --nocapture
```

The run passed and returned class group invariant factors `[2, 2]` and class
number `4` through the assertions in the test.

## Profiler and commands

Linux hardware performance counters were unavailable: `perf` was not
installed and `/proc/sys/kernel/perf_event_paranoid` was `4`. Instruction-level
attribution therefore used Valgrind/Callgrind 3.25.1 with cache and branch
simulation disabled. Rust was `rustc 1.98.1 (48a229cea 2026-09-01)` with LLVM
22.1.8 on x86-64 Linux `7.0.0-1011-gcp`.

The authentication-boundary profile used:

```sh
taskset -c 3 /tmp/valgrind-build.jS6H6t/install/bin/valgrind \
  --tool=callgrind \
  --callgrind-out-file=/tmp/row6-f419-candidate-callgrind.out \
  --collect-jumps=yes --simulate-cache=no --branch-sim=no \
  --separate-threads=no \
  target/release/deps/compact_cubic_presentation-0fe3132291e345f8 \
  --exact row6_reaches_the_compact_authenticated_candidate_boundary_from_coefficients \
  --nocapture
```

The full profile used the same options, output file
`/tmp/row6-f419-full-callgrind.out`, and test
`row6_completes_conditionally_end_to_end_from_coefficients`. Call trees were
rendered with:

```sh
/tmp/valgrind-build.jS6H6t/install/bin/callgrind_annotate \
  --inclusive=yes --threshold=99.9 --tree=calling CALLGRIND_OUT
```

The authentication-boundary process retired `47,898,055,897` Callgrind `Ir`;
the full process retired `57,417,142,520`. The numbers below use inclusive
instruction counts rooted at the named stage function, not whole-process
percentages.

## Candidate authentication

`authenticate_compact_cubic_presentation_candidate` accounts for
`22,835,924,192 Ir`.

| Inclusive subtree | Ir | Authentication share |
| --- | ---: | ---: |
| elementary two-presentation authentication | 14,750,855,871 | 64.59% |
| FLINT small-surplus class order | 8,948,522,935 | 39.19% |
| `fmpz_mat_fflu` within that FLINT path | 6,989,905,378 | 30.61% |
| `fmpz_mat_solve_fflu_precomp` within that path | 1,700,122,519 | 7.44% |
| compact target solves | 2,518,290,688 | 11.03% |
| modular independent-row selection | 1,681,268,175 | 7.36% |
| saturation-minor certificate | 1,142,538,889 | 5.00% |
| dependency reorder and verification | 403,253,303 | 1.77% |
| class-map authentication | 3,429,440,264 | 15.02% |
| presentation authorization | 2,159,127,331 | 9.45% |

The class-map authentication and authorization paths each call
`PresentationClassMap::binding_sha256` for about `1,453,955,000 Ir`.
Together those two full traversals consume `2,907,911,260 Ir`, or 12.73% of
authentication. The binding hashes a roughly 1.28-million-entry integer
matrix through decimal formatting. This is distinct from the exact
relation-map replay that follows it.

The attribution is mixed by design: the Rust entry points own the proof flow,
while the largest descendants are FLINT/GMP operations. The FLINT class-order
and target-solve subtrees expose a 50.2% authentication ceiling before any
secondary exact checks are changed.

## Unit and analytic completion

`complete_cubic_class_group_conditionally` accounts for `8,862,854,381 Ir`.

| Inclusive subtree | Ir | Completion share |
| --- | ---: | ---: |
| FLINT/Arb directed regulator | 5,064,327,937 | 57.14% |
| Rust-owned MPFR logarithmic-embedding traversal | 2,325,942,742 | 26.24% |
| sealed-evidence replay | 548,512,947 | 6.19% |
| initial dependency annihilation replay | 435,118,337 | 4.91% |
| exact final unit replay | 129,851,257 | 1.47% |
| splitting-record extensions | 100,420,321 | 1.13% |
| Belabas-Friedman index enclosures | 84,774,090 | 0.96% |
| final dependency-log mapping | 82,938,895 | 0.94% |

The Arb bridge ran twice: first at 4,096 bits and then through the fail-closed
8,192-bit refinement. It made exactly 6,822 `arb_log` calls, equal to 1,137
relations times three real embeddings times two passes. `arb_log` descendants
account for `4,949,039,289 Ir`. The independent MPFR path made 3,411
`mpfr_log` calls, one for every relation and embedding, accounting for
`2,312,334,337 Ir`. Thus directed Arb and independent MPFR transcendental work
accounts for at least 83.38% of completion. The two exact Rust/Rug replay
subtrees account for about 11.1%.

## Ranked proof-preserving targets

1. Replace the dense integer FFLU class-order computation with a
   modular/multimodular determinant or SNF path carrying exact bounds and a
   replayable certificate. At minimum, reuse one factorization for class order
   and all target solves.
2. Mint the private immutable class-map binding once after exact verification
   and carry that seal into presentation authorization. Encode signed limbs
   canonically rather than formatting integers in decimal. Exact verification
   must precede minting; public or mutable inputs still require full checks.
3. Batch relation-map verification with exact FLINT matrix arithmetic and a
   reusable workspace. Retain exact zero tests and the existing authority
   boundary.
4. Derive a conservative regulator precision from exponent and cancellation
   bounds, then make one directed 8,192-bit Arb call instead of a known-failing
   4,096-bit call followed by refinement. The final Arb enclosure remains the
   authority.
5. Select sparse exact kernel and unit representatives and skip a relation in
   the regulator only when every selected unit exponent for it is exactly zero.
   If support remains dense, evaluate whether an exact compact product tree can
   reduce embedding evaluations without uncontrolled coefficient growth.
6. Keep the independent MPFR replay, but use an adaptive precision schedule
   and escalate only when reconstructed exact coordinates or the regulator
   enclosure check require it.
7. Do not remove mutation-sensitive exact replays. Where private structural
   immutability cannot justify a transcript seal, batch those replays through
   exact matrix operations instead.

## Limitations and raw evidence

Callgrind instruction counts are deterministic attribution evidence, not
headline latency. Under Callgrind, the full test took about 292 seconds and its
internal authentication and completion clocks were 105.282 seconds and 39.853
seconds. Those inflated timings must not replace the native measurements.
Callgrind also cannot predict cache, branch, or allocator effects because those
simulations were intentionally disabled.

Large raw profiles are not committed. Their original `/tmp` paths and SHA-256
digests are recorded in [`summary.json`](summary.json), making accidental
substitution detectable while keeping this qualification evidence compact.
