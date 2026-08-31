# P0-P8 numerical product campaign

The product campaign turns the P0-P8 plan into executable, source-bound and
artifact-bound evidence without making a release claim before the release
hosts run it. Its inputs are:

- `bench/numerical-computing/qualification/product.corpus.json` — 31
  backend-neutral cases spanning P0 through P8 and all seven evidence layers;
- `bench/numerical-computing/qualification/node-adapter.cjs` — a first-party
  adapter which loads `dist/tools/kernel.js`, creates a real Python-mode
  Sage.js session, instantiates the exact separately built cminpack Wasm
  reactor, runs each operation in those artifacts, and computes its independent
  residual/oracle evidence in the host adapter;
- `bench/numerical-computing/qualification/capabilities/node-capability-spec.json`
  — authored claims and exact case allowlists; and
- the reviewed four-platform and full-runtime matrix templates under
  `bench/numerical-computing/qualification/matrix/`.

Nothing in these files is a platform receipt. In particular, the matrix
templates contain no hashes, runtime versions, timings, memory values, or
payload values. Those facts appear only after binding and measurement on the
candidate host.

## Evidence coverage

The campaign executes the integrated root, interpolation, polynomial-root,
quadrature, dense-linear-algebra, scalar and cminpack optimization, explicit
and stiff ODE, ODE-sweep, dense-spectral, FFT, statistics, bounded-sweep,
multilingual-root, and six-domain teaching-artifact surfaces. It contains:

- definition and identity examples;
- exact or mature-reference differential oracles;
- residuals recomputed outside the Sage.js result validator;
- extreme finite scaling, clustered polynomial roots, stiff flow, and
  singular/failure cases;
- deterministic fuzz whose input stream is regenerated independently in
  JavaScript;
- root-translation and four-language round-trip metamorphisms;
- cancellation, callback-exception, evaluation-budget, and Wasm-allocation
  lifecycle fault injection;
- a same-session repeated cross-domain campaign; and
- collector-level cold initialization, wall time, RSS, process high-water RSS,
  source/artifact bytes, and repeated-observation determinism.

The adapter never returns a `passed` field. It returns observed values and
structured outcomes. The generic collector evaluates the corpus checks.
Solver-reported validation is retained as an additional observation for some
cases, never as the only mathematical evidence.

## Prepare and collect one Node receipt

Build the exact candidate once, then use a fresh output directory:

```sh
pnpm build
node packages/flint-wasm/numerical/scripts/build.cjs
node scripts/numerical-computing/qualification/prepare-node.cjs \
  --artifact dist \
  --cminpack-artifact packages/flint-wasm/numerical/build/cminpack.wasm \
  --output build/numerical-qualification/linux-x64-node
```

The prepare command derives the actual Node version, binds the corpus, complete
numerical source directory, adapter, and `dist` artifact closure, writes an
immutable capability manifest, and prints the exact collection command. The
manifest binds `dist` and the exact cminpack Wasm bytes separately, so neither
artifact can be rebuilt or substituted after preparation. Run that command in
a cold process, for example:

```sh
node scripts/numerical-computing/qualify.cjs run \
  --corpus bench/numerical-computing/qualification/product.corpus.json \
  --adapter bench/numerical-computing/qualification/node-adapter.cjs \
  --capabilities build/numerical-qualification/linux-x64-node/capabilities.json \
  --artifact sagejs-dist=dist \
  --artifact cminpack-wasm=packages/flint-wasm/numerical/build/cminpack.wasm \
  --output build/numerical-qualification/linux-x64-node/node.receipt.json

node scripts/numerical-computing/qualify.cjs verify \
  build/numerical-qualification/linux-x64-node/node.receipt.json \
  --require-clean
```

Use the same commands on `bench-1`, `bench-arm`, `m1`, and `windows`. A dirty
development checkout can produce diagnostically useful evidence, but it cannot
satisfy either checked-in release template because both require clean receipts.
Do not copy or relabel a receipt from another machine.

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

The full-runtime template additionally requires SEA on all four platforms,
Chromium, Firefox, WebKit, and browser-worker recovery evidence. It is
intentionally impossible to render that policy with only the Node adapter.
Future first-party SEA/browser/worker adapters must return their observed
subject versions and execute the corresponding artifact; a Node collector
cannot impersonate them.

## Extending the corpus

Polynomial roots, Rosenbrock4, bounded ODE sweeps, and cminpack's `lmdif` and
`lmder` methods are now executable required capabilities. Future slices such
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
