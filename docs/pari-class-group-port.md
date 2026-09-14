# Faithful PARI class-group language experiment

Status: ownership approved; mixed-buffer prerequisite integrated experimentally.
The user subsequently approved additional reasonably justified compiler changes
on this experimental branch. The original one-correction count is superseded;
the experiment's time/compute budgets and faithful-work criteria are unchanged.
Prepared scalar/array ingress and independent loop counts are integrated at
`a306e2974`; later historical
references to awaiting permission or rejecting scalar inputs are resolved.
The uniform MPFR ingress remains insufficient; a separate prepared-mantissa
prototype now preserves heterogeneous precision for the all-real norm loop.

### Short-product and real-norm checkpoint

The extended multiplication control has 228 operand pairs. Two constructed
64-by-192-bit near-midpoint products disagree with both MPFR nearest-even and
nearest-away: PARI's shortened product omits low-word carries. Rounded integers
agree, but `grndtoi` reports error exponent **-32 in PARI and -31 in MPFR**.
Thus substituting correctly rounded MPFR arithmetic can change the `factorgen`
error gate, not just insignificant printed digits. These are synthetic boundary
cases, not observed failures in the frozen fields. They are not claims that
PARI's documented arithmetic accuracy or class-group results are incorrect.

`short_product.py` translates the short-product word sum and final rounding
into ordinary Python integers, deliberately discarding each omitted low half
before summation. It matches all 228 cases in CPython, generated JS and forced
native execution, including full result mantissa, precision and exponent.
The supported prototype has 64-bit words and at most 2,048 input bits. A
separate square wrapper uses the common short word sum only through 512 bits,
below the pinned square crossover; larger squares and the upstream
large-product crossover remain unsupported.

The same file's all-real `embed_norm` product loop now runs with resident
integer buffers and source-transparent helper calls. Sixteen prepared vectors
from the two already-used tuning real cubics match PARI in CPython, generated
JS, forced GMP and tagged execution. PARI still supplies the embedding
matrix-vector product. Sixteen mixed-quartic prepared vectors also match,
using the translated positive-addition precision policy and bounded square
wrapper. No matrix multiplication, factorization, ideal valuation, or
class-group stopping path is claimed here.

This is a representation prototype: Python/GMP integers express PARI's word
products and carries. Their cost is not PARI's machine-word cost. Before a
language-performance conclusion it needs a same-representation control and
measurement; no speedup or parity is claimed. It is not a generic GEN runtime,
a replacement arithmetic library, or a production default.

The separate positive-addition MPFR control compares 16 squared-embedding pairs
and 1,197 exponent/precision boundary pairs. With PARI supplying the output
precision as scaffolding, MPFR truncation matches all; nearest-even matches
only 9/16 and 475/1,197. The Python prototype now implements the nonnegative
precision decision itself and matches all 1,213 pairs plus 16 stored-zero
precision cases in CPython, generated JS and native execution. Signed
subtraction/cancellation is not implemented.

Reproduce with `SAGEJS_FLINT_PREFIX` set to the existing diagnostic prefix:
`node bench/pari-class-group-port/check_short_product.cjs <pari-source> <prefix>`
and `node bench/pari-class-group-port/check_short_norm.cjs <pari-source> <prefix>`.
Both accept an optional compiler-worktree argument for prerequisite testing.
Add `--addition` to the first command for positive sums and `--mixed` to the
second for mixed norms. These remain untimed component checks.

### Compiled rounding checkpoint

The prerequisite through `84218a22d` adds exact `int.bit_length()` and checked
integer shifts. The attributed `rounding.py` block is now `@native` compiled;
75 prepared PARI real values agree in CPython, generated JS, public dispatch,
and forced native execution, including the integer result and error exponent.
Run `check_compiled_rounding.cjs <pari-2.17.4-source>` in this directory's
benchmark folder (or supply its full relative path from the worktree root).
The checker obtains oracle values by calling PARI `grndtoi`; it does not use
the translated formula as its expected result. All runs are untimed.

Left-shift allocation is explicitly limited to 1,048,576 result bits by the
experimental native backend. Exceeding the cap fails, never truncates. These
inputs fit comfortably. An expression-level conditional was written as an
ordinary `if/else` because that exact-integer lowering does not support the
conditional expression; the rounding branches and operations are unchanged.
This is only a rounding block, not the norm computation or a class-group result.

### First actual embedding-norm ingress finding

The uniform-precision borrowed-array API is implemented and tested, but it is
not sufficient for PARI's actual prepared embeddings. `embedding_norm.py`
expresses the real-only and mixed nonempty product blocks, with separate loop
counts and no inserted multiply-by-one. The untimed `check_embedding_norm.cjs`
uses PARI's prepared matrix-vector product as input scaffolding and compares
against `embed_norm`. It currently **fails before norm arithmetic**, intentionally
refusing precision coercion:

```text
field=0 candidate=1 first_bits=256
nonuniform prepared precision: input=320 target=256
```

Field zero is the frozen tuning polynomial `x^3-20018*x+20034`; candidate one
has integral-basis coordinates `[1,-3,3]`. `nfinit` was requested at 192 bits.
The first attempted fixed-192-bit ingress had already rejected a 256-bit entry.
The follow-up preserved the first entry's precision and exposed the 320-bit
entry. No input was rounded to make the comparison pass. The fourth field was
changed from an initially drafted synthetic control to the second frozen
quartic; execution never reached that field in either attempt.

Reproduce with the integrated compiler:

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_embedding_norm.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

This is a failing capability diagnostic, not a norm or performance result.
Per-entry precision and arithmetic result-precision rules are the next required
representation/lowering work. Uniformizing all entries to the requested field
precision or the maximum observed precision is not assumed equivalent to PARI.

### Per-operation arithmetic control

`check_multiply_precision.py` exports operands without rounding and compares
PARI `mulrr` with direct MPFR multiplication at the shorter operand precision.
For the first two real embeddings of eight candidates on each of the four
declared tuning fields, all **32 products** match exactly, including their
subsequent rounded integer and error exponent. Input precision patterns are
`(256,320)` and `(320,256)`, both producing 256-bit PARI results.

Two constructed signed halfway products at 64 bits disagree with MPFR's default
nearest-even mode. MPFR's `mpfr_round_nearest_away` control matches both, as well
as all 32 prepared pairs. This supports a concrete arithmetic mapping, not a
claim that every PARI real operation is now covered. Pinned `mulrr` chooses the
shorter precision; its guard-bit rounding increments magnitude at a tie.
`addrr_sign` additionally has exponent-alignment, word-extension, cancellation
and zero-exponent branches. A generic minimum-precision policy for all operators
is therefore not justified by the multiplication result.

Run the untimed control with:

```sh
python3 bench/pari-class-group-port/check_multiply_precision.py \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /home/user/sagejs/packages/flint/.native/prefix
```

The initial diagnostic incorrectly used PARI's unsigned decimal `strtoi` on
negative strings exported by GMP. Explicit sign handling fixed the bridge;
the same bridge fix was applied to the norm diagnostic. Those initial mismatches
were not arithmetic evidence. The control now includes both signed tie cases.
No class-group result, norm-chain equivalence or performance follows from these
34 primitive comparisons alone.

### Rounding contract identified before implementation

Pinned `gen3.c:round_i` (line 2429) computes `floor(x + 1/2)`, not
ties-to-even or ties-away-from-zero. Given the full signed mantissa `m` and
its denominator exponent `e` (`x = m / 2^e`), an integral value with `e <= 0`
returns error exponent `-e`. For `e > 0`, an exact represented integer returns
`-e`, while a half-integer returns `-1`. Nonzero residuals use their binary
exponent minus `e`. Thus simply measuring an MPFR subtraction from the rounded
integer loses a precision-dependent case, and normalizing away trailing zero
mantissa bits is not interchangeable with PARI's stored precision.

`grndtoi` (line 2544) additionally handles zero and values of exponent below
`-1` directly using the stored real exponent. `factorgen` rejects an error
exponent greater than `-32`. The planned interchange must therefore preserve
precision and the zero exponent as well as numerical value. These source
observations define tests to implement, not a completed rounding primitive.

`bench/pari-class-group-port/rounding.py` now directly translates this prepared
real rounding branch in ordinary Python. `check_rounding.py` compares its
integer and error exponent to the pinned library's `grndtoi`, exporting actual
mantissas with `mantissa_real`. All 75 cases agree (25 values at three requested
decimal precisions): signed ties, exact integers, small exponents, and values
around the `-32` rejection boundary. Run:

```sh
python3 bench/pari-class-group-port/check_rounding.py \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

This is an untimed Python differential, not native rounding qualification or
an embedding-norm implementation. The driver uses the existing instrumented
library only as an oracle, never as a timed comparator. Its initial setup
failed because `setrealprecision` requires a non-null output pointer; the
driver was corrected without changing the translated rounding algorithm.
No class-group or performance result is claimed. Earlier obstruction evidence
below is retained as history, not the current ownership state.

## Ownership takeover checkpoint

The user approved takeover of `mixed-exact-float-sidecar`. Its original changes
were preserved, integrated with this experiment's base, and reviewed for index
conversion, float operators, and Python assignment evaluation order. Prerequisite
draft PR #283 is integrated here at `7fac97ebf`; this experiment remains draft.

The actual enumeration scaffold now runs in CPython, generated JS and native
code with matching candidate order on 24 synthetic cases (184 vectors). Run
`SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix node test/pari-class-group-port.cjs`.
This uses an explicitly identified existing diagnostic prefix, not a new
matched performance baseline. The prototype admits exact-double integer
coordinates only through ±2^53 and declines larger ones; this narrower
representation envelope is not PARI's full machine-integer range.

Compiler qualification still has visible gaps: standalone Wasm SDK absent,
full build blocked by optional FFLAS installation, and generated optimizer
manifest awaiting integration review. Strict Python and focused compiler tests
pass. None of these checks establishes a complete class-group port.

Next: extend the upstream small-relation trace through candidate/admission
state, and extend the connected segment through norm/factorization and relation
admission. Prepared-field and full-path timings remain unmeasured. The original
scope and acceptance criteria are unchanged.

This executes `agents/pari-class-group-language-experiment.md` with the user's
explicit override to **PARI 2.17.4**. The old release identifiers in that plan
are historical and do not govern this experiment. Mathematical choices remain
**upstream-assumed**; this work changes no production default or proof state.

## Reproducible source identity

- Sage.js base: `938ccd425f0a322bafb1375968d5e24b38d5cde5`.
- Official archive: <https://pari.math.u-bordeaux.fr/pub/pari/unix/pari-2.17.4.tar.gz>.
- Archive SHA-256: `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
- `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
- Source archive downloaded and both hashes checked on 2026-09-13.
- Upstream attribution: PARI group, `buch2.c` copyright 2000, GPL version 2
  or later. Translated files must retain that attribution and license notice.

## Resource ledger

Execution began at approximately 2026-09-13 21:32 UTC. Limits remain 16 aggregate
active-agent hours, six aggregate execution CPU-hours, 256 MiB archived evidence,
600 seconds and 4 GiB per field. At most two agents run concurrently. The panel
agent performs selection only. Builds are local, not on the M0 timing host;
no reservation or action on `opt` is authorized by this experiment.

This initial checkpoint used approximately 11 root active minutes plus 12 panel
agent minutes, well below either audit/selection timebox. No benchmark CPU
budget was spent; checks and the single PARI smoke were small diagnostic runs.
Compilation is excluded from the execution CPU budget, not from active time.

## Initial full-path dependency frontier

All source locations below refer to the pinned `src/basemath/buch2.c`.
These are audit findings, not claims of translated coverage.

| Entry / stage | Source | State and dependencies to preserve |
| --- | --- | --- |
| Public dispatch | `bnfinit0`, 3468; `Buchall_param`, 3729 | Prepared `nf`, requested flag/precision; flag zero still requires unit work. |
| Bounds and analytic estimate | `Buchall_param`, 3772–3841 | Roots of unity, automorphisms, cached prime decomposition, `GRHchk`, inverse residue and precision. |
| Factor base / retries | `FBgen`, `subFBgen`, driver `START` | Ordered prime ideals, permutations, subfactor bases, saved relations, changing bounds. |
| Small relations | `small_norm`, 2574; `Fincke_Pohst_ideal`, 2448 | Ideal products; rounded-embedding integer LLL; arbitrary-precision QR; binary64 enumeration; norm rounding; prime-ideal valuations; relation admission. |
| Random relations | `get_random_ideal`, 2631; `rnd_rel` | PARI RNG draw schedule, subfactor-base products and reductions; same relation cache. |
| Coupled linear algebra | driver, 3994 onward | `hnfspec_i` / `hnfadd_i`, exact relation matrices, floating embeddings and transformation history. |
| Regulator / stopping | driver, 4090 onward | `compute_multiple_of_R`, `compute_R`, precision restart and new relations, optional `be_honest`. |
| Final output | driver, 4140 onward | Unit lattice reduction, `getfu`, archimedean cleanup, `class_group_gen`, complete `buchall_end` state. |

The existing exact cubic certification program is not a faithful replacement
for this path: it uses different norm, analytic, and termination policies.
Likewise, replacing PARI's rounded embedding norm in `factorgen` by an exact
determinant would change the work and possibly relation acceptance. Such a
replacement cannot silently be called language-only overhead.

The candidate first connected segment is small-ideal relation discovery,
including enumeration and admission, with any unavailable preparation or
valuation dependencies explicitly separated. Its exact entry/exit boundary
and measured cost still need to be established; an enumeration helper alone
does not fulfill the substantial-segment checkpoint.

## Concrete compiler obstruction and ownership boundary

`bench/pari-class-group-port/mixed_buffer_probe.py` reduces the failure to a
single floating-buffer comparison followed by a signed-buffer read. Calling
`lowerSource` on current base produces:

```text
native indexing currently requires a local constant sequence
```

`tools/native-kernel/float64-ir.cjs:isFloat64Signature` admits only a Float64
return and Float64/uint64/Float64Buffer parameters. A signature containing
Int64Buffer is routed to `lowerIntegerFunction`, which does not lower this
Float64Buffer indexing. The same error occurs on the actual enumeration
prototype. This is a demonstrated language capability gap, not a speed result.

The existing worktree `/home/user/sagejs-worktrees/mixed-exact-float-sidecar`
has an **active native-compiler contract and uncommitted edits** to exactly
these lowering/backends/runtime files. Its recorded architecture/native gates
fail. We inspected that state read-only; none of its edits were copied, changed,
committed or assumed correct. Taking over that prerequisite requires an explicit
ownership decision. Creating another overlapping compiler implementation would
violate the parallel-development contract.

A read-only follow-up ran the new probe through that unfinished worktree's
existing `lowerSource`: the minimal mixed-buffer probe lowers successfully,
but the enumeration prototype stops at its `ValueError` guard (`native raise
currently supports ZeroDivisionError`). This confirms that the proposed work
addresses the first obstruction, but its older compiler is not a drop-in
replacement for the current base. No code was copied or guards removed, and
successful IR lowering alone does not validate generated native execution.

Encoding integer state as doubles is not adopted as a workaround: it changes
the admitted integer range and still leaves conversion/helper-call dependencies.
Calling the interpreter inside the native search is prohibited. Replacing the
search by the existing certified cubic algorithm changes the experiment.

## Initial executable evidence (before prerequisite integration)

- Unmodified official PARI source builds locally with GCC 15.2.0, GMP 6.3.0,
  single-thread engine, `-O3 -Wall -fno-strict-aliasing`, no readline or graphics.
- `gp -fq` reports `[2,17,4]`; `bnfinit(nfinit(x^3-3*x+1),0)` returns class
  number 1 and empty invariant factors. This is a smoke test, not timing evidence.
- Local comparator `gp-dyn` SHA-256:
  `5ccd82c860757ecdfaa26c3bd75fbba1a5d17d580388e2ed9a993c67a1b1891e`;
  linked `libpari-gmp.so.2.17.4` SHA-256:
  `e0c227a09f01827f58917f2c8f48947792876ef5234e48920a558b17110e4ab6`.
- `bench/pari-class-group-port/enumeration.py` is an attributed ordinary-Python
  translation of `step` and the inner enumeration block only. It retains the
  one-million trial limit and upstream ordering; an explicit resumable boundary
  replaces the outer candidate processing. This is scaffolding, **not** a
  completed expensive connected segment.
- `node test/pari-class-group-port.cjs` checks 24 CPython lattice enumerations
  against exhaustive finite sets (184 vectors) and reproduces both compiler
  failures. These tests do not establish agreement with a PARI execution trace,
  JS/native correctness, class invariants or regulator correctness.
- The frozen 24-field development panel meets all requested historical strata;
  see `bench/pari-class-group-port/panel-notes.md`. It is not a new baseline.
- Root build passes in 7m21s, with absent optional native adapters/production
  pack and unprepared numerical Wasm reactors explicitly skipped. Formatting,
  parallel scope and architecture gates pass; strict Python passes 403 existing
  modules. The new bench prototype is not a migrated production module.
- `pnpm test:changed -- --base 938ccd425` passes merge invariants, then stops
  in `test/algebraic-geometry.cjs` because the optional generated
  `sagejs_flint.node` addon is absent. Remaining selected docs/CLI tests were
  not reached. Full native qualification has not run; the lowering failure
  itself must be resolved first. These limitations keep the PR draft.

At that initial checkpoint there were no paired measurements or generated core for this prototype,
and no experiment claim against the 2x target. Dependencies such as rounded
archimedean norm, prime-ideal valuations, rank admission and unit recovery remain
untranslated. The next investment is to finish/integrate the mixed-buffer
compiler prerequisite, then resume the connected small-relation path; this
checkpoint is explicitly inconclusive about whole-engine parity.

## Upstream enumeration trace checkpoint

The translated enumeration now matches native PARI 2.17.4 candidate prefixes
and trial counters on four predeclared tuning fields, in both generated JS and
compiled native execution. This does **not** test primitive/scalar rejection,
relation admission, stopping equivalence, or class-group output from Sage.js.

| Tuning field ID prefix | Enumeration calls | Comparisons, both backends | PARI output |
| --- | ---: | ---: | --- |
| `0e970fdb` | 16 | 2,558 | `1 []` |
| `dec56e7e` | 12 | 1,766 | `3 [3]` |
| `0857fab7` | 44 | 11,920 | `1 []` |
| `98479377` | 301 | 112,738 | `4 [2, 2]` |

There are 64,491 recorded vectors checked against each backend, not 128,982
independent vectors. Records are limited to the first 200 trial counts per
enumeration call. No final-reserve field was opened. Each GP invocation has a
30-second timeout and 4 MiB output cap. These diagnostic runs are not timings.

Apply `bench/pari-class-group-port/pari-trace.patch` to the pinned pristine
archive, rebuild GP, then run:

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_pari_trace.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4/gp
```

The patch activates only under `SAGEJS_TRACE_FP`; the runner sets it. The
instrumented binary must not serve as an unmodified timing comparator, even
with the environment flag unset. The source/build directory used for the
initial smoke has now been instrumented: its current `buch2.c` SHA-256 is
`d8b09a54e51399c83f2faa92ccc3f1f70f41d660b1cb279738bc207ff553f87a`,
and its `libpari-gmp.so.2.17.4` SHA-256 is
`c1a41ed3a65f65762bd9ee718397b439592185c3f1d3f52fb9d19f8bb980064a`.
The earlier binary hashes above describe the earlier unmodified build only.

Parsed-trace SHA-256 values, in table order:

```text
3bbddcb2fc4241c8066b319fee7c006258a5f96a487f14ef1644f06affde40a1
8dcf442b9a4f0895e67843e86f24f092625e4926736b76c30e055ee5b299da96
24eb70f035e1eb439356a5b3e55db1baba24c6cfc01af25d3e952e07f79f372f
c9bf7233c137a9275dcf2951a86a7017efa823124adea937fe79084a12ef1fde
```

Diagnostic failures retained: initial parsing lost records when other PARI
diagnostics lacked a terminating newline; parsing now locates the explicit
marker. Enabling all BNF debug output exceeded the unchanged 4 MiB cap on the
first quartic, so the patch uses a dedicated flag instead. PARI's real-number
formatter can separate an exponent with whitespace (`2.04 e-38`); the parser
now consumes the complete real value, with a focused regression assertion.
Neither apparent ordering mismatch required changing the translated algorithm.

## Next boundary: prepared arbitrary-precision embeddings

`prepared_real_probe.py` demonstrates a second capability gap, distinct from
mixed binary64/integer workspaces. Lowering a function that multiplies two
supplied `RealNumber` arguments fails with:

```text
native kernel: unsupported native argument type RealNumber
```

The legacy field lowering in `tools/native-kernel/ir.cjs` accepts parent fields,
integers and unsigned iteration counts, but not prepared real/complex values
as arguments. It has scalar MPFR/MPC arithmetic for values constructed inside
the kernel; that is not resident access to a prepared embedding matrix.
The four current FFI declarations (FLINT, M4RI, igraph, FFLAS) provide no
MPFR/MPC owned resource alternative. This is evidence about current interfaces,
not a claim that implementing the capability is impossible or slow.

The next upstream operation needing it is `factorgen` (`buch2.c`): multiply
the prepared embedding matrix by the exact candidate coordinates, compute
`embed_norm` (`base1.c`), divide by the ideal norm when supplied, and apply
`grndtoi` with its `e > -32` rejection. `embed_norm` multiplies real embeddings
in order and multiplies squared complex absolute values separately before
combining them. PARI's precision and rounding behavior must be investigated
and preserved at the relevant acceptance branches; merely choosing MPFR's
default rounding is not an equivalence argument.

Potential exits have different meanings:

- Add resident arbitrary-precision scalar/container ingress and the required
  rounding operations: a second compiler/runtime or representation capability,
  needing explicit reassessment of the one-correction budget and ownership.
- Let PARI supply norm/factorization/admission outputs at an outer boundary:
  permitted diagnostic scaffolding, but not a translated connected discovery
  segment or evidence for whole-engine speed.
- Replace the norm by binary64 or exact determinants: different arithmetic and
  potentially different accepted relations; excluded from a language-only claim.

The existing one general correction is the mixed integer/binary64 workspace
support. No second correction has been started. The experiment remains
incomplete and inconclusive about whole-engine parity. The minimal probe and
its rejection are now regression-tested; no production API or proof state is
changed.
