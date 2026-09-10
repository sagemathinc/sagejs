# Exact constant workspace indices

This compiler change is motivated by the cubic class-group campaign, but does
not recognize cubic function names or alter mathematical source. The optimization
applies to the common live-exact index lowerer, including vector entries and
matrix rows and columns.

## Semantics

The module constant collector and workspace index lowerer share a partial
arbitrary-precision evaluator for addition, subtraction, multiplication, floor
division, modulo, and the existing bounded constant shifts. It does not guess
unknown values or execute arbitrary calls. Unsupported or exceptional expressions
remain the responsibility of normal lowering. The existing 65,536-bit shift-count
cap is retained.

JavaScript BigInt division truncates toward zero, whereas Python `//` floors.
For nonzero $b$, let $q_0$ and $r_0$ be the truncating quotient and remainder.
If $r_0 \ne 0$ and the operands have opposite signs, the Python pair is
$(q_0-1,r_0+b)$; otherwise it is $(q_0,r_0)$. This preserves $a=bq+r$, with
the nonzero remainder having the divisor's sign and $|r|<|b|$.
Previously the module collector used BigInt `/` and `%` directly, miscompiling
such constants as `-3 // 2` and `-3 % 2`.

An index expression selects existing checked word-index lowering only if its
exact value is known and lies in $[0,2^{64}-1]$. This is not a cast of runtime
integer arithmetic: inputs, effects, and unknown expressions retain their normal
lowering. Negative and oversized values likewise retain exact lowering. Actual
owner dimensions are still checked; a word-sized index is not necessarily valid.

Parameters and existing local variables shadow module constants. A local binding
later in the function also prevents constant substitution: Python's lexical scope
does not allow an earlier uninitialized local read to fall back to a global.
Such reads now fail compilation instead of emitting the module constant.

No IR operation, native ABI, owner representation, or runtime bounds policy is
added. Folded operations retain source provenance. The shared evaluator is included
in the compiler's content-addressed backend fingerprint.

## Qualification

### Current integration checkpoint (2026-09-10)

Commit `43cb29851` integrates main at `89e6fcfb2` without changing the
compiler optimization. The focused four-test CPython/JavaScript/native
differential passes after integration, as do the complete architecture gate
and strict Python checks (382 modules, zero errors). Main's
`a75002d06` fixes the optimizer-inventory blocker described in the historical
qualification below. No manifest was refreshed locally to bypass that check.

The previously pushed revision `47e902dcd` has successful Linux routine,
Chromium parity, and Linux ARM64/macOS ARM64/Windows x64 smoke checks. Those
are not full native qualification for the new integrated revision. A fresh
`pnpm test:native` is running through canonical dependency preparation;
neither its eventual result nor new-head CI is presumed here. PR #202 remains
draft until the remaining qualification and handoff are complete.

### Initial branch evidence

The focused test is `node --test test/native-constant-indices.cjs`. It compares
signed and large constant arithmetic against CPython and exercises module
constants, local shadowing, vector/matrix indexing, effectful helper calls,
short owners, negative/oversized indices, and zero divisors. Runtime checks use
ordinary CPython source, generated JavaScript, and available native backends.

The focused test passes on Linux x64, including explicit GMP and FLINT `fmpz`
execution. Its arithmetic oracle covers 312 signed operand/operator combinations,
including 302-bit operands. A positive index with a 601-bit multiplication
intermediate is folded exactly, not evaluated with wrapping word arithmetic.
The constant evaluator does not change the existing frontend's integer-literal
recognition: Sage integer tokens arrive as literal `Integer("digits")` AST forms.

The live vector, matrix, arena, contextual-word and exact-range tests also pass
locally; exact-range execution includes ASan/UBSan. Borrowed FLINT aggregate
tests pass after provisioning both the direct addon and generated FFI adapter.
Two live-owner WASI tests skip because this worktree lacks a prepared WASI GMP
toolchain. These are not Windows, macOS, ARM64 or browser qualification results.

The unit tier passes all 191 test files. The compiler suite reports 21 passes,
zero failures and 28 skips; skips are not additional qualification. The strict
Python check and merge inventories pass. Full architecture qualification
is not green: the optimizer dashboard manifest is stale on the unchanged base
`d3a5973b4` as well as this branch (expected input `941e6567...`, recorded
`ce64558c...`). The existing identifier-hygiene emission test also fails on that
unchanged base because it expects a `compiled_record_status` wrapper; its runtime
differential passes. No unrelated manifests or wrapper tests were changed.

The slice/workspace source-compression suite also passes 20 tests with one
unprepared-WASI skip, including resource and sanitizer checks. A full
`test:native` attempt was stopped during its prerequisite dependency rebuild,
before its test stage. That preparation replaced the local prefix link; an
intermediate compression-suite run consequently failed on missing FLINT headers.
Restoring the existing private prefix snapshot and rerunning produced the
20-pass result. Neither the interrupted preparation nor the missing-header run
is a compiler regression or a broad native-suite pass.

## Identical-source cubic experiment

This comparison uses the production mathematical source at `d3a5973b4`, not
the later experimental mathematical algorithms on `agent/cubic-frontier-next`.
Those experiments depend on additional `bit_length` lowering and mathematical
scheduling changes not present on this base. Their previously reported timings
must not be substituted for either side of this compiler-only comparison.

Both compilers consume the identical 433,603-byte Python file with SHA-256
`73321ea581628c90e74f53441e12fc8a26439fe9c45ebdd70f5d7644d3670a7e`.
Native source dependencies, foreign declaration identities, include order and
header/library contents agree after normalizing checkout locations. Both retain
IR version 39 and a host-isolated core with zero interpreter callbacks.

| Artifact | Base compiler | Constant-index compiler |
| --- | ---: | ---: |
| Exact-index vector operations | 320 | 156 |
| Word-index vector operations | 106 | 270 |
| Generated core bytes, including provenance | 17,127,404 | 16,968,540 |
| Native addon bytes | 20,361,968 | 20,341,488 |

All 1,012 development-corpus observations agree exactly, including all 64 output
slots and declines. Each compiler accepts 940 fields at effort 5 and raises zero
native exceptions. The folded program additionally agrees in acceptance and
complete output between FLINT `fmpz`, GMP and generated JavaScript on all 1,012
fields. This is same-source differential evidence, not independent certificate
replay, new holdout evidence, or public-receipt qualification.

Two serial timing runs on the dedicated `opt` VM use opposite addon load orders.
Each has seven alternating-order rounds, 20 warmups, 64 native computations per
sample, and 256 fresh PARI `bnfinit(f,0)` computations per sample. CPU 0 is pinned;
native timing includes the existing effort retry sequence but uses preallocated
external scratch. No compilation or corpus validation runs on `opt`.
The machine is AMD EPYC 7B13; Node is 26.8.1 and PARI is 2.17.4.

Across the same 17 development fields, the geometric-mean folded/base runtime
ratios are **0.99237 and 0.99183**: approximately **0.76% and 0.82% less time**.
Representative median milliseconds are:

| Polynomial | Base, runs 1 / 2 | Folded, runs 1 / 2 | PARI, runs 1 / 2 |
| --- | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 12.336 / 12.340 | 12.113 / 12.108 | 1.547 / 1.551 |
| $x^3+9x-55$ | 3.046 / 3.065 | 3.047 / 3.055 | 1.188 / 1.191 |
| $x^3-x^2+3x-4$ | 2.196 / 2.210 | 2.218 / 2.209 | 1.012 / 1.016 |

This is not uniformly faster: $x^3-x^2-11x-63$ is approximately 0.83% and 0.84%
slower in the two runs. No zero-regression claim is made. The target improves
about 1.8–1.9%, but remains far from PARI. Eliminating these constant-index
operations is useful generic lowering; it is not the principal missing cubic
optimization. Further effort should prioritize the larger mathematical scheduling
and certification improvements already isolated by the campaign.

### Reproduction and evidence

`tools/native-kernel/bench/constant-indices.cjs` accepts four arguments:
compiler checkout, unchanged Python source, a fresh output directory, and a
record name. Run it once for the base checkout and once for this branch. Supply
the same prepared native dependency prefix to both. On this host the comparison
used `SAGEJS_FLINT_PREFIX` pointing to the campaign's existing immutable prefix
and `NODE_PATH=/opt/cocalc/lib/node_modules/npm/node_modules` for node-gyp.
The base checkout reused the completed frontend build and dependency installation;
its native compiler files remained at `d3a5973b4`.

Packaging, corpus and timing drivers are the versions at campaign commit
`07e61837c`, under `bench/class-unit-groups/`: `package-cubic-conditional.cjs`,
`diagnose-cubic-ablation-run.cjs`, `diagnose-cubic-initial-volume-backends.cjs`,
and `diagnose-cubic-ablation-timing.cjs`. Timing fields are the existing
`analytic-resume-timing-fields.json`; no fields were removed from either run.
The corpus logical SHA-256 is
`81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd`.

Base cache key: `322c02bd9db816c54352de38f2436b3f88d197901df38b3a25f77bb1038c7524`.
Folded cache key: `961b144ee0cfee95e7178b7c1715dbab5f6b264ff073eda634598b2552df6873`.
Raw reports are retained locally in `build/native-constant-indices-evidence/`:

- `corpus.json`: `3607ca713403ed3f9ea68203b6dacfc4630c0ba854297cfa4352c19e23a37f3a`
- `backends-qualified.json`: `21537bfde5a3c44e946507450dbc33796cb9273630e07ec8660e10aa1f177daa`
- `forward-timing.json`: `51737a689b5b862a80d16b5414febff4cf35a3651118bc2e488fab436f6b352e`
- `reverse-timing.json`: `ae336336325612af612f5aeab2bacdac41e0690cd64d5128c2c17e7dac1ee9e3`

Release qualification remains incomplete; this evidence does not authorize
promoting a production artifact or weakening any existing acceptance/resource gate.

## Next analytic-scheduling diagnostic

The faster, separate BF-lookup experiment's retained corpus report has SHA-256
`25bb9a2a0cbd920a2672d1513776c2c24e8aa513a8f645bd166aaa89b62953a3`.
Of its 963 accepted development observations, 771 use analytic certification;
all 771 publish final threshold 997. Their published index-log upper endpoint
is output slot 45 divided by the scale in slot 47. The final threshold is
slot 36, not slot 50; publication clears the transient log-two slots 48/49.

An exact rational margin census finds 92 of those 771 upper endpoints less
than $1/20$ below $\log 2$, and five less than $1/100$ below it. All 771 are
strictly below $\log 2$. This checks only the saved scalar stopping margin,
not the mathematical validity of the underlying certificates.

The census uses $S=2^{256}$ and $N=128$, with

$$
L=2\sum_{k=0}^{N-1}\left\lfloor
\frac{S}{(2k+1)3^{2k+1}}\right\rfloor,
\qquad
U=L+2N+\left\lceil\frac{9S}{4(2N+1)3^{2N+1}}\right\rceil.
$$

The identity $\log 2=2\operatorname{atanh}(1/3)$ gives
$L/S\le\log 2\le U/S$: the term-rounding error is less than $2N/S$,
and the remaining positive series is bounded by its first denominator times
the geometric sum with ratio $1/9$. For a saved upper endpoint $v/s$, compare
$Ls-vS$ and $Us-vS$ against $Ss/20$ or $Ss/100$ by integer cross-products.
None of these comparisons is ambiguous. No floating-point logarithm is used
to decide membership in either margin band.

This supplies a concrete constraint on the next experiment. Smaller initial
cutoffs may save prime-sum work, but many currently successful fields have
little certification margin. The earlier uniform 768 experiment already
caused 276 extra refinements. An adaptive policy must measure its additional
certification attempts, not just its smaller initial plan, and must retain
the existing exact acceptance theorem. These observations do not yet select
or validate a new policy.
