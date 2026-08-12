# Declarative mathematical dispatch profiles

Status: declaration and selection foundation implemented; public matrix and
polynomial methods do not consume it yet.

## Implemented foundation

The first non-invasive vertical slice lives under `dispatch/` and
`tools/math-dispatch/`. It models dense prime-matrix representation policy and
the existing multiply, RREF, rank, and right-nullspace crossover choices, but
does not yet change `matrix.py`.

The checked contract is:

- `.dispatch.py` authority is parsed from Sage.js's pinned Python AST and is
  never imported or executed;
- lowering records repository-relative source locations and produces
  byte-stable, sorted-key JSON under `dispatch/generated/`;
- family declarations own closed feature types, capabilities, canonical
  representations, algorithms, conversions, and ordered fallback chains.
  Every conversion names its canonical source representation, temporary target
  layout, allocation policy, and rationale;
- profiles can select only declared algorithms. Their schema has no mechanism
  to widen a capability or replace canonical representation policy;
- the selector normalizes the complete operation feature set, evaluates hard
  capabilities, honors a checked explicit override, matches at most one most-
  specific profile, walks declared fallbacks, and returns one frozen decision
  record used by both explanation and trace;
- `uint64` features accept the full unsigned 64-bit range. Values beyond
  JavaScript's safe integer range remain canonical decimal strings in JSON and
  are compared internally as exact integers;
- benchmark evidence is correctness-stamped and binds source, declaration,
  profile-set, native-build, host, timing-scope, and conversion identities.
  The initial fitter can emit an inert adjacent integer-threshold proposal from
  separate training and validation grids; it never edits authority.

The developer commands are:

```sh
sagejs math check
sagejs math generate
sagejs math emit-json dense-prime-matrix
sagejs math explain dense-prime-matrix.multiply \
  --features '{"canonical_output":true,"inner":64,"left_rows":64,"modulus":97,"right_columns":64}' \
  --capabilities fflas,flint-prime-matrix
sagejs math evidence report.json
node bench/math-dispatch-profile.cjs report-a.json report-b.json
```

`sagejs math check` rejects stale generated JSON. The next integration phase
must add this command to the repository-wide architecture/build gate, route
public dense-prime methods through the same decision record, and then delete
the corresponding hard-coded crossover predicates.

## Decision

Mathematical crossover choices should be decoupled from public mathematical
source code. Sage.js should keep them in a small, declarative dispatch system
whose human-authored authority is CPython-parseable Python and whose runtime
input is deterministically lowered, inspectable JSON.

This is not an online optimizer and it is not permission to make semantics
host-dependent. It is a disciplined place for the familiar numerical-library
problem of choosing among several correct implementations on different
machines. The system must make five concerns visibly different:

1. hard capability constraints;
2. canonical representation policy;
3. conservative portable tuning;
4. checked host-family and native-build tuning;
5. explicit user algorithm selection.

Only the third and fourth items are benchmark-derived crossover policy.
Conflating them is dangerous. For example, Givaro's exact
`Modular<double>` modulus limit is a correctness constraint, whereas choosing
FFPACK rank at dimension 64 is a measured performance policy. The former must
never be changed by a tuning run; the latter should not live forever in
`matrix.py`.

## Current audit

The present dense prime-matrix implementation is readable, but it directly
contains policy that will become difficult to maintain across machines:

| Location | Current rule | Classification |
| --- | --- | --- |
| `matrix.py:_fflas_packed_prime_available` | modulus below 94,906,266 and backend available | hard backend capability |
| `matrix.py:_is_packed_dense_prime_base` | modulus below 256 | canonical representation policy |
| `matrix.py:_is_word_prime_resource_base` | Node host and modulus from 256 through unsigned 64-bit | host capability plus representation policy |
| `matrix.py:_use_fflas_matrix_mul` | minimum dimension at least 32 | portable tuning candidate |
| `matrix.py:_use_fflas_matrix_rref` | minimum dimension at least 32 | portable tuning candidate |
| `matrix.py:_use_fflas_matrix_rank` | minimum dimension at least 64 | portable tuning candidate |
| `matrix.py:_use_fflas_matrix_right_nullspace` | minimum dimension at least 24 | portable tuning candidate |
| `matrix.py:rank` over `ZZ` | modular certificate at 46,337, exact fallback when inconclusive | mathematical algorithm policy, not just a machine crossover |
| `polynomial.py:_mul_` packed `ZZ[x]` fallback | coefficient-length product at least 256 selects FLINT | portable tuning candidate |
| `polynomial.py:_mul_` packed `QQ[x]` fallback | coefficient-length product at least 64 selects FLINT | portable tuning candidate |
| `polynomial.py:_mul_` packed `GF(p)[x]` | wide modulus or coefficient-length product at least 4,096 selects FLINT | hard capability plus portable tuning |

Public methods also implement explicit choices such as `algorithm="fflas"`,
`algorithm="flint"`, `algorithm="m4ri"`, and `algorithm="modp"`. Those are
part of the public mathematical API and must remain distinguishable from the
automatic policy used by `algorithm=None`.

The repository already has one useful but different profile mechanism:
`scripts/native-math-profile.cjs` fingerprints the portable or `cpu-native`
dependency build, including the ABI, compilers, flags, CPU identity, library
versions, BLAS choice, and observed FLINT configuration. The native worktree
cache includes that fingerprint in dependency generations. Mathematical
dispatch must consume this build identity, not duplicate it or mistake it for
an operation crossover profile.

Current benchmark JSON is valuable evidence but is heterogeneous. In
particular, the word-prime matrix and Apple-silicon reports record host,
workload, timings, and correctness digests, but no common schema yet makes them
safe inputs to an automatic profile generator.

## Authoritative declarations

The proposed source layout is:

```text
dispatch/
  matrix.dispatch.py
  polynomial.dispatch.py
  profiles/
    portable.dispatch.py
    linux-x64.dispatch.py
    linux-arm64.dispatch.py
    macos-arm64.dispatch.py
    windows-x64.dispatch.py
  generated/
    matrix.dispatch.json
    polynomial.dispatch.json
    profiles.dispatch.json
```

The exact paths may change during implementation, but these invariants may
not:

- every authoritative declaration is ordinary Python 3.11 syntax that
  CPython can parse;
- the lowerer reads a constrained AST and never executes declaration source;
- constructors and predicates come from a small documented DSL;
- unknown fields, duplicate identifiers, unreachable rules, ambiguous
  precedence, and forbidden host overrides are errors;
- JSON object keys and set-like arrays have canonical order;
- numeric values have one canonical spelling and NaN or infinity is forbidden;
- source locations and explanatory prose are retained in the JSON;
- regeneration is deterministic and CI rejects stale generated JSON.

A declaration should read approximately as follows. This is illustrative DSL,
not an API already implemented:

```python
from sagejs.dispatch import (
    Algorithm,
    Capability,
    DispatchFamily,
    Operation,
    Representation,
    Rule,
    all_of,
    available,
    feature,
)


DENSE_PRIME_MATRIX = DispatchFamily(
    id="dense-prime-matrix",
    schema=1,
    features={
        "modulus": "uint64",
        "left_rows": "uint64",
        "inner": "uint64",
        "right_columns": "uint64",
        "storage": "enum",
    },
    capabilities=[
        Capability(
            id="fflas-modular-float",
            requires=all_of(
                available("fflas"),
                feature("modulus") < 256,
                feature("storage") == "packed-u64",
            ),
        ),
        Capability(
            id="flint-nmod-resource",
            requires=all_of(
                available("flint-nmod-resource"),
                feature("modulus") <= 0xFFFFFFFFFFFFFFFF,
            ),
        ),
    ],
    representations=[
        Representation(
            id="packed-u64",
            when=feature("modulus") < 256,
            policy="canonical",
        ),
        Representation(
            id="flint-nmod-resource",
            when=feature("modulus") >= 256,
            policy="canonical-when-capable",
        ),
    ],
    operations=[
        Operation(
            id="multiply",
            algorithms=[
                Algorithm("fflas-float", requires="fflas-modular-float"),
                Algorithm("flint-packed", requires="flint-packed-u64"),
                Algorithm("flint-nmod", requires="flint-nmod-resource"),
                Algorithm("typed-python", requires="packed-u64"),
            ],
            portable=[
                Rule(
                    choose="fflas-float",
                    when=feature("minimum-dimension") >= 32,
                    evidence="dense-prime-fflas-v1",
                ),
                Rule(choose="flint-packed", when=True),
            ],
        ),
    ],
)
```

Derived features such as `minimum-dimension` must themselves be declared, pure,
total integer expressions. Runtime code does not evaluate arbitrary Python or
JavaScript expressions from a profile.

## Policy layers

### Hard capabilities

Capabilities answer whether an implementation can produce the required
mathematical result safely. They may depend on:

- domain and modulus bounds;
- native word size and endianness;
- available generated resources or portable modules;
- compiled library versions, symbols, and build options;
- required canonical-output or proof guarantees;
- input and output representation, shape, and aliasing support;
- Windows, WebAssembly, and exception-boundary support.

A capability is established by a built-in fact or an inspectable runtime probe,
not a timing. A tuning profile may narrow a capability but may never widen one.
An algorithm that is fast but fails canonical RREF, exactness, proof, or
transactionality requirements is not a candidate.

### Canonical representation policy

Representation policy decides what a mathematical object owns between calls.
It is an architectural decision because it affects mutation, serialization,
borrowing, conversion, and lifecycle—not merely one benchmark. It therefore
belongs in the base family declaration and cannot be replaced by a host tuning
overlay.

Alternative algorithms may use explicit temporary conversions, but the
candidate must declare every conversion. Benchmarking and explanation include
their time and allocation cost. A rule cannot silently compare a zero-copy
resource operation with a kernel after excluding the required export and
re-import. Reusable cached alternate representations require a separately
reviewed ownership policy rather than a tuning flag.

The initial matrix declaration should preserve the current reviewed policy:
`GF(2)` uses M4RI when available, primes below 256 use packed residue storage,
and larger word primes use generated FLINT `nmod_mat` resources on capable
hosts. Givaro's wider exact range remains an explicit candidate capability,
not a reason to change canonical storage.

### Portable tuning

The portable profile is checked into the repository and is the deterministic
fallback on every host. It should be conservative: select a specialized
backend only after a robust win across the supported input grid and otherwise
prefer the simplest mature implementation.

Portable rules may use declared workload features such as dimensions, degree,
modulus class, coefficient bit-size class, density class, or representation.
They may not inspect CPU model strings, clock rate, current machine load, or
unstable process state.

### Host-family and build-profile tuning

Checked host profiles are sparse overlays on the portable policy. A profile is
bound to explicit predicates over:

- operating system and architecture;
- a stable CPU feature family, not an unparsed marketing string;
- BLAS provider and threading model;
- native mathematics build-profile fingerprint or an explicitly reviewed set
  of compatible fingerprints;
- relevant FLINT, FFLAS-FFPACK, M4RI, GMP, and BLAS versions;
- dispatch declaration and benchmark schema generations.

The first required evidence families are Linux x64, Apple M1 arm64, and Linux
arm64. A later M2/M3/M4 result must not silently masquerade as M1 evidence.
Windows x64 initially needs complete capability and fallback coverage even if
it has no tuned overlay.

More-specific matching does not rely on file order. The selector ranks exact
build fingerprint, CPU feature family, OS/architecture, then portable. Two
matching profiles at equal specificity are a validation error. If no checked
profile matches exactly, selection falls back to portable and says why.

### Explicit algorithm overrides

An explicit public `algorithm=` value has precedence over all performance
profiles. The system checks its hard capability and either runs that algorithm
or raises the documented error. It never silently substitutes a different
algorithm. `None` or `"auto"` uses the selected profile.

Proof flags, canonical-form requirements, and other semantic options are
features or capability constraints, not tuning hints. Algorithms that produce
different observable bases, factor ordering, proof status, randomness, or
exceptions cannot share one automatic candidate set unless Sage.js performs a
canonical normalization that makes them observably equivalent.

## Deterministic selection

For one operation, selection proceeds in this order:

1. validate the operation features and public semantic options;
2. enumerate declared algorithms in canonical identifier order;
3. remove algorithms that fail hard capabilities, recording every reason;
4. honor an explicit algorithm override, if any;
5. load an explicitly activated local profile if its complete identity matches;
6. otherwise select the unique most-specific checked host/build overlay;
7. otherwise use the checked portable profile;
8. walk that profile's ordered decision rules;
9. if a preferred implementation became unavailable, walk its declared
   correctness-preserving fallback chain;
10. fail clearly if no implementation remains.

The same features, capability set, build identity, and profile set must always
select the same result. The selector must not benchmark, sample system load,
or mutate policy during a mathematical call.

Every operation requires a final portable correctness fallback when one exists.
Fallback is explicit per candidate; exceptions are not caught and reinterpreted
as capability failures after an algorithm has begun mutating or computing.

## Benchmark evidence and profile generation

Benchmark reports accepted by the profile generator need one common schema:

- report schema and benchmark-suite version;
- Git source commit and dirty-state rejection;
- dispatch declaration generation;
- native mathematics build-profile fingerprint and observed capabilities;
- OS, architecture, stable CPU feature family, physical/logical CPU count,
  memory, BLAS provider, and threading environment;
- operation, domain, complete semantic options, representation, candidate, and
  every declared workload feature;
- process-isolated cold time, initialization time, and warm operation time as
  distinct measurements;
- warmups, samples, statistic, dispersion, outliers, and timeout;
- peak memory or allocation evidence when representation conversion matters;
- exact result digest and differential oracle;
- whether conversion, allocation, result construction, and cleanup are inside
  the timed scope.

Ingestion rejects incompatible schemas, stale builds, correctness mismatches,
missing candidates, excessively noisy samples, hidden conversions, and reports
whose first lazy load was counted as a warm operation. Raw reports remain
evidence; they never override declarations directly.

The generator uses a deliberately small rule model—initially piecewise integer
thresholds over declared features. It chooses thresholds on a training grid and
must pass a separate validation grid. A specialized algorithm must exceed a
minimum speedup and confidence margin on both sides of a proposed boundary;
near ties choose the portable fallback. Crossovers are tested at neighboring
values, not inferred from one square matrix.

Matrix grids include square, tall, wide, degenerate, structured, and random
inputs; several modulus classes; and conversion-inclusive measurements.
Polynomial grids vary both operand lengths, coefficient bit sizes, modulus
classes, sparsity, and skew. A profile proposal records the reports, fitting
parameters, rejected alternatives, and resulting rules. Review regenerates the
JSON and sees an ordinary source diff.

No benchmark tool edits authoritative source automatically. A command may emit
a proposed declaration patch, but a human or agent reviews and commits it.

## Local tuning

An optional command can use exactly the same benchmark and fitting pipeline:

```sh
sagejs tune math --family dense-prime-matrix --output profile.json
```

The result is constrained data, never executable code. It includes the full
host, native-build, declaration, tool, and benchmark identity plus confidence
and expiry metadata. Merely creating it does not change Sage.js. The user must
activate it explicitly, for example with a configuration entry or
`SAGEJS_MATH_DISPATCH_PROFILE=/absolute/path/profile.json`.

An activated local profile is accepted only on an exact identity match. A
mismatch produces a diagnostic and falls back to checked policy; it does not
partially apply old thresholds. `sagejs tune math --check profile.json`
validates identity and provenance without executing a benchmark.

This opt-in rule keeps installed behavior reproducible and prevents an
overloaded laptop, a transient VM, or a malicious downloaded profile from
silently changing normal dispatch.

## Explainability

Selection must be visible both before and during execution. The planned CLI is
approximately:

```sh
sagejs math explain matrix.multiply \
  --domain GFp --modulus 97 --shape 160,160,160

sagejs math explain matrix.rank \
  --domain GFp --modulus 65537 --shape 200,300 --json
```

The report includes:

- normalized input features and semantic options;
- canonical representation and why it was selected;
- every candidate and its capability pass or rejection reasons;
- explicit conversion and allocation boundaries;
- selected portable, checked-host, or local profile, source path, schema, and
  fingerprint;
- the matched rule and benchmark evidence identifiers;
- the chosen implementation and ordered fallback chain;
- native mathematics build fingerprint and relevant runtime capabilities;
- whether native code, a dynamic declared adapter, WebAssembly, or ordinary
  Python will execute.

`SAGEJS_MATH_TRACE=1` provides a concise runtime line containing operation,
features, implementation, representation, matched rule, and profile
fingerprint. Trace and explain use the same decision record, so diagnostics
cannot drift from execution. Public objects may later expose an equivalent
Python helper, but the CLI and JSON form are the initial contract.

## Identity, caches, and reproducibility

Four fingerprints must remain separate and named:

1. the existing native mathematics dependency-build fingerprint;
2. the native addon or compiled-kernel artifact fingerprint;
3. the dispatch declaration/profile-set fingerprint;
4. the selected runtime profile fingerprint.

Changing a runtime crossover should not rebuild FLINT or FFLAS. Generated
addons expose capabilities and remain keyed by their existing source, ABI, and
dependency identities. Ordinary runtime dispatch reads profile data indirectly.

If the native compiler specializes or deletes a dispatch decision, both the
declaration/profile-set fingerprint and selected profile fingerprint become
inputs to that compiled artifact key and manifest. Otherwise a compiled module
could silently preserve an old threshold. The preferred first implementation
keeps active profile choice at runtime, so changing an activated local profile
does not multiply the native artifact cache.

Mathematical result caches such as rank and RREF do not include a profile when
all candidates are observably equivalent. Any operation for which this is not
true must be split into semantic variants before automatic dispatch.

For reproducible performance investigations, `portable` can be selected
explicitly and every benchmark records its profile fingerprints. Serialized
mathematical objects never contain tuning profiles. Seeded random operations,
results, exceptions, and canonical formatting remain profile-independent.

## Validation gates

The implementation is complete only when these gates hold:

- CPython parses all declaration sources and strict Python reports zero errors;
- lowering twice, in different directories and source enumeration orders,
  produces byte-identical JSON;
- stale JSON, duplicate identifiers, ambiguous rules, unreachable fallbacks,
  and host attempts to widen capabilities or change canonical representation
  fail CI;
- every current matrix and polynomial threshold named in the audit either moves
  into a classified declaration or is documented as a non-tunable invariant;
- explicit `algorithm=` behavior and errors remain Sage-compatible;
- exhaustive synthetic selector tests cover capability removal, local-profile
  mismatch, equal-specificity conflicts, portable fallback, and absent native
  libraries;
- trace and explain select the same implementation as execution;
- cache tests prove runtime profile changes do not rebuild dependencies and
  prove specialized native artifacts cannot reuse a stale profile;
- benchmark ingestion rejects noisy, incorrect, stale, cold-as-warm, and
  conversion-excluding evidence;
- crossover tests cover the boundary and adjacent feature values;
- generated-capable, `SAGEJS_NATIVE_DISABLE=1`, portable, WebAssembly fallback,
  and Windows capability paths remain correct;
- checked reports are retained for Linux x64, M1 arm64, and Linux arm64 before
  a host-specific overlay changes production selection;
- a fresh agent can add one algorithm candidate and benchmark evidence without
  editing selector/compiler implementation code.

## Staged implementation

1. Implement the constrained Python declaration parser, schema, canonical JSON
   lowering, and deterministic validation without changing public dispatch.
2. Model the dense prime-matrix capabilities, representation policy, current
   portable thresholds, explicit overrides, trace, and explain. Differentially
   run old and new selectors and reject any disagreement.
3. Normalize the Linux x64, M1 arm64, and Linux arm64 benchmark reports, then
   add sparse checked host overlays only where evidence changes a decision.
4. Route dense prime matrices through the selector and remove the corresponding
   constants and `_use_fflas_*` predicates from `matrix.py`.
5. Add local `sagejs tune math` output and explicit activation after checked
   profiles and cache identities are stable.
6. Migrate polynomial multiplication thresholds, followed by other measured
   mathematical dispatch. Do not turn semantic validation constants or wire
   format bounds into tuning parameters.

The first vertical slice succeeds when a reader can answer “why did this
matrix operation use this backend on this machine?” from one explain record,
and when changing a measured crossover requires a declaration/evidence diff
rather than editing mathematical implementation code.
