# Public cubic target: separate setup from class-number work

This diagnostic follows the [native cost ledger](cubic-cutoff768-cost-ledger.md).
It measures the production mathematical source at `ca2e588b5053ab14bc6f23612681b6adcd02c140`,
**not** the experimental cutoff-768 source. The target remains
$x^3-x^2-11x-63$, LMFDB `3.1.12716.2`, with class group $C_3$.
No production default, mathematical acceptance condition, or frozen-corpus
benchmark definition is changed.

## Controlled diagnostic results, 2026-09-08

On `opt` (AMD EPYC 7B13, Linux x64, Node 26.8.1, PARI 2.17.4), all eleven
rounds passed: 7,040 timed Sage.js results were authenticated after timing,
and 66 receipts were independently replayed, including the eleven warmups.

| System and boundary | Median ms/call | Range across eleven batch means |
| --- | ---: | ---: |
| Sage.js `scalar-prepared` | 3.236846 | 3.165648–3.285918 |
| Sage.js `fresh-complete` | 24.347214 | 23.638010–25.331130 |
| Sage.js `fresh-class-number` | 19.514130 | 18.991910–20.447420 |
| Sage.js `coefficient-vector-complete` | 11.490664 | 11.290690–11.864338 |
| Sage.js `coefficient-vector-class-number` | 8.260848 | 7.092636–8.639616 |
| PARI `bnfinit(prepared_nf,0)` | 0.765625 | 0.757813–0.789063 |
| PARI `bnfinit(Polrev(coefficients),0)` | 1.210938 | 1.203125–1.226563 |

The prepared public ratio is approximately 4.23. The coefficient-vector fresh
class-number ratio is approximately 6.82, subject to the workload differences
below. These are current diagnostic ratios for this single target, not an
improvement relative to the older full-corpus benchmark. In particular, the
coefficient-vector class-number boundary has appreciable between-round
variation; do not derive fine-grained operation costs by subtracting medians
from different boundaries.

The comparison exposes both an algorithm/runtime gap on prepared fields and
substantial additional public construction costs. Changing the expression to
a coefficient-vector constructor or omitting an explicitly requested public
maximal order is **not** a new implementation speedup. It isolates what was
being timed. Similarly, the separate 5.32% native cutoff improvement cannot
be applied to these public medians as if it had been measured here.

## Call boundaries

| Boundary | Work inside the Sage.js timer |
| --- | --- |
| `scalar-prepared` | `class_number(proof=False)` on fresh, previously untimed fields whose public maximal orders were prepared outside the timer |
| `fresh-complete` | Polynomial expression, `NumberField`, public `maximal_order()`, and class number |
| `fresh-class-number` | Polynomial expression, `NumberField`, and class number; no separate public maximal-order call |
| `coefficient-vector-complete` | Polynomial coefficient-vector construction, `NumberField`, public maximal order, and class number |
| `coefficient-vector-class-number` | Polynomial coefficient-vector construction, `NumberField`, and class number |

The expression form is `sum(int(v) * x**i for i, v in enumerate(coefficients))`;
the vector form is `R([int(v) for v in coefficients])`. Both construct the
same exact polynomial from the same four decimal strings. The vector form is
an existing public constructor, not a new optimization or an unchecked API.
The five boundaries include small Python loop/list bookkeeping costs.

PARI measures `bnfinit(nf,0)` on freshly prepared `nfinit` objects and
`bnfinit(Polrev([-63,-11,-1,1]),0)` on fresh coefficient-vector polynomials.
Its returned bnf contains more than the requested class number. In particular,
the expression-building Sage.js boundary is not an equal construction workload
to PARI's coefficient-vector boundary.

## Protocol and limits

On the dedicated `opt` VM, build the pinned production revision before timing.
Pin the orchestrator and its children to CPU 0 and limit common numerical
libraries to one thread. Alternate Sage.js/PARI process order over eleven
rounds. Each boundary contains 128 calls. Every Sage.js result must have an
authenticated native receipt with class number 3 and invariant factors `[3]`.
Independently replay the warmup receipt and the last receipt of each boundary,
outside the timer. This is **sampled replay**, not independent replay of all
128 results. PARI's class number and invariants are checked after each batch.

Sage.js performs one warmup computation and replay per process; PARI performs
ten `bnfinit` warmups. All process startup is outside the internal timers.
The five Sage.js boundaries always run in the listed order, so JIT, GC, and
order effects have not been independently randomized. Report this as diagnostic
cost separation, not a fully qualified relative-speed claim. This is one known
field, not a new frozen-corpus run or an unseen-neighbor qualification.

The runner requires the production index's mathematical source hash to match
the source file. It records the source revision, native manifest entry, source
hash, production pack hash, Node version, host name, and GP executable hash,
and checks source revision/hash and pack hash again after timing.

## Reproduction

Use a fresh output directory; the runner writes per-round stdout/stderr there.
Copy `bench/class-unit-groups/diagnose-cubic-public-target.py` into it as
`public-target.py`, then run:

```sh
taskset -c 0 node bench/class-unit-groups/diagnose-cubic-public-target.cjs /path/to/built-ca2-checkout /path/to/output /path/to/gp > /path/to/output/public-target-timing.json
```

An initial harness attempt was rejected because GP stack configuration and
polynomial initialization shared an input line. Changing `parisizemax`
discarded the remainder of that line, leaving the prepared branch with the
uninitialized symbol `f`, a degree-one polynomial. The class-number assertion
caught the error. The corrected driver puts stack configuration and field
initialization on separate input lines. No failed-comparison timing is used.

## Source-level interpretation

`NumberFieldParent.__init__` in `src/baselib/number_fields.py` converts and
normalizes coefficients, checks irreducibility, constructs the generator and
display name, initializes caches, and registers coercions. For rational
polynomials, `PolynomialElement.is_irreducible()` currently calls `factor()`,
then checks the factorization and compares reconstructed polynomials. The
resource-backed rational factorization itself uses FLINT, but decoding and
public polynomial-object work remain around that call. This identifies a
general-purpose profiling opportunity, not proof that factorization alone
accounts for the constructor's measured cost.

The native class-number dispatch already performs its required field analysis
inside the closed native computation. Its fast public path does not require
the caller to invoke public `maximal_order()` first. Avoiding that extra public
call changes what the benchmark asks to compute; it does not remove a native
correctness check or establish that existing users became faster.

## Evidence identities and next step

Raw samples are retained as
`build/cubic-next-evidence/ca2-public-target-opt-timing.json`, SHA-256
`836e0c7cd7e19030bc7aa3544f8f43ab07715f5e67f42a895fe20bb4ebba588b`.
The successful production build receipt is retained alongside it as
`ca2-opt-build-receipt.json`. The Python driver committed with this report is
Ruff-formatted; its AST was checked identical to the Python driver executed
on `opt`. The JavaScript driver differs from the executed corrected driver
only in an explanatory comment about GP stack configuration.

- Native cache key:
  `72cc67034368ffa74e193e6ea8814be454666ba3b8b3e25f15540ddac16a5345`.
- Mathematical source SHA-256:
  `ced9ca6ae8890b030c92c907ee4987fb55a0f1b797bc90248a3213c4a193db7d`.
- Production pack SHA-256:
  `84b69fc2c472f44e6f717904ff6e1fe81412a79ea8908835126116174d87324d`.
- GP executable SHA-256:
  `c87bdfb1fa3192bd1281c9975ff2da0783f8e6f747a8304e550bf0288fb81e1d`.

The next optimization should retain both prepared and fresh public gates.
Profile coefficient normalization, irreducibility, factor decoding, and
coercion registration separately before changing public construction. Within
the closed native computation, continue from the disjoint cost ledger rather
than treating analytic cutoff selection as the whole bottleneck. Neither
track requires weakening mathematical certification.
