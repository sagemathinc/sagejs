# Repeated checked-`int64` normal-completion experiment

This experiment asks whether a later occurrence of an identical checked
`int64` expression can reuse the fact that an earlier occurrence completed
normally.  It targets the final `da + 1` in the private `flx_copy` graph used
by the frozen prime splitting-degree catalog.

## The theorem

Within one private checked invocation, reaching the statement after a checked
`int64` operation proves that the operation did not overflow.  A later
operation with the same symbolic operands and operator therefore cannot
overflow.  Symbolic operand identities are invalidated by assignments and are
intersected at control-flow joins, so the fact is retained only when every
reaching path establishes it.

`flx_copy` needs one additional, deliberately narrow normal-completion fact:

```python
for i in range(da, -1, -1):
    value = source[i]
result = da + 1
```

If the loop is empty, `da <= -1`, so `da + 1` fits.  Otherwise its first
iteration successfully indexes a fixed view of length at most `INT64_MAX`, so
`da <= length - 1` and the successor again fits.  The compiler accepts this
fact only for an authenticated negative-step range whose first body operation
is a signed access to a fixed private view and whose body contains no
`break`, `continue`, `return`, or explicit raise.  The public function and all
unproved private operations retain their checked paths.

The emitted proof authority is
`checked-region-int64-repeated-success-v1`.  It is authenticated from the
complete cloned graph immediately before emission; changing the loop step,
the accessed view, or control flow revokes authorization.

## Frozen-catalog result

Input fixture SHA-256:
`f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312`.
The candidate reproduced all 7,081 active outputs in four packets and matched
all nine malformed-input gates.  The private graph retained zero materialized
buffer descriptors.

The static private checked-arithmetic census fell from 227 to 223.  Besides
the intended `flx_copy` successor, the general repeated-expression theorem
soundly removed one repeated check in each of `flx_small_optpow`,
`flx_normalize`, and `flx_mul`.  A prior gcov replay gives the following
dynamic counts per complete catalog for three of those sites:

| private operation | executions/catalog |
| --- | ---: |
| `flx_copy:39` (`da + 1`) | 36,569 |
| `flx_normalize:12` (`a + da`) | 603 |
| `flx_mul:19` (`da + db`) | 5,900 |

Thus the change removes at least 43,072 dynamically executed checks per
catalog, plus the `flx_small_optpow` site whose source line did not receive an
independent gcov counter.

## Pinned A/B

Both artifacts used identical generated binding configuration and were timed
on CPU 2 at the tagged-packet-zero boundary (packing, compilation, and
assertions excluded), in seven alternating pairs.  The baseline was the
pre-theorem output of commit `ba523edec`; the candidate was produced from the
same commit plus this change.

| measurement | baseline | candidate |
| --- | ---: | ---: |
| geometric mean | 2.12863 ms | 2.10145 ms |
| candidate / baseline |  | 0.98723 |
| generated core bytes | 6,309,980 | 6,309,340 |
| ELF text bytes | 347,569 | 347,913 |

This is a modest 1.28% improvement, not a standalone optimization campaign.
Its value is that the intended high-frequency check is removed by a reusable,
fail-closed source theorem without weakening the ordinary checked semantics.

## Hostile controls

Focused tests reject or revoke the proof for:

- `break`, `continue`, and early `return` in the descending loop;
- an operation inserted before the certifying access;
- mutation of the repeated operand;
- a dynamic rather than fixed view length;
- post-analysis mutation of the loop step, access buffer, or loop body;
- branch/order changes that prevent every reaching path from establishing the
  same expression.

An executable generated-C differential compares the optimized and ordinary
checked entries at range starts `-1`, `INT64_MIN`, fixed-view `length - 1`,
and the out-of-range `length`.  The two paths agree on success/failure, result,
status message, and storage.  Separate join tests require both continuing
branches to establish the same expression; changing either branch revokes the
later proof.  Nested explicit raise and continue cases are also rejected.
