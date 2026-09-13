# No-Singular number fields: implementation audit

Status: **N1/N2/N3 implemented; production qualification N5 in progress.**

## Current production checkpoint

Mathematical source is frozen at `890e83ba424291cf37f605b3b1b0ebf62662f6e6`.
The subsequent `0eb6591d0` and `5d9ff96f4` commits only refresh generated
reference documentation and mark guide examples executable. Earlier sections
below are historical checkpoints, not current capability restrictions.

| Qualification | Current evidence |
| --- | --- |
| Linux x64 | Full build, seven focused number-field tests, direct native fixtures, and 222/222 portable files pass |
| Production Node-Wasm | Number-field geometry/factorization/decomposition and 75 independent oracle fixtures pass |
| Chromium | The same production number-field batches pass without a development source override |
| Existing portable algebra | QQ/prime-field and finite-extension geometry regression batches pass in production Node-Wasm |
| Strict Python / architecture | 405 modules, zero errors; complete architecture check passes |
| Documentation | Four executable Sage examples in the two number-field guides pass |
| Linux ARM64 | Focused tests, 222/222 portable files, fresh 41-family production native pack, and all five direct number-field fixtures pass |
| macOS ARM64 | Qualification running; numerical artifact setup failure described below, not yet accepted |
| Windows x64 | Persistent host has approximately 1.1 GB free; alternate native CI run 34728729942 started without signing/publication; no success claimed |
| Mobile simulators | Existing iPhone/iPad checks pass in workflow 34727914092; this is not the full Chromium number-field corpus |
| npm / relocated SEA | Fresh Linux install, public APIs, lazy resources, and relocated SEA pass; additional installed-kernel/SEA number-field ideal, factorization, geometry, and radical smoke passes |

The tested production Wasm artifact is
`051707e3caacc3289ff4430f271aabce2fb669d3df2f778f1023c151d69a683e`.
It contains 286 compiled functions and one explicitly unsupported baseline
function; this work introduces no new native kernels. Node-Wasm and Chromium
number-field checks each complete in about two minutes. Existing production
algebra regression batches take about eight minutes. Receipts apply to this
artifact, not an untested later documentation repack.

The distribution smoke initially selected the Python-only `sagepython`
executable, which correctly rejected mathematics. Selecting the mathematical
`sagejs` executable passes the same test without a product change. The
successful logs are `n5-npm-standard.log` and `n5-npm-sea-smoke-math.log`;
the initial `n5-npm-sea-smoke.log` remains failed setup evidence. The root npm
tarball includes the tested documentation-only descendants; its mathematical
payload and the platform SEA payload retain the frozen source above.

Linux ARM64 passes at the frozen mathematical commit with Node 26.5.1.
The initial eight-stage build preceded FLINT FFI adapter generation and skipped
the native pack. After the focused/portable tests finished, the 41-family
20.70 MiB native pack was built, the validated native receipt refreshed, and
all five direct number-field fixtures rerun successfully, including the 75
independent Sage oracles. Both `n5-arm64-890e83ba4-patched-source.log` and
`n5-arm64-native-pack-890e83ba4.log` are required to describe this evidence.

macOS completed its production native pack but failed its final numerical
reactor step with `manifest/build artifact gzip_bytes mismatch`. The recovery
uses the authenticated numerical product from successful simulator run
34727914092 at the same commit, through the existing `SAGEJS_NUMERICAL_PRODUCT_ROOT`
installation/validation path. It does not change the manifest or bypass its
checks. The repeated full build and tests remain pending; the failed first
build is not a complete macOS receipt.

Logs are retained under `/home/user/sagejs-extension-qualification-20260912/`
with the `n5-` prefix; the [checkpoint manifest](number-fields-qualification-890e83ba4.json)
records hashes of the completed portable/distribution logs. PR #274 remains draft. No release is authorized or
published. Optional msolve acceleration remains deferred; the shipped source
uses exact algorithms under both proof settings.

## N1 completion

The exact generic layer now supplies the roadmap's polynomial substrate over
simple absolute number fields: canonical terms under all three global orders,
arithmetic, bounded exact evaluation, simultaneous substitution,
existing/new-coordinate homogenization, coefficient/term dictionaries and
lists, derivatives, exact division, gcd/xgcd, squarefree layers and resultants.
Explicit canonical serialization binds variables, order and normalized field
presentation and reconstructs into the supplied parent. Different field
presentations are not implicitly identified. Generator-name collisions fail
before polynomial construction.

`PolynomialField` guards coefficient ingress and sparse arithmetic results at
4096 bits per rational numerator/denominator. Sparse workspaces bound terms,
coordinate cells, exponents, work and cooperative time. Dense lists and
Sylvester matrices have pre-allocation size checks. These do not interrupt a
single foreign scalar operation; see [the exact envelope and intentional API
restrictions](../docs/number-field-polynomials.md). Only
`univariate.euclidean` is promoted in the number-field capability registry;
ideal, geometry, generic Gröbner and irreducible factorization remain gated.

Local Linux x64 validation:

- Rebuilt self-hosting compiler to a fixed point and regenerated Sage/Python
  runtime caches after the final bootstrap changes.
- Expanded N1 fixture passes in both Python and Sage modes: five presentations,
  three orders, overflow/allocation rejection, canonical and invalid packets,
  explicit parent reconstruction and exact polynomial identities.
- Independent SageMath 10.9.post1 witnesses cover term orders and a nontrivial
  cubic-field quotient/remainder/resultant, checked under both proof settings.
- Eight regression tests pass (finite-extension codecs/capabilities,
  independent generic arithmetic and 108 pinned Gröbner cases, approximate,
  cyclotomic and number-field scalar behavior).
- The fenced Sage documentation example executes successfully.
- Strict Python: 404 modules, zero errors. Full architecture check passes;
  the new source stays within the existing 340,000-byte lazy allocation.

The new tests caught and corrected a bootstrap dictionary-key conversion bug
and a non-exact limit constant; their failure logs are retained separately.
Logs use `n1-*` in `/home/user/sagejs-extension-qualification-20260912/`.
Optimizer evidence identity is
`31a4a82f08724df923a014a51fa037e12758567db7de1a87c041fcd2ef609434`.
Those infrastructure assets remain local. No cross-platform N5 success,
whole-roadmap completion, PR readiness or release is claimed by this checkpoint.

PR #122 merged at `7ac59152591159cd2535f09ea8fb48fd9c19e8f8` on
2026-09-12. The dedicated `agent/no-singular-number-fields` branch starts from
integrated `origin/main` at `256419004`, after the merge manager's ready-only
wave. This satisfies the roadmap's sequencing gate without modifying the
retained finite-extension qualification checkout. No release is authorized.

The full scope remains N1 (exact univariate/multivariate representation), N2
(ideals, quotient algebras and geometry), N3 (exact factorization and
zero-dimensional decomposition), N5 (four native platforms plus production
Node-Wasm, Chromium, simulator and distribution evidence), followed by the
bounded optional-acceleration investigation N4. See the
[roadmap](no-singular-extension-fields-plan.md).

## First N1 slice: coefficient interchange

- Use the existing `NumberFieldParent` and its public defining polynomial,
  generator and element coordinate list; no second scalar representation.
- Normalize the defining polynomial to monic rational coefficients. The
  descriptor contains reduced numerator/positive-denominator pairs; cosmetic
  generator names remain separate. Different defining polynomials do not
  receive implicit embeddings, even if they define isomorphic fields.
- Flatten each element's rational power-basis coordinates into canonical
  numerator/denominator integer pairs at the versioned serialization boundary.
  Decode through the explicitly supplied receiving parent, validating each
  pair and retaining existing degree, integer-digit and total-byte limits.
- Scalar availability does not promote number-field polynomial, ideal,
  Gröbner or factorization capabilities. Those remain explicitly unavailable
  until their corresponding implementation slice is complete.

The lazy polynomial-algorithms source component grows to 326,452 bytes with
this adapter. Its source census allocation increases from 325,000 to 330,000
bytes for the new functionality. This is a reviewed lazy source allocation,
not an eager payload budget, timing limit or mathematical resource relaxation;
production compressed artifact budgets still require measurement at N5.

Focused tests cover real/imaginary quadratic and two cubic fields, nonmonic
rational defining polynomials, denominators, inverses, cosmetic renaming,
parent ownership, malformed coordinates, descriptor mutation isolation and
non-identification of distinct presentations. These are substrate regression
tests, not the independent mathematical corpus still required for N2/N3.

Local Linux x64 checkpoint: fresh eight-stage source build passes in 7m30s;
strict Python passes for 403 modules with zero errors. The build correctly
skips production native kernels while its optional generated adapter is absent.
The initial runtime tests fail for that missing adapter manifest, then the
current-source generated FLINT adapter build completes (438 adapters). All five
focused tests subsequently pass, including the new number-field codec,
finite-field coordinate/capability regressions, independent coefficient
arithmetic, and all 108 pinned Sage Gröbner fixtures. The new scalar test also
checks five inverse-coordinate witnesses from independent SageMath 10.9.post1.
This checkpoint is not a new production native-pack or Wasm receipt.

Logs are retained in `/home/user/sagejs-extension-qualification-20260912/`
under the `number-fields-n1-` prefix; failed setup attempts remain separate
from the successful `build-resume` and `tests-resume` logs.

The full architecture check and modular source-freeze regression pass after
regenerating source-derived evidence. The modular diff changes only the package
graph hash and its aggregate identity. The optimizer census is
`sha256:f1bceb309b2a60ba6db0972770284bdaa73357a6f89f289f9ba1a094d2d8701d`;
its infrastructure assets are retained locally under `build/optimizer-development/releases/`
and have not been published by this slice. Fresh remote evidence retrieval
remains a handoff requirement; no product release is created.

## N1 polynomial implementation checkpoint (not yet qualified)

The shared approximate polynomial classes are generalized to generic classes,
retaining their previous approximate/cyclotomic routes. Simple number fields
use canonical exact sparse terms and the existing bounded sparse engine.
Exact division, gcd/xgcd, derivatives, Sylvester resultants, squarefree layers,
simultaneous substitution and existing-coordinate homogenization now have
focused runtime fixtures over five field presentations and three term orders.
SageMath 10.9.post1 independently confirms the resultant/squarefree examples
and the three distinct monomial-order witnesses.

The first runtime pass caught a missing coercion division hook; a subsequent
pass caught keyword-boundary conversion. Both are fixed. All seven focused
tests then pass, including approximate, cyclotomic and finite-extension
regressions. The eight-stage build passed before the division-hook fix; the
compiler and runtime caches were rebuilt after that fix. This is local Linux
x64 evidence only, not production portability qualification.

The new lazy module brings polynomial-algorithms to 332,830 source bytes;
its reviewed lazy source allocation grows to 340,000, without changing eager
or compressed artifact limits. Remaining N1 work includes coefficient-height
and allocation guards, broader public API/serialization review and fixtures.
N2/N3 remain disabled. Strict Python passes for 404 modules, and the full
architecture check passes after source-derived evidence regeneration. The
native inventory diff adds only polynomial.py as an existing export consumer;
no new handwritten native code is introduced. Optimizer evidence remains
local, with identity `d70ec656ca6f6971509f7f20f22c8bd80b960083d12f43766d17350f7881d07a`.

## Baseline and qualification caveats

The integrated main audit records eight legacy full-corpus failures: one
algebra timeout and seven explicit lazy-import closure failures. They are
not silently skipped or treated as number-field successes; see
[the merge-wave audit](live-ready-merge-wave-20260912.md). The normal public
runtime and production portable artifact require independent qualification.

The first clean-worktree build stopped because its upstream grammar submodules
were not initialized. Initializing the pinned submodules resolves that setup
failure; no grammar or compiler change was made. The existing FLINT direct
addon is reused only after the current source/runtime/environment/content-hash
validator accepts it, then independently copied into this worktree. Existing
validated dependency prefixes are reused rather than rebuilt.

No N1/N2/N3/N5 acceptance checklist is complete at this historical checkpoint. Native
four-platform parity, production Wasm and browser tests, independent fixtures,
resource-envelope evidence and final capability promotion remain required.

## N2/N3 implementation checkpoint (2026-09-13; qualification pending)

The public generic number-field polynomial parent now participates in exact
ideal dispatch, certified Buchberger, all three global orders, ideal operations,
quotients, FGLM, and affine/projective geometry. Multiplication matrices retain
K-valued entries in the existing portable storage; their minimal and
characteristic polynomials do not coerce coefficients to QQ. This does not add
a native matrix backend.

The new lazy Trager factorizer uses public K[x] Euclidean operations and a
fraction-free QQ[x] determinant norm. Squarefree separating norms, complete
rational irreducible factors, nonconstant gcd recovery, and reconstruction
jointly justify the answer. Zero-dimensional decomposition reuses the existing
perfect-field algorithms and retains nonsplit residue extensions.

Local checks have passed for five field presentations, 75 independent SageMath
10.9.post1 fixtures (libSingular standard bases and independent number-field
factorization), basic geometry, FGLM, and primary decomposition/reintersection.
The fixture generator and full field coordinates are committed with the tests;
Sage and Singular remain oracle-only. Automated regressions and production
qualification are still in progress. No four-platform or Wasm success is
claimed by this checkpoint.

Reviewed source-budget changes: linear-algebra bootstrap allocation increases
451000 -> 453000 bytes for the K-valued storage/characteristic-polynomial
boundary (actual 451807 before final formatting). Polynomial-algorithms lazy
allocation increases 340000 -> 350000 for the factorizer and generic dispatch
(actual about 349 KB). Compressed production/startup gates remain unchanged.

See [number-field geometry](../docs/number-field-geometry.md) for supported
operations, exact solving semantics, and explicit resource limits. PR #274
remains draft until the production qualification gates are satisfied.

Local post-build evidence: eight-stage build passed in 7m49s (41 authenticated
native kernel families reused); strict Python passes for 405 modules; complete
architecture checks pass. Existing QQ/prime-field geometry, finite-extension
geometry/decomposition, 108 finite-extension Sage fixtures, and the new
number-field factorization/decomposition/75-oracle checks pass. The proof-policy
fixture originally compared Sequence object identities; comparing polynomial
lists fixes that test, and its certified ideal checks pass. A fresh complete
number-field batch is retained in `n23-numberfield-final.log`.

The earlier `n23-unit.log` is invalid evidence: a concurrent full build replaced
the compiler while that batch ran. It is superseded by the post-build runs.
Logs are in `/home/user/sagejs-extension-qualification-20260912/` with `n23-`
prefixes. Optimizer identity is
`34e22a53c8d947ab1c8cdf1d3a7b2743c456d5af181b3e9e5a5c0914d3f64d80`;
its infrastructure assets remain local at this checkpoint.
