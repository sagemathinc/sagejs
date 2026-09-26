# Bounded-storage campaign conclusion

## Frozen question

This campaign tested two hypotheses without changing the translated PARI
mathematics:

1. Does explicit bounded storage close the frozen splitting-degree catalog gap?
2. Does explicit storage reuse transfer to the real HNF arithmetic reached by
   the accepted-class-candidate computation?

The field is the prepared totally real cubic
`x^3 - 20018*x + 20034`.  The catalog processes the same eager sequence of
1,230 primes and publishes the same 7,081 active output values in every arm.
All timings below are shared-host diagnostics with `qualifiedTiming: false`.

## Splitting-degree result

| implementation | representative time/catalog | interpretation |
| --- | ---: | --- |
| exact storage, tagged | 140--142 ms | existing translated graph |
| bounded residues only, tagged | 82--85 ms | about 41% faster than its exact tagged baseline |
| exact storage, GMP | 150--153 ms | existing translated graph |
| bounded residues only, GMP | 105--107 ms | about 30% faster than its exact GMP baseline |
| checked `int64` + `Int64Buffer`, tagged | 13.7--14.0 ms | 6.0--6.1x faster than bounded-residue tagged |
| checked `int64` + `Int64Buffer`, GMP | 19.3--19.5 ms | about 5.5x faster than bounded-residue GMP |
| same Python graph, fixed-storage C control | 1.39 ms | benchmark-only performance ceiling |
| PARI output-contract control | 2.03 ms | separate PARI 2.17.4 control |

The exact outputs agree in CPython, JavaScript, GMP, tagged native execution,
the fixed-storage C control, and the PARI contract control.  The checked native
path retains overflow-safe signed arithmetic and Python floor division/modulo;
the C ceiling is safe only under the frozen workload's admitted bounds.

**Conclusion:** bounded residue storage alone does not close the gap.  Extending
machine representation through signed scalars, metadata, offsets, loop
variables, calls, and returns removes most of the measured excess over the C
ceiling, but the production tagged path remains about 6.8x slower than the PARI
catalog control and about 10x slower than its own same-algorithm C ceiling.

The result nevertheless answers an important language question positively:
the readable Python algorithm has a competitive low-level realization.  The
remaining gap is in general compiler/runtime lowering, not an inherent cost of
the translated algorithm.

The production graph still contains exact islands: convolution accumulation,
input reduction, modular inversion, `len()` preflights, and characteristic-two
staging.  Generated-code inspection reports 201 `mpz_t` locals, 1,885 static
GMP-operation sites, and 18 heap-call sites across all emitted backend variants.
These counts are localization evidence, not dynamic call counts.

## Real HNF result

Sparse preprocessing reduces the apparent 66-by-73 relation matrix to the
actual 8-by-15 HNFLLL operand.  Replacing packed exact storage with a resident
`NativeExactArena` vector preserves the exact HNF, transformation matrix,
lambda/D state, and the independently checked identity `A*U = H`.

Across seven long alternating pairs:

- packed baseline geometric mean: 3.4008 ms;
- resident-storage geometric mean: 3.2874 ms;
- resident/baseline ratio: 0.96665, or a 3.34% improvement.

**Conclusion:** explicit reuse transfers correctly to real HNF arithmetic, but
it is not a material optimization for this workload.  HNFLLL itself is only
about 3.4 ms.  Most of the previously profiled 61.75 ms enclosing HNF phase is
in sparse cleanup, rank/assembly, logarithmic transforms, and final state
propagation, which require separate profiling.

## Decision

The requested hypotheses are resolved:

- **Splitting degree:** no, storage alone does not close the gap; whole-graph
  signed boundedness is essential and highly effective.
- **HNF:** yes, reuse transfers, but its measured benefit is small because the
  true HNFLLL operand is already small.

The smallest justified next compiler campaign is to eliminate the catalog's
remaining exact islands one at a time and measure each against the 1.39 ms C
ceiling.  The smallest justified algorithm campaign is to profile and bound
the work surrounding HNFLLL rather than optimizing HNFLLL further.
