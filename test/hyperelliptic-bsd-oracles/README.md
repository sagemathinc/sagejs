# Hyperelliptic BSD oracle corpus

This directory is an implementation-independent acceptance corpus for
`agents/hyperelliptic-bsd-arithmetic-plan.md`.  It deliberately contains no
Sage.js implementation code and is not a substitute for focused public API
tests.  Its jobs are to pin external normalizations, distinguish genuine
external coverage from internal identities, and make missing oracles visible.

Run the offline integrity and normalization checks with:

```sh
node test/hyperelliptic-bsd-oracles/verify.mjs
```

## Reproducing the PARI transcript

The checked transcript was generated from the official PARI
`2.18.1.alpha` source archive:

```sh
curl -fLO https://pari.math.u-bordeaux.fr/pub/pari/unstable/pari-2.18.1.alpha.tar.gz
echo 'f046c222db92e3f02120e2f4e74a5b0e1e6faaa248ff90f10c51b2daa0b3599c  pari-2.18.1.alpha.tar.gz' | sha256sum -c -
tar -xzf pari-2.18.1.alpha.tar.gz
cd pari-2.18.1.alpha
./Configure --graphic=none
make -j4 gp
./gp -q /path/to/pari-2.18.1-alpha.gp 2>/dev/null
```

Compare stdout byte-for-byte with `expected-pari-2.18.1-alpha.txt`.  PARI may
write a warning about the unknown conductor valuation at `2` to stderr for the
conductor-196 model; the script pins the known conductor before evaluating its
L-function, and stderr is intentionally not part of the transcript.

The GP helpers `genus2tors` and `genus2tamagawa` are copied from PARI's own
`src/test/in/hyperellperiods` at the release archive above.  Their names must
not be read as stronger certificates than they provide:

- `genus2tors` is a gcd of good-reduction group orders through 200.  It is an
  upper bound until explicit rational generators attain it.
- `genus2tamagawa` multiplies the component data exposed by `genus2red`.  It is
  a valuable PARI normalization oracle, but a Sage.js rational component-group
  certificate must independently include Frobenius-fixed classes.

The five rank-zero rows reproduce PARI's upstream BSD-period test with
quotients `1`, `4`, `1/4`, `9`, and `49`.  They include odd- and even-degree
models and generalized equations `y^2 + h(x)y = f(x)`.  The conductor-587 row
has root number `-1` and pins both the vanishing central value and first two
ordinary derivatives.  Two genus-3 rows independently pin the BSD real-period
normalization even though PARI does not construct their global L-functions.

The split genus-3 row pins only the analytic factorization

```text
L(J_0(33),s) = L(11a,s)^2 L(33a,s).
```

It therefore catches conductor, sign, and ordinary-value normalization.  It
does **not** by itself determine the integral period-lattice, component-group,
torsion, or isogeny-index corrections in a BSD quotient.

## What is externally covered

The `phase_coverage` table in `corpus.json` is normative.  Its short version is:

| Plan phase | Independent coverage in this corpus | What remains |
| --- | --- | --- |
| 0, conventions | PARI model convention and versioned provenance; exact contract vectors | Neron-model transformation fixtures and Magma normalization |
| 1, supplied quotient | PARI rank-zero quotient identities and a rank-one derivative; exact `r!`, dual torsion, and index-scaling vectors | Positive-rank external regulators and complete quotient fixtures |
| 2, periods | PARI genus-2 and genus-3 real periods | Period matrices, near-colliding roots, and Neron-lattice indices |
| 3, Tamagawa | PARI `genus2red` and its upstream test-helper product | Rational Frobenius-fixed component groups, especially nonsplit cases |
| 4, torsion | Good-reduction gcd upper bounds | Explicit rational generators and exactness certificates |
| 5, genus-2 heights | None | Magma or published point/height/regulator transcripts |
| 6, saturation | Exact subgroup-index scaling only | External division and saturation certificates |
| 7, deficiency | None | Poonen--Stoll examples plus Magma local-index decisions |
| 8, genus-3 heights | PARI real periods only | Independent genus-3 heights, finite intersections, and regulators |

Thus Phases 5, 7, and the height part of Phase 8 currently have no numerical
external oracle in this repository.  Bilinearity, basis change, quadratic
scaling, and precision refinement are necessary tests there, but remain
self-consistency tests until a versioned Magma or research-corpus transcript is
checked in.

## Required next external captures

Any future Magma, Sage, or research-script capture must add, rather than edit,
a source record.  Each record must include:

- exact curve model and exact Mumford divisors;
- software name, full version, operating system, and complete input script;
- raw stdout/stderr transcript and its SHA-256 digest;
- explicit conventions for differentials, canonical height, polarization,
  local component groups, and regulator;
- whether the output is proved, conditional, bounded, or numerical;
- enough digits at two precisions to test enclosure/refinement rather than
  equality of rounded display strings.

The highest-priority captures are:

1. genus-2 canonical heights and a rank-2 pairing matrix, including an
   integral basis change of determinant greater than one;
2. a supplied full-rank subgroup whose Magma saturation changes the index;
3. split and nonsplit semistable component groups where geometric and rational
   orders differ;
4. one deficient and one nondeficient Poonen--Stoll example;
5. a supported genus-3 Faltings--Hriljac pairing with two divisor
   representatives for the same class.

## WebAssembly acceptance gates

The BSD layer is not exempt from the repository's receipt-backed browser
policy merely because much of it is ordinary Python.  Integration should add
release-tier cases to `test/browser-wasm-parity-corpus.json` and, when a case
is performance-sensitive, `bench/browser-wasm-performance-cases.json`.  The
current policy requires trusted receipts from Chromium, Firefox, and WebKit.

The exact gates are:

1. **Pure quotient parity.**  A supplied rank-2 quotient case must produce the
   same versioned dictionary in Node and all three browsers, including the
   division by `2!`, decimal-string integers, independent `A`/`Adual` torsion,
   `rigorous=false`, and `sha_over_index_squared` naming.
2. **No host leakage.**  Quotient assembly and deterministic serialization
   must not import Node `fs`, `path`, `child_process`, native addons, SQLite,
   worker threads, or environment variables.  Persistence is a host adapter;
   in-memory `to_dict`/`dumps` is the portable contract.
3. **Period capability honesty.**  If Arb/Acb period resources have no Wasm
   route, `real_period()` must use the reviewed same-source fallback or return
   a structured capability status.  It must not silently substitute binary64
   quadrature or claim a Neron-normalized period from a model period.
4. **Local arithmetic parity.**  Good-reduction torsion-bound inputs and
   supported Tamagawa certificate matrices must agree exactly across hosts.
   Existing receipt-backed smalljac coverage may supply local factors, but
   genus-3 smalljac remains unavailable in Wasm and must retain its exact
   fallback/capability boundary.
5. **Numerical refinement parity.**  Periods, heights, regulators, and leading
   terms are compared by overlapping enclosures or a documented decimal
   tolerance at 128 and 256 bits, never by identical formatting.  The browser
   result cannot acquire `rigorous=true` when the desktop analytic contour
   bound is itself nonrigorous.
6. **Ownership and memory.**  Any new foreign numeric resource must use the
   declared Wasm ownership bridge, checked linear-memory copies, deterministic
   close, bounded maximum pages, and leak-count assertions after success,
   error, cancellation, and precision refinement.
7. **Cancellation and limits.**  Close branch points, large local graphs, and
   height searches need deterministic time/memory limits.  Browser interrupt
   receipts must reject the pending computation and leave the session usable.
8. **Serialization portability.**  Exact integers and rationals remain decimal
   strings; no JavaScript `Number` round trip is permitted.  JSON round trips
   must preserve all provenance and capability states.  SQLite examples are
   desktop-only unless a separately declared browser storage adapter exists.
9. **Route telemetry.**  Receipts must report the trusted route actually used
   (`wasm-library`, `wasm-compiled-source`, or reviewed dynamic fallback) and
   match the source revision.  A desktop N-API result is not a browser receipt.
10. **Offline execution.**  After production assets are loaded, the acceptance
    workflow must make no PARI, Sage, Magma, LMFDB, or other network request;
    all oracle data is development-only and checked in.

These gates deliberately preserve the new WebAssembly architecture: host
adapters may differ, but mathematical normalization, provenance, and failure
semantics may not.
