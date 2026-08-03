# Sage.js low-hanging-fruit queue

This is a living execution queue for bounded improvements that can be
implemented and verified against SageMath, CPython, Mathematica, or existing
Sage.js behavior. It deliberately excludes vague goals such as "finish
symbolics". An item belongs here only when the relevant implementation is
already nearby and there is a concrete compatibility or performance oracle.

Status meanings:

- **ready**: narrow enough to start without further design work.
- **active**: currently being implemented.
- **done**: implemented, covered by focused tests, and committed.
- **measure**: first produce a differential corpus or profile; do not guess.

## Modular symbols and modular forms

1. **done — weight-2 Gamma0 newspaces in signs -1 and 0.** Reuse the native
   degeneracy kernels already used for sign 1. Check full-new and `p`-new
   dimensions against SageMath at prime powers and levels with several prime
   factors.
2. **done — expose degeneracy maps on modular-symbol spaces.** Lift the native
   ambient map through source and target basis matrices and support the common
   Sage call forms. Verify dimensions, composition, and Hecke equivariance.
3. **done — higher-weight Gamma0 degeneracy kernels.** Generalize the native
   Manin-symbol map to the polynomial coefficient module, beginning over QQ.
   Compare signs 0, -1, and 1 with Sage and Magma before optimizing.
4. **measure — Dirichlet-character newspaces.** Implement lowering exactly
   when the character descends to the target level; reject the other cases
   explicitly. Test over cyclotomic fields of several degrees. Primitive
   characters and individual primes with no lower-level character are done.
5. **ready — decomposition refinement at bad primes.** Split repeated anemic
   constituents using `U_p` and diamond operators, preserving the fast good-
   prime path.
6. **measure — modular-symbol benchmark grid.** Maintain deterministic cases
   varying level, factorization pattern, weight, sign, character order,
   coefficient-field degree, Hecke index, cuspidal/new projection, and
   decomposition. Store dimensions and characteristic polynomials as
   correctness witnesses, not just timings.

## Exact algebra and native kernels

7. **done — native vertical matrix concatenation.** Avoid materializing
   ZZ/QQ entries in JavaScript in `Matrix.stack`, matching the native augment
   path.
8. **ready — audit matrix operations for accidental `.list()` crossings.** Add
   native ZZ/QQ fast paths for the highest-volume structural operations, with
   rectangular and empty-matrix tests.
9. **measure — finite-field linear-algebra cutoff corpus.** Record crossover
   points between classical, packed/BLAS, and asymptotically fast algorithms
   by field size, shape, and architecture. Treat cutoffs as benchmarked data.
10. **ready — finite-field constructor coverage.** Add explicit modulus
    polynomial construction and serialization round trips where the native
    backend already supports the field.
11. **ready — polynomial and ideal serialization long tail.** Cover quotient
    rings, extension finite fields, multivariate ideals, and Groebner bases
    with deterministic binary encodings and cross-process tests.

## Python language and standard library

12. **measure — CPython compatibility harvesting.** Add small, reviewed vectors
    from one CPython stdlib module at a time; classify each failure as compiler,
    runtime, host capability, or deliberate incompatibility.
13. **ready — `os`, `os.path`, and `pathlib` long tail.** Fill portable path,
    stat, directory-walk, link, permission, and environment behavior using the
    host adapter; keep imports safe in browsers and fail only when a host-only
    operation is called.
14. **ready — file-object compatibility.** Extend buffering, seeking,
    iteration, newline handling, encodings, context-manager behavior, and
    exception attributes using CPython's focused IO tests.
15. **ready — `multiprocessing` API long tail.** Add `imap`, unordered results,
   async results, initializers, timeouts, worker exceptions, and robust pool
   shutdown over worker threads. Preserve Python-facing semantics while
   documenting the intentional shared-process model. Synchronous `apply`,
   `imap`, and `imap_unordered` are done; async results and initializers remain.
16. **ready — common pure utility modules.** Expand `functools`, `itertools`,
    `collections`, `statistics`, `bisect`, `heapq`, `operator`, `textwrap`, and
    `re` only through differential tests, keeping them lazy at startup.

## Graphics and foreign-language compatibility

17. **measure — Sage 2D graphics option matrix.** Harvest upstream examples by
    primitive and option, compare normalized Plotly specs, and implement one
    bounded option family at a time: axes/frame, aspect ratio, legends,
    labels, ticks, scales, fills, and regions. Named/custom `complex_plot`
    colormaps and correct indexed/attribute color-map access are done.
18. **ready — Sage 3D transformations and composition.** Complete translate,
    scale, rotate, texture/material propagation, mesh/wireframe styling,
    opacity, aspect ratio, and camera behavior across every primitive.
19. **ready — Sage graphics primitives long tail.** Port missing pure-Python
    constructors and docstrings from the GPL-compatible Sage source, using
    Plotly rendering and image-based smoke tests for representative scenes.
    The public `IndexFaceSet` constructor, topology accessors, direct/indexed
    face forms, and per-face colors are done.
20. **ready — Mathematica graphics directives.** Support nested directives and
    options such as colors, opacity, thickness, edge forms, lighting, plot
    range, axes, and boxed state consistently in `Graphics` and `Graphics3D`.
21. **measure — Mathematica plotting example corpus.** Translate the basic
    examples from official reference pages into a manifest, then implement a
    visually impressive but explicitly bounded subset of 2D and 3D plotting.
22. **ready — graphics export dimensions.** Make `figsize`, pixel density, and
    raster/vector export sizes agree across Jupyter display, Chromium export,
    CLI saves, and composed graphics.

## Architecture, performance, and reproducibility

23. **ready — serialization throughput guardrails.** Benchmark representative
    dense/sparse matrices, polynomials, fields, modular-symbol spaces, graphics,
    and nested containers against Sage `save`/`load`; keep binary bulk data out
    of per-element Python/JavaScript loops.
24. **ready — worker-transfer serialization.** Use the serialization registry
    for zero-copy or single-copy worker messages where possible, with ownership
    and mutation semantics tested explicitly.
25. **ready — startup import accounting.** Record which modules load for empty
    CLI, one exact integer expression, and first use of major packages. Enforce
    both normalized timing and an import-count/byte budget so busy CI machines
    do not create flaky failures.
26. **ready — package-boundary enforcement expansion.** Require every new
    package and native capability to declare its dependency layer, lazy-load
    behavior, serialization types, browser behavior, and Windows status.
27. **ready — cross-platform release smoke corpus.** Run the same SEA tests on
    Linux x64/arm64, Windows x64, and macOS arm64, including native arithmetic,
    filesystem IO, serialization, multiprocessing, and a Plotly export.
28. **measure — reproducible database jobs.** Define a checkpointed job/result
    format for recomputing LMFDB slices in parallel, including inputs, code and
    dependency hashes, mathematical witnesses, timing, and resumable shards.

## Execution rule

Prefer completing a numbered item—including reference comparison, regression
tests, documentation, and a focused commit—over starting several. Update its
status here in the same commit. If profiling or reference data invalidates the
"low-hanging" label, change it to **measure** and record the actual blocker.
