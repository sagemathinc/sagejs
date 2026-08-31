# P0-P8 numerical product campaign

The product campaign turns the P0-P8 plan into executable, source-bound and
artifact-bound evidence without making a release claim before the release
hosts run it. Its inputs are:

- `bench/numerical-computing/qualification/product.corpus.json` — 63
  backend-neutral cases spanning P0 through P8 and all seven evidence layers;
- `bench/numerical-computing/qualification/node-adapter.cjs` — a first-party
  adapter which loads `dist/tools/kernel.js`, creates a real Python-mode
  Sage.js session, instantiates the exact separately built cminpack Wasm
  reactor, verifies that the separately bound NLopt Wasm is the exact lazy
  resource used by that session, runs each operation in those artifacts, and
  computes its independent residual/oracle evidence in the host adapter;
- `bench/numerical-computing/qualification/package-adapter.cjs` — a first-party
  adapter which either installs exact root/platform npm tarballs into an empty
  consumer or relocates one exact SEA executable, then runs the same corpus
  through those installed bytes and the real Sage/Python/MATLAB/Wolfram command
  paths;
- `bench/numerical-computing/qualification/browser-adapter.cjs` — a first-party
  Playwright adapter which serves one exact browser artifact with COOP/COEP,
  starts its real worker-backed kernel, and records the actual Chromium,
  Firefox, WebKit, or worker subject version; and
- `bench/numerical-computing/qualification/capabilities/node-capability-spec.json`
  — authored claims and exact case allowlists; and
- the reviewed four-platform and full-runtime matrix templates under
  `bench/numerical-computing/qualification/matrix/`.

Nothing in these files is a platform receipt. In particular, the matrix
templates contain no hashes, runtime versions, timings, memory values, or
payload values. Those facts appear only after binding and measurement on the
candidate host.

## Evidence coverage

The campaign executes the integrated root, interpolation, cubic-spline,
finite-difference, Chebyshev, polynomial-root, quadrature, dense-linear-solve,
QR/Cholesky factorization, scalar/cminpack/NLopt optimization, explicit and
stiff ODE, ODE sweep, symmetric/general eigen, SVD, FFT, convolution,
sparse-solve/eigen, descriptive/inferential/RNG/regression statistics,
bounded-sweep, multilingual-root and 22-operation multilingual-catalog, and
seven-domain teaching-artifact surfaces. It contains:

- definition and identity examples;
- exact or mature-reference differential oracles;
- residuals recomputed outside the Sage.js result validator;
- extreme finite scaling, clustered polynomial roots, stiff flow, and
  singular/failure cases;
- definition-level spline and finite-difference identities, independent
  Chebyshev value/derivative samples, QR orthogonality/reconstruction,
  Cholesky reconstruction/structure, general-eigen and SVD invariants, direct
  convolution, sparse residuals, pinned inference, reproducible PCG state,
  and independent centered-sum regression coefficients;
- deterministic fuzz whose input stream is regenerated independently in
  JavaScript;
- root-translation, four-language scalar-root round trips, and the complete
  reviewed 63-supported/25-unsupported frontend target matrix, including
  checksummed-body rejection for 59 envelope-bound emitters, semantic parsing
  for four scalar-root emitters, and equivalent four-language execution;
- direct built-parser evidence that six unsafe MATLAB/Wolfram mappings fail
  closed with typed, positioned diagnostics while qualified integral forms
  still lower to the shared runtime;
- eleven programs executed through the built MATLAB parser proving one-output
  column-vector shape, row/column callback-orientation preservation, and
  container-shape preservation;
- missing and corrupt cminpack optional-resource fault injection proving that
  automatic least squares remains on the validated ordinary-Python method,
  while explicit cminpack requests fail with stable structured diagnostics and
  do not leak private resource details;
- exact explicit-only `nlopt-nelder-mead` and `nlopt-cobyla` public routes,
  including Rosenbrock and active-circle oracles, the one-dimensional equal
  simplex-value regression, convergence at a zero-scale optimum, independent
  rejection of a mixed-curvature saddle and a feasible constrained
  non-minimum, independent rejection of a positive backend status on
  incompatible constraints, truthful external-Wasm provenance after callback
  failure and cancellation, backend-specific lazy cache reuse/isolation, and
  missing/corrupt optional-resource behavior;
- execution of four artifact-emitted Python/SciPy programs in an isolated
  CPython process, followed by independent Node-side residual/oracle checks;
- failed-result projection, replayable-expression, callback-consistency, and
  portable operand/envelope resource guards;
- cancellation, callback-exception, evaluation-budget, and Wasm-allocation
  lifecycle fault injection;
- renderer-neutral views constructed exclusively from retained evidence, with
  callback replay forbidden and cross-platform semantics checked by structure
  plus explicit numeric tolerances rather than byte identity, including a
  repeated scalar-minimization view witness that checks callback counters;
- a 64-cycle same-session repeated cross-domain campaign, an explicit
  post-failure recovery witness, real browser-worker interruption/replacement,
  and a bounded 131072-sample memory-pressure workload; and
- collector-level cold initialization, wall time, RSS, process high-water RSS,
  source/artifact bytes, and repeated-observation determinism.

The adapter never returns a `passed` field. It returns observed values and
structured outcomes. The generic collector evaluates the corpus checks.
Solver-reported validation is retained as an additional observation for some
cases, never as the only mathematical evidence.

The `numerics.frontend.scipy_execution` capability is observed only when the
host adapter can launch isolated CPython with both NumPy and SciPy. A host
without that independent runtime cannot satisfy this campaign row: generated
source text alone is deliberately not counted as executable-language evidence.

Every adapter probes the mathematical modules available in its exact artifact
before returning capability IDs. Missing lazy browser modules therefore make
the affected cases fail with `missing-capability-evidence`; an adapter never
claims the authored capability list merely because files exist in the source
checkout. The cminpack success and cancellation cases are ordinary portable
Python/runtime programs, so Node, browser-worker, fresh npm, and relocated SEA
all execute the same resource boundary rather than an adapter-owned fake.

## Prepare and collect one Node receipt

Build the exact candidate once, then use a fresh output directory:

```sh
pnpm build
node packages/flint-wasm/numerical/scripts/build.cjs
node scripts/numerical-computing/qualification/prepare-node.cjs \
  --artifact dist \
  --cminpack-artifact packages/flint-wasm/numerical/build/cminpack.wasm \
  --nlopt-artifact dist/numerical/nlopt-methods.wasm \
  --output build/numerical-qualification/linux-x64-node
```

The prepare command derives the actual Node version, binds the corpus, complete
numerical source directory, adapter, and `dist` artifact closure, writes an
immutable capability manifest, and prints the exact collection command. The
manifest binds `dist`, the exact cminpack Wasm bytes, and the exact NLopt Wasm
bytes separately, so none can be rebuilt or substituted after preparation.
The adapter additionally rejects an NLopt binding whose bytes differ from the
resource inside `dist`. Run that command in a cold process, for example:

```sh
node scripts/numerical-computing/qualify.cjs run \
  --corpus bench/numerical-computing/qualification/product.corpus.json \
  --adapter bench/numerical-computing/qualification/node-adapter.cjs \
  --capabilities build/numerical-qualification/linux-x64-node/capabilities.json \
  --artifact sagejs-dist=dist \
  --artifact cminpack-wasm=packages/flint-wasm/numerical/build/cminpack.wasm \
  --artifact nlopt-wasm=dist/numerical/nlopt-methods.wasm \
  --output build/numerical-qualification/linux-x64-node/node.receipt.json

node scripts/numerical-computing/qualify.cjs verify \
  build/numerical-qualification/linux-x64-node/node.receipt.json \
  --require-clean
```

Use the same commands on `bench-1`, `bench-arm`, `m1`, and `windows`. A dirty
development checkout can produce diagnostically useful evidence, but it cannot
satisfy either checked-in release template because both require clean receipts.
Do not copy or relabel a receipt from another machine.

## Prepare fresh npm and relocated SEA receipts

Pack the exact release candidate once. On each matching platform, bind either
its root/platform npm tarballs or its relocated executable:

```sh
node scripts/numerical-computing/qualification/prepare-package.cjs npm \
  --root-archive incoming/sagemath-sagejs-VERSION.tgz \
  --platform-archive incoming/sagemath-sagejs-linux-x64-VERSION.tgz \
  --version VERSION \
  --output build/numerical-qualification/linux-x64-npm

node scripts/numerical-computing/qualification/prepare-package.cjs sea \
  --executable incoming/sagepython \
  --version VERSION \
  --output build/numerical-qualification/linux-x64-sea
```

The npm adapter performs a new `pnpm --ignore-scripts` installation and proves
the installed source runtime. The separate package smoke proves public
`createSage()` dispatch through the platform SEA; the numerical campaign does
not substitute that SEA for the installed source surface. The SEA path copies
only the executable into a fresh directory before running it, so success
cannot depend on an adjacent checkout. Each prepare command prints the exact
artifact-bound collection command. Repeat it on the four persistent hosts with
the host's own archive/executable; never cross-run a platform row.

## Prepare browser and worker receipts

After building `packages/flint-wasm`, bind the browser tree and both separately
lazy numerical reactors:

```sh
node scripts/numerical-computing/qualification/prepare-browser.cjs \
  --engine chromium \
  --artifact packages/flint-wasm \
  --cminpack-artifact packages/flint-wasm/dist/cminpack.wasm \
  --nlopt-artifact packages/flint-wasm/dist/nlopt-methods.wasm \
  --output build/numerical-qualification/linux-x64-browser-chromium
```

Use `--engine firefox` and `--engine webkit` for the other browser rows, and
`--kind worker --engine chromium` for the dedicated worker row. Preparation launches
the requested engine and binds the version it actually reports. Collection
launches it again and rejects a version mismatch. Browser numerical outputs are
checked by host-side independent definitions/residuals; solver `success` bits
are observations, not the oracle.

## Assemble the required matrix

Transfer each host's bound capability manifest through the trusted release
workflow and render the four-platform policy:

```sh
node scripts/numerical-computing/qualification/render-matrix.cjs \
  --template bench/numerical-computing/qualification/matrix/node-four-platform.template.json \
  --corpus bench/numerical-computing/qualification/product.corpus.json \
  --manifest linux-x64-node=incoming/linux-x64/capabilities.json \
  --manifest linux-arm64-node=incoming/linux-arm64/capabilities.json \
  --manifest macos-arm64-node=incoming/macos-arm64/capabilities.json \
  --manifest windows-x64-node=incoming/windows-x64/capabilities.json \
  --output build/numerical-qualification/node-four-platform.policy.json
```

Rendering fails if any required row or available capability is missing, if a
subject does not match its reviewed row, or if rows do not bind one exact
corpus and source closure. The ordinary report command then fails with explicit
`missing` rows until every independently measured receipt is supplied.

The full-runtime template additionally requires fresh npm and relocated SEA on
all four platforms, Chromium, Firefox, WebKit, and browser-worker evidence. It
is intentionally impossible to render that policy with only the Node adapter.
The package/browser adapters return their observed subject versions and execute
the corresponding artifact; a Node collector cannot impersonate them. Until
all 16 rows have source-current manifests and measured receipts, the report
must remain missing/fail-closed.

## Extending the corpus

Polynomial roots, Rosenbrock4, bounded ODE sweeps, cminpack's `lmdif` and
`lmder`, and NLopt's exact explicit-only Nelder–Mead and COBYLA methods are now
executable required capabilities. Future slices such
as a public least-squares frontend, sparse stiff methods, additional native or
Wasm backends, and new product domains follow the same procedure:

1. add backend-neutral cases with independent evidence;
2. add the exact cases to an unavailable capability draft;
3. remove `status: unavailable` only after a first-party adapter executes the
   integrated artifact;
4. increment the corpus version if its semantic case contract changes; and
5. bind and collect new receipts. Never reuse an older capability manifest or
   receipt after source, corpus, adapter, or artifact bytes change.

The checked-in `polynomial_least_squares` and `stiff_sparse` entries illustrate
that fail-closed state. Empty allowlists are not evidence of support.
