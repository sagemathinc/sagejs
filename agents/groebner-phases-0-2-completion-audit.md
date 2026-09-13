# Gröbner phases 0–2 completion audit

- Date: 2026-08-31
- Branch: `groebner`
- Scope: the first portable Sage.js Gröbner backend over prime fields and
  `QQ`
- msolve source: 0.10.1-14-g1e3af01 at
  `1e3af01f3864f6c848814b02a450f384c108adea`
- License: GPL-2.0-or-later

## Decision

Phases 0, 1, and 2 of `agents/groebner-basis-strategy.md` are implemented.
The supported product contract is deliberately narrower than all of msolve:

| Domain | Order | Backend | Proof contract |
| --- | --- | --- | --- |
| Prime `GF(p)`, `p < 2^31` | global `degrevlex` | scalar msolve F4 | deterministic reduced candidate; `proof=False` until transformation provenance is exported |
| `QQ` | global `degrevlex` | explicit modular msolve | probabilistic reconstruction; `proof=False` |
| `QQ` | FLINT-supported global orders | existing bounded FLINT Buchberger | exact default |

Unsupported domains, orders, characteristics, resource shapes, and proof
requests fail explicitly. The rational msolve path does not replace the exact
default under a misleading proof claim.

## Phase 0: corpus and contract

The versioned sparse-polynomial ABI and capability descriptors live in
`sagejs.polynomial_algorithms.groebner_contract`. Its independent ordinary
Python implementation returns a reduced basis and change matrix. Verification
checks:

- both ideal containments;
- every S-pair;
- monicity and reducedness;
- canonical leading ideals; and
- exact normal forms.

`test/fixtures/groebner-basis-oracles-v1.json` is checked against that
implementation under isolated CPython. Its structural test requires the
declared SageMath/Singular, msolve, Groebner.jl, MathicGB, FLINT, and independent
contract oracle families. It also requires zero and unit ideals, duplicate and
zero generators, inhomogeneous, nonradical, positive-dimensional, unlucky-prime
rational, unsupported-order/characteristic, malformed-exponent, and separate
variable/term/exponent resource-envelope cases.

The externally repeated finite-field case used Singular 4.4.1 on macOS ARM64
and MathicGB F4New at `aa38a7fb7b53ab6dd74de983c60517668054755f`.
Exact commands and raw bases are retained in the fixture instead of relying on
an undocumented assertion that the outputs agreed.

## Phase 1: portable prime-field F4

The reviewed source slice exports only the packed `export_f4` path needed by
Sage.js. The host adapter:

- validates all dimensions before native entry;
- uses a versioned ownership-explicit result ABI;
- intercepts reachable upstream `exit` calls;
- returns bounded status codes rather than terminating Node;
- serializes upstream global state across Node Workers; and
- keeps separate Wasm instances isolated in separate linear memories.

The same scalar source compiles in the direct Node addon and production Wasm.
It returns full reduced bases. Sage-level normal form, leading ideal, and
membership operations consume ordinary Sage.js polynomial values, not msolve
handles.

## Phase 2: modular rational bases

The vendored slice also exports the minimal `export_groebner_qq` path against
the existing FLINT/GMP dependency prefix. The public API requires the explicit
`algorithm="msolve", proof=False` request. Tests cover:

- inhomogeneous rational systems and nontrivial denominators;
- an unlucky prime that changes the specialized leading ideal;
- five increasing numerator/denominator height thresholds through 181 bits;
- cyclic-5's complete 20-polynomial, 232-term basis;
- repeated calls and four concurrent Node Workers; and
- exact reduction of every input generator by the returned basis.

The adapter does not yet export enough transformation provenance to certify
the reverse containment independently at arbitrary scale. Exact certified
msolve mode therefore remains future work rather than an implied property of
the modular stopping test.

## Portability results

The final focused native suite has seven passing tests on each supported
native target:

| Target | Toolchain/runtime | Result |
| --- | --- | --- |
| Linux x64 | Node 26, system C/C++ toolchain | 7/7 |
| Linux ARM64 | Node 26, GCC toolchain | 7/7 |
| macOS ARM64 | Node 26, Apple/Homebrew toolchain | 7/7 |
| Windows x64 | Node 26, native `clang-cl`/MSBuild | 7/7 |

The source receipt reproduces on clean checkouts on every target. A native
addon identity regression also proves that changing any vendored msolve source
invalidates the installed-addon cache.

The Node Wasm suite exercises finite and rational packets, malformed packets,
resource rejection, and exact output conversion. A real Chromium run passes
both finite and rational computations. The reviewed msolve slice makes the
complete `flint-factor.wasm` artifact 6,744,875 bytes raw and 2,554,576 bytes
under `gzip -9`; the narrow raw guard is 6,800,000 bytes.

Because this changes the shared production Wasm source identity, the checked
higher-genus automatic-dispatch policy is disabled and the runtime treats that
state as fail-closed. Its three old Cantor envelopes are retained for future
receipt regeneration, but none can authorize native code; unmatched workloads
take the exact fallback.

## Sanitizers and lifetime evidence

The dedicated native suite passes ASAN and UBSAN on Linux x64. A 64-call
modular-rational run under LSAN has no per-call msolve leak. Running the entire
Worker test file under LSAN still reports one fixed long-lived Node wrapper
graph per short-lived Worker (670,144 bytes across four Workers); the amount
does not grow with the 64 additional parent calls. That generic addon/Worker
lifecycle issue is separate from msolve's per-computation ownership and is not
represented here as a clean whole-process LSAN result.

During sanitizer review, two real upstream-integration defects were fixed:

- modular lifting metadata and trace state are now released after rational
  export; and
- an OpenMP-shared degree temporary no longer races or remains uninitialized
  for an empty sparse matrix.

## Performance sample

Warm direct-addon measurements on the development Linux x64 host were:

| Workload | msolve warm | existing FLINT warm |
| --- | ---: | ---: |
| two-generator `GF(65537)` | 0.64 ms | not applicable |
| two-generator `QQ` | 5.12 ms | 0.01 ms |
| cyclic-5 `QQ` | 2.69 ms | 1.84 ms |

These are dispatch diagnostics, not a broad backend ranking. They correctly
leave tiny rational systems on FLINT while establishing a portable modern F4
foundation for larger future workloads. The reproducible command is
`node bench/groebner/benchmark.cjs`.

## Repository integration validation

The final integration checkout passed:

- the seven-stage production build;
- architecture validation, including 1,046 reviewed Wasm capabilities;
- strict Python validation for 276 modules with zero errors;
- the compiler suite with 16 passes, 19 declared historical skips, and zero
  failures;
- all 116 unit files and all 105 portable files;
- the production Wasm suite with 188 passes and two expected unavailable-browser
  skips; and
- the complete native functional, lifecycle, sanitizer, and resource suites.

The native suite's final dense-matrix timing gate initially observed one
unrelated `multiply_300` sample at 18 ms against a 15 ms normalized budget while
other work was active. Its isolated load-normalized rerun passed at 4.19 ms;
no mathematical or threshold change was made.

The long integration tier ran 212 consecutive files before encountering a
stale matrix-signature assertion inherited from the concurrent main merge. The
published matrix signature, generated documentation, and focused kernel test
were corrected and passed. Since that final correction changes tests and
generated documentation rather than runtime mathematics, the complete 346-file
tier was not repeated locally; pull-request CI remains the independent full
integration confirmation.

## Deliberate next phases

This work does not claim FGLM, lexicographic conversion, elimination blocks,
finite extension fields, modules, syzygies, resolutions, local standard bases,
or Singular's broader commutative-algebra surface. Those remain Phases 3 and 4
or an optional later Singular worker. The first follow-up for the present
backend is complete transformation provenance and scalable independent
certification for modular `QQ`.
