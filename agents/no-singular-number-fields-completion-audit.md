# No-Singular number fields: implementation audit

Status: **Milestone N started; no production qualification claimed.**

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

No N1/N2/N3/N5 acceptance checklist is complete at this checkpoint. Native
four-platform parity, production Wasm and browser tests, independent fixtures,
resource-envelope evidence and final capability promotion remain required.
