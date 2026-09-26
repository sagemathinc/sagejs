# Rejected Stage-D int64 range-latch proof

This experiment tested whether the private checked-region compiler should
remove the overflow check on the increment of a proved `loop.range_int64`.
It used the same frozen 36-function splitting-degree catalog and packet-zero
boundary as the [Stage-D dynamic census](stage_d_dynamic_check_profile.md).
The implementation was deliberately not retained: it was mathematically and
semantically exact, but reproducibly slower.

## Proof and authority tested

For current guarded intervals of `start`, `stop`, and `step`, the verifier
authorized the post-final increment only when:

- `step` was strictly positive and
  `stop.max - 1 + step.max <= INT64_MAX`, or it proved the loop empty; or
- `step` was strictly negative and
  `stop.min + 1 + step.min >= INT64_MIN`, or it proved the loop empty.

Zero and sign-straddling step intervals remained checked. The final audited
prototype also required distinct start, stop, step, index, and iterator roles;
rejected assignments to any of those roles from anywhere in the loop body;
and lost authority when a caller supplied weaker intervals.

Authority was compiler-private rather than serialized metadata. A private
`Symbol` bound each proof to the current parent loop, function body, loop body,
and complete set of matching `continue` descriptors. Robust canonical JSON
fingerprints covered the full analyzed function, including definitions before
the loop, as well as the loop body. Every matching continuation was authorized
or none was. The enumerable frozen proof contained scalar diagnostics only, so
`JSON.stringify` introduced neither authority nor an object cycle.

Focused hostile tests covered positive and negative steps, empty ranges,
near-overflow final increments, zero and straddling steps, bound/index/iterator
mutation, aliased loop roles, mutation of a preceding step definition, a weak
second caller, detached continuations, post-analysis shape changes, and
serialization forgery. Tagged and word generated paths were both checked.
These tests exposed and corrected two earlier prototype defects—role aliasing
and stale prefix facts—before any performance decision was made.

## Exact catalog effect

The final verifier authorized exactly **24** static latches, reducing checked
private arithmetic sites from 311 to 287. Instrumenting disposable generated
cores with the same method as the dynamic census gave:

| build | dynamic checked arithmetic executions |
| --- | ---: |
| checked Stage D | 4,530,968 |
| latch proof | 3,997,372 |
| removed | **533,596** |

All four frozen packets, all 7,081 active packet-zero outputs, complete mutated
buffer snapshots, and all malformed routing/error controls remained exact.

## Matched timing and code size

Each timing used one process, three warmup rounds, nine rotated retained
rounds, and batches longer than one second. Packing, compilation, decoding,
and assertions were outside the timed boundary.

| emitted proved increment | checked Stage D (ms/catalog) | candidate (ms/catalog) | candidate / checked | result |
| --- | ---: | ---: | ---: | --- |
| signed `iterator += step`, run 1 | 2.179742 | 2.224622 | 1.020589 | 2.06% slower |
| signed `iterator += step`, run 2 | 2.172805 | 2.223838 | 1.023487 | 2.35% slower |
| defined unsigned-add/cast form | 2.173063 | 2.210123 | 1.017054 | 1.71% slower |

The source core became slightly smaller, but machine text grew:

| artifact | checked Stage D | signed candidate | unsigned candidate |
| --- | ---: | ---: | ---: |
| generated core C | 7,304,875 | 7,302,712 | 7,304,539 |
| ELF `.text` | 214,075 | 214,747 | 214,679 |
| `.text` change | — | +672 | +604 |

Object-symbol inspection localized much of the growth to GCC's `-O3`
constant-propagated copies of hot private polynomial functions; one private
small-degree factor routine alone grew by roughly 523 bytes in the signed
candidate. Removing a branch changed inlining and constant-propagation choices
enough to outweigh the saved predictable checks.

## Decision

The compiler change was **rejected and reverted**. It met its theorem,
authentication, static-count, dynamic-count, and semantic targets, but failed
the non-regression requirement in three matched measurements and in both
direct-add code-generation forms. Dynamic check count is therefore useful for
ranking proof exposure, not a sufficient optimization objective.

Future work should address private-graph code placement, inlining, or GCC
constant-propagation stability before reconsidering these latches. A future
campaign must re-establish the complete authority model above and qualify
against the same frozen catalog; it must not revive the unchecked increment
merely because the arithmetic theorem is valid.
