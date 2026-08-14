# Sage functionality roadmap

Status: planning baseline, 2026-08-14

Reference target: SageMath `10.10.beta7`, commit
`09472ff530d280d0c9f44fdc5a9c3e856ed95b37`.

## Objective

Implement the mathematical functionality documented by SageMath behind one
Sage.js object model, with reasonable performance and portable, inspectable
implementations.

This does not mean embedding the PARI, GAP, Singular, Maxima, Magma, or other
foreign languages and runtimes. It does not preserve their command strings,
public objects, process interfaces, or named backend choices. A documented
mathematical operation remains in scope even when Sage currently obtains it
from one of those systems.

Focused libraries are different from broad foreign computer algebra systems.
FLINT, Arb, M4RI, FFLAS/FFPACK, igraph, eclib, HiGHS, Normaliz, cddlib, nauty,
and similar libraries may be used through generated, narrow resource or packed
FFI. They remain implementation providers, never the Sage.js public object
model. Algorithms from open-source systems and papers may also be ported into
ordinary typed Python or a focused native kernel.

The target is functional compatibility, not historical implementation
compatibility.

## What “done” means

The first planning target has two simultaneous measures:

- **Weighted coverage:** the common, foundational, and research-enabling
  mathematical surface works well. This is the primary product measure.
- **Raw documented coverage:** every documented mathematical capability is
  classified and eventually implemented or explicitly excluded. This prevents
  an attractive common-case percentage from hiding the long tail.

Every in-scope capability progresses through these states:

1. `classified`: scope, semantics, dependencies, and current provider known;
2. `structural`: public objects and signatures exist;
3. `correct`: differential examples, adversarial cases, and invariants pass;
4. `competitive`: representative performance is normally within a stated
   factor of Sage or the focused provider;
5. `portable`: supported native platforms and the declared portable fallback
   are proved;
6. `complete`: documentation, serialization, provenance, and independent
   review are present.

An operation is not complete merely because its name exists or a few examples
work. Symbolic operations may honestly return an unevaluated expression where
the algorithm does not apply; they must never return a plausible wrong answer.

## Initial census

The English Sage reference manuals name about 2,371 source modules. The source
contains roughly 39,000 public-looking callables and more than 439,000 `sage:`
doctest prompts. These figures establish scale, but they are not work units.
Many methods are tiny variants of one capability, while one innocent-looking
method can depend on a complete number-field, group, or ideal engine.

The unit of planning is therefore a **capability cluster**: normally 5–30
related public functions or methods sharing a representation, provider,
dependency set, semantic contract, and performance family. A healthy leaf
cluster should fit in roughly 0.5–3 reviewed agent-days; larger work must be
split by an explicit interface contract.

The capability ledger will be generated from Sphinx inventories, documented
callables, doctests, source inspection, and instrumented Sage executions.
Static imports alone are insufficient because provider calls are often lazy or
concentrated behind a central class.

Each ledger record contains:

- stable ID, reference version, module, qualified names, and signatures;
- included/excluded decision and mathematical behavior;
- coercion, mutability, exception, printing, and serialization semantics;
- Sage source locations and actual providers reached;
- canonical Sage.js representation and implementation class;
- hard dependencies and optional accelerators as separate edges;
- correctness oracles, certificates, differential examples, and fuzz families;
- representative performance workloads and accepted envelope;
- Node, Windows, WebAssembly, and browser capability;
- effort range, uncertainty, parallel class, status, and owner;
- source, literature, license, build, and commit provenance.

Generated inventory data and agent judgments must remain distinct. Symbols,
signatures, doctests, imports, source hashes, and traces can be regenerated.
Semantic clustering, provider choice, exclusions, representative benchmarks,
and effort estimates require review.

## Architectural critical path

The existing compiler, generated FFI, opaque-resource model, exact matrix and
polynomial slices, and release infrastructure are the right foundation. The
next scalability contracts are:

1. a real `Parent`/`Element`/`Map`/`Homset`/`Action` and coercion/pushout spine;
2. generic coefficient, term-order, polynomial, ideal, module, and morphism
   protocols;
3. stable sparse exact, dense numerical, graph, polyhedron, and expression
   representations;
4. lazy domain modules so parallel lanes do not edit monolithic public files;
5. generated provider registration, lifecycle, serialization, and capability
   reporting shared by native and portable hosts.

The major dependency shape is:

```text
parents / coercion / maps / serialization
    + exact rings / polynomials / matrices / Arb
    |   + number fields and p-adics
    |   |   + arithmetic geometry and arithmetic dynamics
    |   + multivariate ideals and Groebner bases
    |       + schemes, curves, and commutative algebra
    |   + modules and sparse linear algebra
    |       + homology, matroids, and representation theory
    + permutation and finitely presented groups
    |   + group theory, characters, and many combinatorial domains
    + symbolic expression and assumption semantics
        + calculus, manifolds, and symbolic consumers
```

Extra agents cannot eliminate these dependencies. They can start every long
pole early and expand the breadth behind each stable contract.

## Domain portfolio

The effort ranges below are reviewed **agent-weeks**: continuous focused lane
time including implementation, tests, benchmarks, review fixes, and
integration. They have roughly factor-two uncertainty and overlap, so they
must not be naively summed.

| Portfolio | Current position and route | Main risk | Broad/full effort |
|---|---|---|---:|
| Exact rings, finite fields, dense exact matrices, univariate exact polynomials | Strong Sage.js resource and packed vertical slices; consolidate semantics and remaining domains | Breadth and shared coercion, not algorithm discovery | 25–55 |
| Parent/category/coercion/module spine | Current kernel is useful but deliberately small; port the semantic core and construction pushouts | Cross-cutting serial contract | 20–40 |
| Numerical rings and dense numerical linear algebra | Generated MPFR/MPC/Arb/Acb and OpenBLAS/LAPACK resources | Precision/rounding semantics and decomposition conventions | 25–50 |
| p-adics and local fields | FLINT `padic`/`qadic` plus Sage algorithms | Multiple precision models and coercion | 25–50 |
| Number fields, orders, ideals, units, class groups | FLINT arithmetic; port algorithms using Sage and BSD Hecke/Nemo as evidence | Largest arithmetic foundation; PARI currently supplies deep global algorithms | 60–150 |
| Function fields | Much of Sage is ordinary Python; replace Singular normalization seams | Normalization, integral bases, and dependency breadth | 35–80 |
| Multivariate polynomials and commutative algebra | FLINT mpoly for arithmetic; typed sparse fallback; focused msolve-style kernels | Singular-quality Gröbner, syzygy, resolution, normalization, and decomposition stack | 60–150+ |
| Groups and representations | Build packed permutations and BSGS first; then FP/polycyclic/matrix/character engines | GAP-quality breadth and algorithmic long tail | 90–200+ |
| Combinatorics | Predominantly ordinary Python with exceptionally rich doctests | Huge surface and parent semantics | 80–140 |
| Graphs and matroids | Existing labelled graph API and igraph boundary; add canonical packed graph store and focused kernels | Canonical labelling, optimization, and advanced matroid algebra | 40–70 |
| Polyhedra and discrete geometry | Backend-neutral H/V model plus narrow cddlib/Normaliz/HiGHS-class resources | Exact degeneracy, conversion, lattice enumeration, and triangulation | 40–80 |
| Topology, homology, and knots | Cell records plus exact sparse boundary matrices; focused topology kernels for hard cases | Large sparse integral homology and certified knot/3-manifold tail | 35–80 |
| Elliptic curves and arithmetic geometry | Much generic Sage algorithm source; eclib is a focused `QQ` provider | Depends on number fields; descent/rank over number fields is a hard project | 45–90 plus shared foundations |
| Modular symbols/forms/abelian varieties | Mostly Sage-owned algorithms; Sage.js already has a substantive modular-symbol slice | Sparse exact linear algebra, p-adic and number-field dependencies | 45–85 |
| L-functions and Diophantine methods | Arb/Acb coefficient-provider architecture; port approximate functional equations and equation families | Certified errors, high zeros, S-units/Selmer and inherently conditional algorithms | 45–90 after prerequisites |
| Symbolic expressions and calculus | Current Sage-owned MathJSON tree is a useful narrow slice; make it authoritative and port rule families | Canonical expression/assumption semantics; integration, limits, solve, and ODE long tail | 100–220+ |
| Manifolds and tensors | Mostly Python once expression and sparse tensor contracts exist | Symbolic identity, restrictions, and cache coherence | 50–100 after symbolic foundation |
| Plotting | Broad Plotly-backed 2D/3D scene model already exists | Compatibility options, adaptive geometry, and export | 10–25 |
| Numerical calculus, optimization, probability, and statistics | Typed algorithms plus focused BLAS/LAPACK, HiGHS, FFT, and ODE providers | Numerical edge semantics and solver variability | 45–90 |
| Coding, crypto, games, and educational domains | Mostly Python, combinatorics, finite fields, and linear algebra | A few Boolean/ZDD and database-dependent kernels | 20–45 |

The three largest independent algorithm portfolios are computational group
theory, computational commutative algebra, and symbolic mathematics. General
algebraic number theory is the deepest shared arithmetic prerequisite.

## Program structure

Run two development systems concurrently.

### Breadth factory

Port bounded clusters whose representations and prerequisites are stable.
Each lane owns ordinary Python, declarations, tests, benchmarks, and its ledger
records. These lanes produce frequent user-visible releases in combinatorics,
graphs, linear algebra, modular forms, topology, numerical methods, plotting,
coding, and elementary arithmetic.

### Long-pole laboratories

Start four dedicated programs immediately:

1. number fields, ideals, local fields, and global arithmetic;
2. Gröbner bases, modules, ideals, and algebraic geometry;
3. permutation, finitely presented, polycyclic, matrix, and character groups;
4. symbolic expressions, assumptions, simplification, and calculus.

Each risky algorithm uses a three-role cell where possible: implementer,
adversarial mathematical reviewer, and differential/performance validator.
Useful intermediate layers ship rather than waiting for the entire laboratory
to finish.

Shared compiler, coercion, representation, declaration, build, and public
registry files have one integration owner at a time. Domain agents work behind
frozen interfaces in lazy packages. Generated files are mechanically
regenerated and collapsed in reviews; humans and agents review the authority
source and regeneration proof.

## Parallelism and forecast

The likely useful concurrency is lower than the number of available model
threads:

- with 8 agents: about 4–6 sustained implementation/review lanes;
- with 24 agents: about 10–14 effective lanes;
- with 32 agents: about 13–18 until integration is more automated;
- after the ledger, frozen contracts, fast platform CI, and durable orchestration:
  20–35 leaf lanes are plausible.

Approximately 60–75% of the total portfolio is parallel after its contracts
stabilize. Another 15–25% is parallel only behind shared prerequisites. The
remaining 10–15% forms the serial critical path. Review and integration, not
code generation or VM supply, become the ceiling first.

Provisional outcomes, to be recalibrated from completed capability units:

| Outcome | Sustained organization | Calendar estimate |
|---|---|---:|
| Strong common research system across most domains | 8–16 effective lanes | 6–12 months |
| About 80% of meaningful documented mathematics, with every item classified | 15–25 effective lanes | 12–24 months |
| About 90% weighted coverage, including serious versions of all four long poles | 20–35 effective lanes | 18–36 months |
| Near raw documented-method parity | continuing program | 3–5 years, with a difficult research tail |

These are planning ranges, not promises. The first six-week census and pilot
must record actual wall time, model usage, review cycles, regression work,
platform failures, and accepted capability units. Forecasts should then be
derived from that history. Commits, lines of code, and generated hashes are not
delivery units.

## Execution waves

### Wave 0: first trustworthy release

Consolidate the current branch forest into one reviewed baseline. Complete the
portable CPU/dependency receipts, Windows ClangCL path mapping, macOS deployment
floor and ZeroMQ source provenance, isolated startup measurement, bounded
caches, and clean-room release validation. Rebuild from clean inputs on Linux
x64, Linux arm64, Windows x64, and macOS arm64; inspect every embedded binary;
then perform the human credential-gated Windows signing, Apple signing and
notarization, version/tag, npm/GitHub publication, installer, and website
checks. Do not let optional compiler-size work destabilize the release gate.

### Wave 1: six-week census and calibration

Build the ledger generator and coverage dashboard. Classify all reference
modules and select 30–50 pilot clusters spanning easy, medium, hard, and
provider-replacement work. Freeze the parent/coercion, sparse matrix, graph,
expression, and multivariate polynomial contracts. Use actual accepted work to
replace the initial effort model.

### Wave 2: foundations plus high-width breadth

Run the four long-pole laboratories while independent lanes expand finite
fields, modules, sparse matrices, numerical rings, graph algorithms,
combinatorics, topology, basic schemes, coding, statistics, and plotting.

### Wave 3: dependent research mathematics

Build p-adics, number-field ideals, arithmetic geometry, modular forms,
polyhedra, matroids, root systems, homology, function fields, curves,
manifolds, and serious numerical/symbolic algorithms on the stabilized spine.

### Wave 4: hard tail and new mathematics

Close specialized documented gaps, then apply the same provider dossiers,
benchmark search, proof obligations, and generated implementations to useful
algorithms known only from Magma, Mathematica, Maple, MATLAB, papers, and
unmaintained research code.

## Immediate next deliverable

After the first release, implement **Capability Ledger v1**:

1. freeze the Sage reference commit and mechanically enumerate documented
   modules, public symbols, signatures, and doctests;
2. define the reviewed record schema and exclusion policy;
3. trace representative Sage calls to reveal actual providers;
4. import current Sage.js DocSpec and audit status;
5. generate dependency, coverage, uncertainty, and parallel-lane views;
6. select and execute the calibrated 30–50-cluster pilot.

That deliverable turns the question “how much of Sage remains?” into a query,
turns money and agent capacity into bounded work, and supplies the evidence
needed to decide where genuinely new algorithms are worth developing.
