# Wolfram numerical-optimization parity

This document is the prose companion to
[`test/wolfram-optimization-parity.cjs`](test/wolfram-optimization-parity.cjs),
which is the executable proof: every claim below of something being
"covered" or "diverges" corresponds to an assertion (or a documented,
explicitly-reasoned `t.skip`) in that file, or in one of the three sibling
suites it credits -- `test/optimization-find.cjs`,
`test/optimization-findfit.cjs`, and `test/wolfram-options.cjs`. If this
document and the test file ever disagree, the test file is the ground
truth; file a bug against this document.

The scope is Wolfram's Optimization guide, numeric cut -- the thirteen
heads Sage.js's `%%mathematica`/`--wolfram` frontend implements:

- **Global:** `NMinimize`, `NMaximize`, `NMinValue`, `NMaxValue`,
  `NArgMin`, `NArgMax`
- **Local:** `FindMinimum`, `FindMaximum`, `FindMinValue`, `FindMaxValue`,
  `FindArgMin`, `FindArgMax`
- **Fit:** `FindFit`

See [`FOREIGN-LANGUAGES.md`](FOREIGN-LANGUAGES.md) for how the Wolfram
frontend works in general; this document is scoped to these thirteen heads
only.

## Coverage matrix

### Global family: `NMinimize`, `NMaximize`, `NMinValue`, `NMaxValue`, `NArgMin`, `NArgMax`

All six heads share one Python entry point per call (`_optimize` in
`src/lib/wolfram.py`), which in turn calls one shared engine
(`sagejs.optimization.nminimize.nminimize`). An argument-reading form is
therefore proven once and each head's own result shape and cross-head
agreement is checked directly, rather than re-testing the shared reader six
times over.

| Documented call form | Status |
| --- | --- |
| Bare variable, `f[obj, x]` | Covered |
| List of variables, `f[obj, {x, y}]` | Covered |
| Single variable region, `f[obj, {x, a, b}]` | Covered |
| List of variable regions, `f[obj, {{x,a,b},{y,c,d}}]` | Covered |
| `{f, cons}`, one constraint | Covered |
| `{f, cons}`, a `List` of constraints | Covered |
| `{f, cons}`, a `&&` conjunction of constraints | Covered |
| `{f, cons}`, a `||` disjunctive region | **Diverges** -- refused by name (see below) |
| Malformed 3+ element pair -- refused by name, naming the actual head | Covered |
| A constraint that is neither a relation nor a callable -- refused by name, naming the actual head | Covered |
| Default region `-1 <= x <= 1` for a bare/unbounded variable | Covered |
| `{x, xmin, xmax, Integers}` domain quadruple | **Gap** (see below) |

| Head | Result shape | Registered | Cross-head agreement |
| --- | --- | --- | --- |
| `NMinimize` | `{fmin, {rules}}` | Covered | -- |
| `NMaximize` | `{fmax, {rules}}` | Covered | `= -NMinimize(-f)`, exact |
| `NMinValue` | bare `fmin` | Covered | `= NMinimize`'s `fmin`, exact |
| `NMaxValue` | bare `fmax` | Covered | `= NMaximize`'s `fmax`, exact |
| `NArgMin` | bare `{xmin, ...}` | Covered | `= NMinimize`'s rules, exact |
| `NArgMax` | bare `{xmax, ...}` | Covered | `= NMaximize`'s rules, exact |

Options (`Method` bare and with sub-options, `MaxIterations`, the
universally-declined set, unrecognized-option refusal): fully covered on
`NMinimize`. One cross-head instance of each mechanism (`Method` with
sub-options, `MaxIterations` truncation, a `WorkingPrecision` decline) is
additionally proven on `NMaxValue`/`NArgMin`, to confirm the shared
`GLOBAL_OPTIMIZATION_OPTIONS` table in `tools/wolfram/frontend.ts` is not
silently `NMinimize`-only. `NMaximize`, `NMinValue`, and `NArgMax`
individually are not separately re-exercised -- they route through the
identical table.

### Local family: `FindMinimum`, `FindMaximum`, `FindMinValue`, `FindMaxValue`, `FindArgMin`, `FindArgMax`

| Documented call form | Status |
| --- | --- |
| Bare variable, list of variables, `{x, x0}`, list of `{x, x0}` pairs, `{x, x0, xmin, xmax}` box | Covered |
| `{x, x0, x1}` two-starting-value form | **Diverges** -- refused by name (see below) |
| `{f, cons}` constrained pair, on `FindMinimum`/`FindMaximum` | Covered |
| `{f, cons}` constrained pair, on `FindMinValue`/`FindMaxValue`/`FindArgMin`/`FindArgMax` | Covered |
| `{f, cons}`, `&&` conjunction and `||` refusal | Covered -- shared verbatim with the global family |
| Malformed 3+ element pair -- refused by name, naming the actual head | Covered |

Result shapes (`{fmin,{rules}}`, bare value, bare argument list) and
registration for all six heads: covered. Options (`Method` bare only --
sub-options refused by name, `MaxIterations`, `Gradient` decline, the
universally-declined set, unrecognized-option refusal): covered.

| Behavior | Status |
| --- | --- |
| A bounded variable ignores `Method`, always runs `fmin_l_bfgs_b` | **Diverges** (see below) |
| A constrained problem ignores `Method`, always runs `cobyla.cobyla` | **Diverges** (see below) |

### `FindFit`

Every documented `data` shape (pairs, multi-variable rows, bare values with
implicit abscissae), every `pars` shape (bare, list, `{a, a0}` with
starting values), every `vars` shape (bare, list), the bare-rule-list
result shape, the parameter-not-in-model refusal, the malformed-data
refusal, every option declined by name, unrecognized-option refusal, and
the four-argument arity requirement: all covered.

## Known divergences from Wolfram

Each entry below is either refused loudly and by name (safe: the caller
finds out immediately, with a reason) or, for the two silent routing
deviations, proven live through the frontend and marked with an explicit
`t.skip("diverges: ...")` in `test/wolfram-optimization-parity.cjs` so the
gap stays visible rather than being quietly encoded as "expected".

1. **`WorkingPrecision` is unsupported.** Every engine reached from
   `wolfram.py` coerces its numbers through Python `float()` -- this
   package is IEEE double throughout, with no higher- or lower-precision
   code path. Honoring a different `WorkingPrecision` would be a lie about
   what actually ran, so it is declined by name on every one of the
   thirteen heads. (`UNIVERSALLY_DECLINED_OPTIONS` in
   `tools/wolfram/frontend.ts`.)

2. **`AccuracyGoal`/`PrecisionGoal` are declined, not approximated.**
   Wolfram's digits-of-precision-sought options have no faithful mapping
   onto this package's own `tolerance=`, which already conflates
   constraint-feasibility slack and solver convergence and is not a digit
   count. A guessed digit-to-tolerance formula would be worse than
   declining. Declined on every head.

3. **`Compiled`, `StepMonitor`, `EvaluationMonitor` are declined on every
   head.** The objective always runs as a plain Python/Sage callable, so
   `Compiled` has no interpreted/compiled distinction to switch; neither
   monitor has a callback hook anywhere in these engines.

4. **`FindFit` honors no options at all.** `sage_api.find_fit` (reached
   through `wolfram.find_fit`) has exactly one fixed engine,
   Levenberg-Marquardt, with no method to select, no iteration-limit
   keyword, no caller-supplied gradient, no norm or weighting parameter,
   and no regularization parameter. Every option Wolfram documents for
   `FindFit` -- `Method`, `MaxIterations`, `Gradient`, `NormFunction`,
   `Weights`, `FitRegularization`, plus the universally-declined set -- is
   refused by name, each with its own reason.

5. **The local `Find*` family's `Method` takes no sub-options.**
   `wolfram.find_minimum` and its five siblings take no `method_options`
   keyword at all, unlike the global `N*` family. Wolfram's
   method-with-suboptions form, `Method -> {"Name", "Sub" -> value, ...}`,
   is refused by name for every local head rather than silently dropping
   the sub-options.

6. **`Gradient` is declined for the local `Find*` family.**
   `wolfram.find_minimum` computes the gradient itself from a symbolic
   objective (one compiled partial derivative per variable) and takes no
   keyword for a caller-supplied one.

7. **Wolfram's `{x, x0, x1}` two-starting-value form is refused, not
   silently truncated.** Every solver reached from `FindMinimum`'s family
   takes a single starting point; a caller writing the two-value form is
   told so by name rather than having `x1` silently dropped.

8. **A bounded `FindMinimum` (and its five siblings) always routes to
   `fmin_l_bfgs_b`, regardless of `Method`.** `fmin_l_bfgs_b` is the only
   solver in this package that takes a box, so any variable given
   `{x, x0, xmin, xmax}` bounds runs there whatever `Method` asked for.
   `Method` is still validated -- an unknown or declined name still raises
   -- but a resolved, supported method goes unused. Wolfram itself applies
   the requested method inside the box instead. Verified live through the
   frontend in this audit: `Method -> "Newton"` and
   `Method -> "PrincipalAxis"` on the same bounded problem
   (`FindMinimum[(x-3)^2, {x, 0, -1, 1}, Method -> ...]`) return
   bit-identical answers. Recorded in
   `src/lib/sagejs/optimization/findminimum.py`'s module docstring.

9. **A constrained `FindMinimum` (and its five siblings) always routes to
   `cobyla.cobyla`, regardless of `Method`.** COBYLA is the only
   constrained local solver in this package. `Method` is still validated
   the same way as the bounded case. Wolfram's own documented default
   `Method` for a *constrained* `FindMinimum` is `"InteriorPoint"`, one of
   the values this package declines by name for lacking an
   interior-point solver -- COBYLA is offered as this package's only local
   constrained solver, not as a claim to reproduce Wolfram's algorithm or
   its numbers. Verified live through the frontend in this audit:
   `Method -> "Newton"` and `Method -> "PrincipalAxis"` on the same
   constrained problem (`FindMinimum[{(x-3)^2, x <= 5}, {x, 0}, Method ->
   ...]`) return bit-identical answers.

10. **`NMaximize`'s infeasible answer is `-Infinity`, not `Infinity`.** The
    Wolfram `NMaximize` reference page states the infeasible answer as
    `{Infinity, {x -> Indeterminate, ...}}`, word for word the same text
    `NMinimize`'s own page uses. `-Infinity` is the only value that makes
    sense for a maximization that found nothing feasible, so that is what
    this package returns instead -- a deliberate, documented deviation
    from Wolfram's literal (almost certainly copy-pasted) reference text,
    not an oversight. (`n_maximize`'s docstring in `src/lib/wolfram.py`.)

11. **`NMinimize`'s `{x, xmin, xmax, Integers}` integer-domain quadruple
    has no path through the Wolfram frontend.** *Newly found during this
    audit, not previously documented anywhere.* The shared engine,
    `sagejs.optimization.nminimize.nminimize`, does implement a
    `(variable, low, high, domain)` quadruple with `domain` one of the
    Python strings `"Reals"`/`"Integers"` (see that module's docstring).
    But Wolfram source spells the domain as the bare symbol `Integers`,
    which has no entry in the Wolfram frontend's symbol-constant table
    (`tools/wolfram/frontend.ts`); it falls through to an ordinary Sage
    name lookup and resolves to Sage's own `Integers` ring-constructor
    global, not the Python string `"Integers"` the engine's domain check
    expects. The call does not refuse cleanly by name the way an
    unsupported option does -- it fails with a confusing internal message
    naming a Sage ring object the caller never wrote:
    `NMinimize[(x-3.4)^2, {{x, -5, 5, Integers}}]` fails with `variable 0
    has domain <function Zmod>; only 'Reals' and 'Integers' are
    supported`. Not fixed as part of this audit: closing it needs a real
    translation from Wolfram's `Integers` symbol to the engine's domain
    string (and ideally a clean refusal for anything else), not a
    one-line safety change. Tracked as a `t.skip` gap in
    `test/wolfram-optimization-parity.cjs`.

12. **A disjunctive `||` constraint is refused, not approximated.**
    Wolfram accepts a union of regions -- `NMinimize[{(x-2)^2,
    x <= 1 || x >= 9}, {x}]` searches both branches and returns `1` at
    `x = 1`. Both `_optimize` and `_find_optimize` take a list of
    constraints that must hold *together*, and no engine behind them
    expresses a union of regions, so `||` anywhere in the constraint slot
    is refused by name. Approximating it would mean silently answering a
    different problem: before this refusal existed, the frontend lowered
    `||` to Python `or`, which short-circuits and kept a single branch --
    the call above returned `49` at `x = 9`, the wrong branch, with no
    diagnostic. Covered in `test/wolfram-optimization-parity.cjs`.

## Fixed during this audit

Two bugs were found and fixed as part of writing the parity suite,
because they were small, mechanical, and did not touch any documented
behavior this project claims to support -- only the accuracy of an
internal error message naming the wrong head. A third, found afterwards
by reading Wolfram's own documentation examples, was serious enough to
fix on its own terms; it is described last.

- **`src/lib/wolfram.py`'s shared dispatchers, `_optimize` and
  `_find_optimize`, hardcoded `"NMinimize"`/`"FindMinimum"` in their
  malformed-`{f, cons}`-pair and bad-constraint-type error messages,
  regardless of which of the six heads in each family actually made the
  call.** A caller writing `NMaxValue[{f, c1, c2}, x]` (a malformed
  three-element pair) was told `"NMinimize takes either an objective or
  the pair {f, cons}"` -- naming the wrong head. Both dispatchers now take
  an explicit `head` parameter, threaded through from each of the twelve
  public entry points (`n_minimize`, `n_maximize`, `n_arg_min`,
  `n_arg_max`, `n_min_value`, `n_max_value`, `find_minimum`,
  `find_maximum`, `find_min_value`, `find_max_value`, `find_arg_min`,
  `find_arg_max`), so the message now names the head that was actually
  called.

- **`sagejs.optimization.nminimize.nminimize`'s own unknown-method and
  rejected-method messages hardcoded `"NMinimize"` the same way,** one
  layer deeper than the fix above -- this is the single shared engine
  behind all six global heads. `nminimize()` now takes an optional `head:
  str = "NMinimize"` keyword (default preserves the message for every
  existing direct caller, including test/optimization-global.cjs's own
  Python-level tests), and `wolfram.py`'s `_optimize` passes the actual
  head through. A caller writing `NMaxValue[x^2, x, Method -> "Convex"]`
  used to be told `"NMinimize method 'Convex' is a third-party..."`; it
  now says `"NMaxValue method 'Convex' is a third-party..."`.

Both fixes are exercised as regression tests in
`test/wolfram-optimization-parity.cjs` (the "naming the actual head"
tests).

The third, found after this audit shipped and fixed on top of it:

- **The `&&` constraint spelling silently dropped every constraint but
  one.** `tools/wolfram/frontend.ts` lowered `&&` with its generic boolean
  mapping to Python `and`, which short-circuits on truthiness: given
  `NMinimize[{f, x + y >= 3 && x <= 1}, {x, y}]`, the lowered
  `(x + y >= 3) and (x <= 1)` evaluated to a single relation and the other
  never reached the engine. `bool()` of an unprovable symbolic relation is
  False, so `and` returned its left operand -- the first constraint
  survived, the rest were discarded. No error, no warning, just a
  confident answer to a different problem. Constraints in the `{f, cons}`
  slot now flatten through `&&` and through nested Lists alike into the
  Python list the engines already read, so `{f, c1 && c2}` and
  `{f, {c1, c2}}` produce bit-identical results; `&&` outside that slot
  still lowers to `and`.

  This is worth dwelling on as an audit lesson. `_constraint` in
  `src/lib/wolfram.py` *did* refuse `&&` by name -- the guard was written
  in anticipation of exactly this -- but it could never fire, because
  `and` had already collapsed the conjunction to a valid single relation
  before Python saw it. A guard that cannot fire reads, to a later
  reviewer and to this document's own coverage matrix, exactly like a
  guard that works. What actually caught it was running Wolfram's
  documented spelling and comparing it against the spelling this suite
  already tested. The `||` divergence above was found the same way, in the
  same slot, ten minutes later.

## Suites this document credits

- [`test/optimization-find.cjs`](test/optimization-find.cjs) -- the local
  `Find*` family's call forms, result shapes, and options.
- [`test/optimization-findfit.cjs`](test/optimization-findfit.cjs) --
  `FindFit`'s data/pars/vars shapes, result shape, and options.
- [`test/wolfram-options.cjs`](test/wolfram-options.cjs) -- `Method`,
  `MaxIterations`, and every declined/unrecognized option, on a
  representative global and local head.
- [`test/optimization-global.cjs`](test/optimization-global.cjs) -- the
  Python `nminimize(...)`/`differential_evolution(...)`/etc. engine
  layer directly. Explicitly **not** the Wolfram surface: no call in that
  file goes through `createForeignFrontend("wolfram")`. Before this audit
  it was the closest thing to global-family test coverage that existed,
  which is exactly the hole `test/wolfram-optimization-parity.cjs` fills.
- [`test/wolfram-optimization-parity.cjs`](test/wolfram-optimization-parity.cjs)
  -- this audit's own suite: the global family's call forms and per-head
  result shapes through the frontend (previously untested for
  `NMaximize`/`NMinValue`/`NMaxValue`/`NArgMin`/`NArgMax`), the
  constrained pair on the local family's extremal-value/argument heads,
  and the two silent-routing divergences and the `Integers`-domain gap
  proven live and recorded rather than hidden.
