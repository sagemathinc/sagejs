# TODO

- Separate generated production backends from explicitly named legacy
  compatibility/oracle backends. Production package loaders must not retain
  handwritten implementations of declared operations.
- Migrate remaining mathematical N-API families to ordinary Python,
  source-transparent `@native` kernels, or declared external-library FFI. Keep
  each old native path only as a differential oracle until deletion.
- Make every declared FFI dynamic fallback behave identically in a source
  checkout, the SEA, future CPython adapters, and WebAssembly-capable hosts.
- Use compiler-owned packed mathematical objects where they give a complete,
  fast host-independent vertical slice; use generated opaque resources for
  mature exact libraries and copy only at explicit representation boundaries.
- Replace the narrow exact-root reconstruction exception for packed `ZZ[x]`
  and `QQ[x]` after algebraic-number resources have a declared generated FFI
  representation.
- Migrate exact power and Laurent series from private FLINT polynomial state to
  compiler-owned packed coefficients, then delete their audited polynomial
  reconstruction ingress.
- Add compiler-level shared external-memory accounting tokens if measurements
  show that explicitly closing a context wrapper while dependent generated
  resources retain that context materially distorts V8 garbage-collection
  decisions. Never count the same shared allocation once per dependent.
- Define one canonical, cross-host Python builtin namespace authority shared by
  generated execution, completion, standalone output, workers, Node, and the
  browser. It must preserve live monkey-patching and custom `__builtins__`,
  allow a deleted module binding to fall back to a real Python builtin, and
  never expose a same-named JavaScript host global. Do not add a Node-only
  bootstrap intrinsic as a partial solution.
- Split the bootstrap `matrix.py` implementation into ordinary, domain-focused
  modules before the linear-algebra package reaches its temporary 410 KB source
  ratchet. Keep the public `Matrix` API unified while making exact-integer,
  rational, prime-field, and generic host dispatch independently readable and
  claimable by parallel agents.
- Finish public dense-vector storage over `GF(2)` and small `GF(p)`. Exact
  `ZZ` and `QQ` vectors now canonically own generated resources; their remaining
  matrix-vector bridge is list-free but should become a direct resource ABI so
  it no longer copies through a temporary `ByteRegion`.
- Make word-characteristic finite-extension scalars a complete generated
  `FqContext`/`FqElement` resource slice behind forced routing first: cover
  construction, arithmetic, canonical coordinates, hashing, serialization,
  lifecycle, one borrowed typed-Python kernel, and real WebAssembly. Migrate
  extension polynomials and matrices before flipping the public default; never
  retain generated and legacy scalar objects simultaneously.
- Complete generated sparse-random `QQ` construction for the `1/n`
  distribution and numerator/denominator bounds beyond 32 bits; both currently
  fall back to dense host loops.
- Accept general finite Python iterables such as `range` in polynomial-ring
  construction with the same semantics as Sage; list and tuple construction
  already work.

## Release engineering

- Build Linux release candidates on an explicit old-glibc baseline and audit
  the top-level executable plus every embedded native addon. Treat undeclared
  loader dependencies such as `libatomic.so.1` as release blockers: eliminate
  them, link them statically, or ship and bind an auditable runtime library;
  never assume a target host happens to have the package installed.
- Preserve CPU-portable mathematics in official artifacts: GMP fat dispatch,
  portable compiler flags, and runtime-selected optimized libraries must be
  distinguished from opt-in CPU-native development builds in exact receipts.
- Make native and SEA outputs independently reproducible across checkout paths:
  publish logical-only native-kernel indexes, use deterministic prefix maps in
  compiled dependencies, bind assembly policy and dependency identities, and
  validate clean rebuilds on Linux x64 and macOS arm64.
- Finish hermetic release-candidate validation: strict child-environment
  allowlists, deterministic archives, atomic publication, artifact-bound
  provenance, bounded caches, cleanup on failure, and clean install, upgrade,
  corrupt-input, relocation, and exact-mathematics tests.

## Measurement and performance ergonomics

- Move mathematical representation and algorithm crossover policy out of
  `matrix.py`, `polynomial.py`, and similar public modules into
  CPython-parseable declarations with checked-in portable and host-family
  tuning profiles, deterministic JSON lowering, explainable selection, and
  benchmark provenance. Keep hard capability limits distinct from measured
  thresholds and permit an explicitly activated local tuning profile.
- Add authoritative benchmark recorders for multi-host evidence. Exact-subspace
  history must retain raw samples plus clean commit, host, native-profile,
  build, correctness, and timing-scope identity; algorithm comparisons must
  emit complete `sagejs.math-dispatch/benchmark-v1` training and validation
  grids. Never reconstruct checked-in evidence from human-readable transcripts,
  and keep fitted threshold proposals inert until independently validated.
- Ratchet cold production-kernel loading separately from warm mathematical
  execution, and never silently compile a missing production kernel in an
  ordinary installed session.
- Make release-native objects byte-reproducible across independent checkouts in
  three explicit stages: (1) teach the native compiler to use logical source
  provenance for cache identity, generated wrapper registration, IR, and
  `#line` directives while retaining absolute paths only in private diagnostics;
  (2) build node-gyp addons and static dependencies in a canonical staging root
  with compiler-supported file, macro, and debug prefix maps whose normalized
  policy is part of the native profile/cache identity, plus fixed source epochs
  and deterministic archive/link settings (including ClangCL `/pathmap` and
  `/Brepro` equivalents on Windows); and (3) compare independently built
  archives and addons byte-for-byte and scan them for checkout/build prefixes.
  Do not claim reproducibility merely because published metadata is relocatable.
