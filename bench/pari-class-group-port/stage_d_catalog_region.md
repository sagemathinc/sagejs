# Stage-D relational checked region on the real catalog

Compiler commit `10edd80a4` supplies the relational guard vocabulary needed to
represent the complete outer contract from the 1.6307 ms generated-C
diagnostic. The real 36-function, 58-edge splitting-degree graph now uses that
contract with independently verified `int64-arithmetic`,
`direct-buffer-access`, and `verified-span-access` capabilities.

The experiment driver is `check_stage_a_catalog_region.cjs`; despite its
historical filename it accepts `stage-a` and `stage-d` modes. The former clones
the graph behind the exact guard while retaining every check. The latter uses
the same graph and guard and permits only checks proved redundant by the three
named capabilities. `benchmark_catalog_region_builds.cjs` compares the
ordinary baseline and both region modes in one rotated process.

## Exact guard

The declaration now represents every part of the recovered diagnostic
preflight:

- `state` has at least four entries;
- `degree` lies in `[2, 4]` and `prime_count` is nonnegative;
- `capacity = prime_count * degree` is a checked nonnegative int64 product;
- `coefficients` has at least `degree + 1` entries;
- `primes`, every per-prime offset/count buffer, and their peers have at least
  `prime_count` entries;
- the exact workspace has at least 29 entries, both word workspaces at least
  393, and local state at least three;
- each factor/group buffer has at least `degree` entries; and
- each flattened output buffer has at least `capacity` entries.

The product is checked once before dependent length predicates. Negative
values, int64 multiplication overflow, `size_t` conversion overflow, and short
buffers fail the guard and enter the unchanged public function. There is no
weaker fallback theorem hidden in the optimized clone.

## Correctness and fallback replay

All four frozen packets matched their complete CPython-derived result and
post-call buffer snapshots, including all 7,081 active outputs in packet zero.

Nine malformed cases were replayed against the ordinary baseline. Result or
exception type, exact error text, and every post-call buffer value agreed:

| case | route | outcome |
| --- | --- | --- |
| short state | public fallback | `RangeError: short degree catalog state` |
| degree 5 | public fallback | `-4` |
| short coefficients | public fallback | `-6` |
| short primes | public fallback | `-6` |
| short word workspace | public fallback | `-6` |
| short flattened output | public fallback | `-6` |
| nonmonic polynomial | private graph | matching `RangeError` |
| invalid prime | private graph | matching `RangeError` |
| oversized prime | private graph | `-5` |

The last three are important controls: they satisfy the structural guard and
therefore exercise error behavior inside the optimized private graph rather
than merely demonstrating fallback routing.

## Proved and remaining checks

Static sites within only the private 36-function definitions were:

| check family | Stage A retained | Stage D remaining | proved away |
| --- | ---: | ---: | ---: |
| checked int64 add/subtract/multiply | 420 | 311 | 109 |
| `Int64Buffer`/`UInt64Buffer` bounds failures | 87 | 71 | 16 |

The counts are deliberately syntactic and reproducible from emitted C. They do
not multiply sites by dynamic execution frequency. Stage D is conservative:
unmatched affine expressions, loop-carried facts, division guards, and accesses
whose relationship cannot be reconstructed remain checked.

Code size decreased despite enabling optimization:

| artifact | Stage A | Stage D |
| --- | ---: | ---: |
| generated core C | 7,351,947 bytes | 7,327,730 bytes |
| stripped addon | 239,800 bytes | 223,416 bytes |
| ELF `.text` | 229,323 bytes | 213,803 bytes |

## Matched timing

A single-process comparison used three warmup rounds followed by nine rotated
orders. Every retained batch exceeded one second; compilation, argument
packing, decoding, and assertions were excluded.

| implementation | geometric mean (ms/catalog) | versus baseline |
| --- | ---: | ---: |
| ordinary safe tagged baseline | **3.318805** | 1.0000 |
| exact-guard Stage A, all checks retained | **2.610216** | 0.7865 |
| exact-guard Stage D capabilities | **2.197030** | 0.6620 |

Stage D is 0.8417 times Stage A, a further 15.8% reduction after closed-graph
specialization and inlining. Relative to the ordinary safe compiler it is
33.8% faster. It is now close to the approximately 2.03 ms matched PARI output
contract, while preserving the ordinary checked Python path for inputs outside
the proven region.

This does not yet reproduce the 1.6307 ms generated-C diagnostic. The remaining
gap is now precise rather than architectural: 311 checked arithmetic sites and
71 fixed-buffer sites remain in the private graph, along with code-size and
missed-proof effects. The next campaign should rank those remaining sites by
dynamic execution count and extend proofs only for dominant, mathematically
justified affine relationships.
