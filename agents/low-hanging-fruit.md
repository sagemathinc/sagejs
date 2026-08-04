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
5. **done — decomposition refinement at bad primes.** Split repeated anemic
   constituents using `U_p` and diamond operators, preserving the fast good-
   prime path. ``decomposition(anemic=False)`` now refines by every bad-prime
   `U_p`; fixed-character diamond operators are scalar and therefore need no
   further kernels. Small composite-level dimensions are checked directly
   against SageMath.
6. **measure — modular-symbol benchmark grid.** Maintain deterministic cases
   varying level, factorization pattern, weight, sign, character order,
   coefficient-field degree, Hecke index, cuspidal/new projection, and
   decomposition. Store dimensions and characteristic polynomials as
   correctness witnesses, not just timings.

## Exact algebra and native kernels

7. **done — native vertical matrix concatenation.** Avoid materializing
   ZZ/QQ entries in JavaScript in `Matrix.stack`, matching the native augment
   path.
8. **done — audit matrix operations for accidental `.list()` crossings.** Add
    native ZZ/QQ fast paths for the highest-volume structural operations, with
    rectangular and empty-matrix tests. Subspace membership, sums, and
    intersections now compose native matrices; matrix copies use native row
    selection; zero testing runs entirely in the FLINT addon; and minimal-
    polynomial construction materializes each power only once. Empty and
    duplicate row/column selections and all native base families are covered.
9. **measure — finite-field linear-algebra cutoff corpus.** Record crossover
   points between classical, packed/BLAS, and asymptotically fast algorithms
   by field size, shape, and architecture. Treat cutoffs as benchmarked data.
10. **ready — finite-field constructor coverage.** Add explicit modulus
    polynomial construction and serialization round trips where the native
    backend already supports the field.
11. **done — polynomial and ideal serialization long tail.** Cover quotient
    rings, extension finite fields, multivariate ideals, and Groebner bases
    with deterministic binary encodings and cross-process tests. SagePack now
    has package-owned, non-evaluating codecs for canonical extension fields,
    multivariate polynomial rings and elements, number-field polynomial
    quotients, ideals, and immutable Groebner-basis sequences.

## Python language and standard library

12. **measure — CPython compatibility harvesting.** Add small, reviewed vectors
    from one CPython stdlib module at a time; classify each failure as compiler,
    runtime, host capability, or deliberate incompatibility.
13. **done — `os`, `os.path`, and `pathlib` long tail.** Fill portable path,
    stat, directory-walk, link, permission, and environment behavior using the
    host adapter; keep imports safe in browsers and fail only when a host-only
    operation is called. Path-like objects now cross every generic path query,
    hard-link identity uses device/inode semantics, `Path.walk` preserves its
    three-field records, symlinked directories are classified without being
    followed by default, and `fsencode`, `fsdecode`, `renames`, `removedirs`,
    mount detection, and strict string-only environments cover the portable
    host-facing tail.
14. **done — file-object compatibility.** Extend buffering, seeking,
    iteration, newline handling, encodings, context-manager behavior, and
    exception attributes using CPython's focused IO tests. Host files now
    distinguish default, line, and unbuffered writes; report universal newline
    types; honor every explicit newline delimiter; reject unsupported text
    seeks; and expose binary `readinto`/`read1` behavior. `StringIO` and
    `BytesIO` share the readable, writable, seekable, line-iteration, and
    bulk-line surface.
15. **done — `multiprocessing` API long tail.** Add `imap`, unordered results,
   async results, initializers, timeouts, worker exceptions, and robust pool
   shutdown over worker threads. Preserve Python-facing semantics while
   documenting the intentional shared-process model. Synchronous `apply`,
   `imap`, and `imap_unordered` are done. `apply_async`, `map_async`, and
   `starmap_async` now return CPython-style result handles with readiness,
   success, timeout, callback, and error-callback behavior. Initializers run
   once in each persistent evaluator, built-in worker exceptions retain their
   Python types, and close, terminate, and join preserve pending-result state.
16. **ready — common pure utility modules.** Expand `functools`, `itertools`,
    `collections`, `statistics`, `bisect`, `heapq`, `operator`, `textwrap`, and
    `re` only through differential tests, keeping them lazy at startup. The
    CPython 3.14 `operator` function and callable-getter APIs and streaming
    `heapq.merge` are done. `bisect` now enforces CPython-compatible integer
    bounds, including `__index__` coercion and argument parsing before key
    calls. `collections.deque` now enforces integer-only construction and
    CPython-compatible index coercion and bound normalization. `functools`
    now validates and normalizes `lru_cache` capacities and includes keyword
    argument types in typed cache keys. `statistics.harmonic_mean` now validates
    weighted inputs and ignores zero-valued data carrying zero weight, matching
    CPython's weighted edge-case semantics. `statistics.quantiles` now uses
    exact-index interpolation for inclusive and exclusive cut points, including
    extrapolated small-sample tails and singleton samples. `heapq.nsmallest`
    and `nlargest` now use the public `n` parameter name and return immediately
    for non-positive counts without consuming their inputs. `functools`
    `update_wrapper` now merges the configured wrapper attributes and preserves
    custom function metadata like CPython. `collections.deque` now supports
    indexed deletion, including negative and `__index__`-coerced positions.
    `functools.total_ordering` now derives comparisons from any of CPython's
    four supported ordering roots and rejects classes without one.
    `statistics.correlation` now supports Spearman ranked correlation with
    averaged ties and reports CPython-compatible validation errors for
    mismatched, constant, and unknown-method inputs.
    `collections.OrderedDict` now compares order-sensitively with its own type,
    compares like a mapping with other mappings, supports reverse iteration,
    implements `move_to_end` in both directions, and rejects extra `pop`
    defaults before mutating the mapping.
    `collections.Counter` now compares counts with CPython's missing-as-zero
    equality and subset/superset semantics. Its `elements` iterator now accepts
    `__index__` counts and rejects non-integral counts instead of truncating them.
    Copies now preserve their key/count mapping instead of counting item pairs
    as new elements. Counter arithmetic now rejects unsupported binary operands
    through `NotImplemented` and implements the four in-place multiset operators
    with identity, ordering, and non-positive-count filtering preserved.
    `collections.defaultdict.copy` now preserves the default factory, shallow
    value sharing, independent key storage, and the concrete subclass.
    `collections.deque.maxlen` is now read-only, preventing post-construction
    changes from invalidating bounded-deque behavior.
    `collections.ChainMap` lookups now invoke child mapping `__missing__`
    behavior and fall back through the chain's overridable `__missing__` hook.
    Empty `collections.ChainMap` construction now installs the required first
    mapping and remains falsey, preserving its invariants under compiled
    tuple and mapping truthiness.
    Its core mapping helpers now preserve first-map-only mutation, including
    `clear`, `pop`, `popitem`, `setdefault`, `update`, and copying, while `get`
    avoids triggering child `defaultdict` factories. Mapping unions now
    preserve concrete subclasses, child-map sharing, and CPython's left/right
    precedence and in-place mutation behavior.
    `collections.OrderedDict` mapping unions now preserve operand precedence,
    insertion order, concrete subclasses, and `defaultdict` factories across
    ordinary, reflected, and in-place operations.
    `collections.deque` in-place concatenation now accepts arbitrary iterables,
    preserves identity and bounds, and safely snapshots self-extension from
    either end.
    `collections.Counter` unary multiset operators now preserve count
    magnitudes and insertion order while filtering counts by sign, without
    mutating the source or preserving its subclass.
    `collections.deque.index` now distinguishes an omitted stop bound from an
    explicit `None`, rejecting the latter like CPython instead of searching to
    the end.
    `most_common` now rejects non-integer limits and normalizes non-positive
    limits instead of relying on JavaScript slice coercion, while `fromkeys`
    reports its intentionally undefined semantics. `collections.deque` now
    implements CPython-compatible equality and lexicographic ordering against
    other deques, independent of `maxlen`. Deque concatenation and repetition
    now preserve the left operand's type and bound, including reflected and
    identity-preserving in-place repetition.
    `operator.index` now validates the `__index__` result and reports missing
    index support with CPython-compatible `TypeError` behavior.
    `functools.partial` now exposes its function, positional arguments, and
    keyword mapping through read-only attributes while preserving mutation of
    the keyword mapping itself. Nested partials now flatten to the underlying
    callable with concatenated arguments and merged keyword snapshots.
    `functools.cached_property` now records its owning attribute through
    descriptor binding and rejects reuse under a second name.

## Graphics and foreign-language compatibility

17. **measure — Sage 2D graphics option matrix.** Harvest upstream examples by
    primitive and option, compare normalized Plotly specs, and implement one
    bounded option family at a time: axes/frame, aspect ratio, legends,
    labels, ticks, scales, fills, and regions. Named/custom `complex_plot`
    colormaps and correct indexed/attribute color-map access are done.
18. **done — Sage 3D transformations and composition.** Complete translate,
    scale, rotate, texture/material propagation, mesh/wireframe styling,
    opacity, aspect ratio, and camera behavior across every primitive. Affine
    transforms cover both coordinates and direction vectors while preserving
    per-face colors and trace styling. Plotly scenes now implement Sage's
    Three.js `projection`, axis-angle `viewpoint`, and positive `zoom` camera
    options.
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

23. **done — serialization throughput guardrails.** Benchmark representative
    dense/sparse matrices, polynomials, fields, modular-symbol spaces, graphics,
    and nested containers against Sage `save`/`load`; keep binary bulk data out
    of per-element Python/JavaScript loops. The comparison suite now spans
    dense and sparse-content matrices, multivariate polynomials, number and
    character fields, modular-symbol factors, Plotly graphics payloads, and
    nested containers. CI replaces each dense matrix's `.list()` method with a
    failing sentinel and enforces packed-size and catastrophic-time ceilings,
    proving ZZ, QQ, and prime-field codecs remain on native bulk exporters.
24. **done — worker-transfer serialization.** Use the serialization registry
    for zero-copy or single-copy worker messages where possible, with ownership
    and mutation semantics tested explicitly. Worker packets now move fresh
    codec-owned native buffers without another copy while caller-owned byte
    arrays retain copy-on-send semantics and remain attached.
25. **done — normalized startup guardrail.** Fresh-process medians are compared
    with contemporaneous bare Node startup, with a 300 ms normalized budget
    and a separate catastrophic raw ceiling so loaded CI does not create flaky
    failures. The final overnight run measured 236.6 ms normalized. Import
    accounting for first use of each major package remains a separate measure.
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
