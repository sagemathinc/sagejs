# Plan for computational algebraic-number-field foundations

## Decision

Build Sage.js's computational algebraic number theory as five dependency-ordered,
independently shippable projects:

1. complex Riemann zeta and quadratic Dedekind zeta functions;
2. certified prime-ideal decomposition in maximal orders;
3. exact Dedekind-zeta coefficients and right-half-plane Euler products;
4. arbitrary-complex analytic continuation of general Dedekind zeta functions;
5. units, regulators, class groups, and the analytic class number formula.

The program will build on Sage.js's certified maximal orders, exact HNF ideal
lattices, arbitrary-precision real and complex fields, Dirichlet characters and
Dirichlet `L`-functions, FLINT/Arb, native compilation, batched plotting, and
cross-platform native packages. It will not add PARI, GP, Magma, Hecke, Oscar,
or a standalone `L`-function executable as a runtime dependency. Those systems
are differential oracles and benchmark references.

The five projects form one mathematical dependency graph, but each must have a
useful public endpoint, its own oracle corpus, and an honest stopping point. In
particular, the quadratic zeta project must not wait for general class groups,
and the exact Euler-product project must not claim analytic continuation.

## Objective

The finished program should support workflows such as:

```python
# Riemann zeta at an arbitrary complex point.
zeta(1/2 + 14*I)

# A quadratic Dedekind zeta function, using zeta(s)*L(s, chi_D).
K.<a> = NumberField(x^2 - 5)
Z = K.zeta_function()
Z(1 + I)
Z.derivative(0, 2)
Z.residue(1)

# Certified decomposition of rational primes in a maximal order.
O = K.maximal_order()
O.factor_rational_prime(11)
K.primes_above(11)

# Exact ideal-counting coefficients and a controlled Euler product.
K.zeta_coefficients(1000)
Z.euler_product(2 + I, prime_bound=10**5)

# A general field and its analytically continued zeta function.
K.<a> = NumberField(x^5 - x + 1)
Z = K.zeta_function(prec=100)
Z(1/2 + 3*I)
Z.completed_value(1/2 + 3*I)

# Certified algebraic invariants and the analytic class-number identity.
U = K.unit_group()
C = K.class_group()
K.regulator()
K.analytic_class_number_formula(prec=150)
```

The program must:

- preserve exact Sage/Python semantics for algebraic objects;
- work in-process on Linux x64/arm64, macOS arm64, and native Windows x64;
- use ordinary CPython-parseable Python for readable mathematical algorithms;
- use mature FLINT/Arb operations through declared or narrowly classified
  native boundaries instead of reimplementing them;
- retain correct dynamic fallbacks for exact algorithms;
- use packed, batched native crossings for large coefficient and evaluation
  workloads;
- expose certificates for exact maximal-order, ideal, unit, and class-group
  claims;
- distinguish exact, rigorously enclosed, and non-rigorous numerical results;
- reject infeasible work before unbounded enumeration or allocation;
- provide offline Sage/PARI, Magma, and Hecke/Oscar oracle data without making
  any of those systems a user dependency.

## Existing foundation

At the start of this plan Sage.js already has:

- exact simple number fields over `QQ`;
- certified global maximal orders and integral bases;
- exact field and order discriminants;
- exact rational-HNF ideal lattices with membership, sum, intersection,
  multiplication, positive powers, and norm;
- specialized imaginary-quadratic maximal orders and class groups;
- general Galois groups through degree four;
- arbitrary-precision FLINT/Arb real and complex arithmetic;
- Dirichlet groups, primitive characters, root numbers, arbitrary-complex
  Dirichlet `L`-values, and derivatives;
- an elliptic `L`-series batch/plot interface whose coercion, caching, tiling,
  diagnostics, and documentation patterns can be reused;
- FLINT's `acb_dirichlet_zeta` and `acb_dirichlet_zeta_jet` available in the
  native dependency, though not yet exposed by the public complex `zeta()` API.

Important missing pieces are:

- arbitrary-complex Riemann zeta in the public API;
- direct construction of the Kronecker character attached to a fundamental
  discriminant;
- exact field signature and a public embedding contract;
- prime ideals and decomposition of `p*O_K` at index-dividing primes;
- ideal inversion, valuations, and factorization;
- exact Dedekind-zeta coefficients;
- a degree-`n` completed-zeta/approximate-functional-equation engine;
- general unit groups, regulators, class groups, and roots of unity.

## Dependency graph and stopping points

```text
FLINT complex zeta + Kronecker characters
                 |
                 v
       quadratic Dedekind zeta

certified maximal order + HNF ideals
                 |
                 v
      prime-ideal decomposition
                 |
          +------+------+
          |             |
          v             v
 exact zeta       fractional ideals,
 coefficients     valuations, reduction
          |             |
          v             v
 right-half-plane  units and class groups
 Euler products          |
          |              v
          +------> general analytic zeta
                         |
                         v
              analytic class-number formula
```

The exact dependency is slightly richer than the diagram: general analytic
zeta needs coefficients, signature, and discriminant, but it does not need a
computed class group or fundamental units. Conversely, certified general
class groups do not logically need analytic continuation; analytic estimates
may accelerate them only after a deterministic certificate exists.

Each stopping point is public and honest:

- Project 1 supplies complete quadratic zeta functions.
- Project 2 supplies certified local algebra and ideal factorization.
- Project 3 supplies exact coefficients and controlled values only in the
  absolute-convergence half-plane.
- Project 4 supplies general meromorphic continuation numerically.
- Project 5 supplies certified global arithmetic and checks the residue
  formula.

## Shared public object model

### Dedekind zeta object

Use one implementation-neutral public object for quadratic and general fields:

```python
class DedekindZetaFunction:
    def number_field(self): ...
    def __call__(self, s): ...
    def value(self, s, prec=None, algorithm="auto"): ...
    def values(self, points, prec=None, algorithm="auto"): ...
    def derivative(self, s, D=1, prec=None, algorithm="auto"): ...
    def completed_value(self, s, prec=None, algorithm="auto"): ...
    def xi(self, s, prec=None, algorithm="auto"): ...
    def residue(self, s=1, prec=None, algorithm="auto"): ...
    def euler_factor(self, p): ...
    def euler_product(self, s, prime_bound, prec=None): ...
    def coefficients(self, bound): ...
```

and:

```python
def NumberFieldParent.zeta_function(
    self,
    prec=53,
    max_imaginary_part=0,
    algorithm="auto",
): ...
```

`max_imaginary_part` is planning information, not a mathematical restriction.
Do not accept Sage's historical `algorithm="pari"` and silently use another
backend. If accepted for Sage compatibility, it must clearly raise a capability
error. Prefer explicit names such as `"quadratic-product"`, `"euler-product"`,
`"afe"`, and `"reference"`.

The object should reuse the existing elliptic `L`-series conventions for:

- explicit bit precision;
- exact decimal-string transport at arbitrary precision;
- bounded result caches;
- scalar calls delegating to a batch implementation;
- `values()` preserving input order and duplicates;
- packed tiled evaluation for plots;
- structured internal diagnostics;
- clear resource-limit errors before expensive coefficient generation.

### Prime ideals

Introduce a general prime-ideal type without fragmenting ordinary ideal
arithmetic:

```python
class NumberFieldPrimeIdeal(NumberFieldIdeal):
    def rational_prime(self): ...
    def ramification_index(self): ...
    def residue_class_degree(self): ...
    def residue_field(self, names=None): ...
    def uniformizer(self): ...
    def valuation(self, value_or_ideal): ...
```

The canonical identity remains the exact HNF lattice in the maximal order.
The rational prime and local invariants are authenticated metadata, not an
alternative equality representation. Serialization must include the field and
maximal-order identities plus an exact lattice; it must reject a prime ideal
loaded into a different isomorphic-looking field object unless an explicit
transport map is supplied.

Public decomposition APIs:

```python
O.factor_rational_prime(p)
K.primes_above(p)
K.factor_rational_prime(p)
I.factor()
I.valuation(P)
I.inverse()
```

Use Sage-style `Factorization` output where that type is available. Keep a
structured certificate/diagnostic method for tests and expert inspection.

## Mathematical normalization

Let `K` have degree `n=r1+2*r2`, discriminant `D_K`, and Dedekind zeta

```text
zeta_K(s) = sum over nonzero integral ideals I of Norm(I)^(-s)
          = sum_{m>=1} a_m m^(-s)
          = product over prime ideals P of (1-Norm(P)^(-s))^(-1).
```

Freeze the archimedean factors as

```text
Gamma_R(s) = pi^(-s/2) Gamma(s/2)
Gamma_C(s) = 2 (2*pi)^(-s) Gamma(s)

Lambda_K(s) = |D_K|^(s/2)
              Gamma_R(s)^r1 Gamma_C(s)^r2 zeta_K(s).
```

With this convention,

```text
Lambda_K(s) = Lambda_K(1-s).
```

`Lambda_K` is meromorphic with simple poles at zero and one. Define the entire
completed function

```text
xi_K(s) = s*(s-1)*Lambda_K(s).
```

Do not inherit an undocumented factor of two from PARI, Sage, or another
library wrapper. Store both raw and completed normalization metadata in every
oracle corpus, and test the functional equation in this exact convention.

At `s=1`, the public zeta object must represent a pole deliberately. Freeze
Sage-compatible behavior during P0 rather than allowing an accidental NaN from
native division. `residue(1)` and the deflated Taylor series must remain usable
at the pole. Near the pole, do not snap a nearby input to one.

## Project 1 — complex Riemann zeta and quadratic Dedekind zeta

### 1A. Complex Riemann zeta

Extend the public `zeta()` function from its current integer-only binary64
implementation to arbitrary real and complex field inputs. Use FLINT/Arb:

- `acb_dirichlet_zeta` for values;
- `acb_dirichlet_zeta_jet` for Taylor coefficients and derivatives;
- the deflated jet for stable computation at and near `s=1`;
- `acb_dirichlet_xi` where its normalization matches the public Riemann xi
  contract.

Preserve the parent precision of `RealField` and `ComplexField` inputs. Exact
input without an explicit numerical parent should follow the existing Sage.js
numeric/symbolic policy; do not silently demote a 200-bit input to binary64.
The mature FLINT call should enter through a generated FFI declaration when the
existing Acb resource boundary supports it. Otherwise add the narrowest host
adapter matching the existing Dirichlet-`L` boundary and classify it explicitly
in the architecture inventories.

Required behavior includes:

- arbitrary complex values and conjugation;
- exact handling of the pole at one;
- trivial zeros and no proximity snapping;
- derivatives and deflated Taylor coefficients;
- arbitrary precision through at least 512 bits;
- direct values at moderate and large imaginary parts using FLINT's automatic
  algorithm selection;
- a batch interface if benchmarks show boundary/coercion overhead matters for
  plotting.

### 1B. Kronecker characters

Add a direct constructor for the primitive real Dirichlet character associated
to a fundamental discriminant:

```python
kronecker_character(D)
DirichletGroup.kronecker_character(D)  # only if this ownership is natural
```

It must compute `chi_D(n)=(D/n)` exactly, have modulus and conductor `|D|`, and
record parity from the sign of `D`. Do not construct it by enumerating every
character of a large Dirichlet group. Validate that `D` is a fundamental
discriminant, with an explicit option for reducing an arbitrary quadratic
radicand to its field discriminant.

### 1C. Quadratic Dedekind zeta

For a quadratic field with fundamental discriminant `D`, implement the exact
factorization

```text
zeta_K(s) = zeta(s) * L(s, chi_D).
```

This supplies analytic continuation, derivatives, completed values, residues,
and arbitrary complex evaluation without a general approximate functional
equation. Derivatives use Leibniz convolution of the two native jets; do not
finite-difference public midpoint values.

Support both imaginary and real quadratic fields through the general
`NumberField` constructor. Extending the specialized `QuadraticField` object to
positive radicands is a separate representation decision and must not block
the zeta function for an ordinary degree-two `NumberField`.

The quadratic evaluator should support `values()` and the existing plot and
`complex_plot` fast paths from its first release. It should usually be faster
and more accurate than routing quadratic fields through the future general
engine, and should remain the default after Project 4 lands.

### Project 1 exit criteria

- `zeta(CC(1/2 + 14*I))` and derivatives agree with FLINT and Sage/PARI oracle
  values at 53, 100, 200, and 512 bits.
- Quadratic zeta values for both signs of `D` agree with independent products
  and Sage/PARI or Magma.
- Raw and completed functional equations pass in the frozen normalization.
- The pole, residue, trivial zeros, conjugation, and near-pole behavior have
  focused regressions.
- Batched plotting works without scalar native crossings.
- Linux x64/arm64, macOS arm64, and native Windows x64 pass.

## Project 2 — certified prime-ideal decomposition

### Mathematical contract

For every rational prime `p`, compute

```text
p*O_K = product_i P_i^e_i,
Norm(P_i) = p^f_i,
sum_i e_i*f_i = [K:QQ].
```

This must work when `p` divides the index of the equation order, when the
defining polynomial has repeated factors modulo `p`, and when the original
field presentation is nonmonogenic at `p`. Factoring the defining polynomial
modulo `p` is not a valid general algorithm by itself.

### Producer algorithms

Use a routed implementation:

1. **Dedekind--Kummer fast path.** When `p` is certified not to divide
   `[O_K:ZZ[theta]]`, factor the defining polynomial modulo `p`. Construct
   `P_i=(p,g_i(theta))`, take multiplicities as `e_i`, and factor degrees as
   `f_i`.
2. **Existing local-data path.** Reuse authenticated OM/MaxMin, Newton-polygon,
   modified Round Four, and local-basis evidence already produced by the
   maximal-order engine. Project complete terminal types to prime ideals and
   their `e,f` invariants without serializing private mutable algorithm state.
3. **Generic exact fallback.** Work in the finite `F_p`-algebra `O_K/pO_K`.
   Compute its nilradical/Jacobson radical, decompose the reduced quotient into
   finite fields, lift the maximal ideals to exact HNF lattices, and recover
   ramification through ideal powers or local algebra. This is slower but must
   remain presentation-independent and correct whenever resource limits allow.

The fast producers and fallback must feed one independent certificate checker.
Do not let OM branch metadata certify itself.

### Certificate

A decomposition certificate must permit deterministic verification of:

- `p` is prime;
- every returned lattice contains `p*O_K` and is closed under `O_K`;
- `O_K/P_i` is a field with exactly `p^f_i` elements;
- the prime ideals are distinct and pairwise comaximal;
- `p*O_K` equals `product(P_i^e_i)` as exact HNF lattices;
- `sum(e_i*f_i)=degree(K)`;
- all reported residue maps and uniformizers satisfy their contracts.

The certificate should store compact producer witnesses, not every temporary
matrix. Verification must be possible without rerunning the producer's search.

### Supporting ideal arithmetic

Complete the exact fractional-ideal layer needed downstream:

- inverse and negative powers;
- quotient and colon ideals;
- integrality denominator and numerator ideals;
- containment and divisibility;
- prime-ideal valuations of elements and ideals;
- factorization of nonzero integral ideals by factoring the rational norm and
  decomposing only its rational-prime divisors;
- canonical, versioned serialization;
- bounded ideal reduction hooks for Project 5.

Ideal factorization must reconstruct the original ideal exactly from its
factors. A norm match alone is not a certificate.

### Caching and batching

Cache decomposition by maximal-order identity and exact rational prime. Add a
batched or streaming API for a prime interval so zeta coefficients do not pay
one host crossing per prime. Exact HNF lattices may be materialized lazily:
Project 3 often needs only the residue degrees, while a user asking
`primes_above(p)` needs full ideal objects.

### Project 2 exit criteria

- A corpus covers unramified split types, total and partial ramification,
  wild primes, index-dividing primes, nonmonogenic local presentations, large
  primes, and isomorphic presentations.
- Every decomposition passes the independent lattice/quotient/product
  verifier.
- Exact ideal inversion, valuations, and factorization reconstruct their
  inputs.
- Decompositions agree with Sage/PARI, Magma, and Hecke/Oscar on the corpus.
- The fast path and generic fallback agree wherever both are applicable.
- Prime-range streaming has bounded memory and works on all four native
  platforms with a correct dynamic fallback.

## Project 3 — exact zeta coefficients and right-half-plane Euler products

### Exact local and global coefficients

For

```text
p*O_K = product_i P_i^e_i,
```

the local zeta factor depends on the residue degrees, not directly on the
ramification indices:

```text
Z_p(T) = product_i (1-T^f_i)^(-1).
```

Generate its exact power-series coefficients through the exponent needed by a
global bound. Use a multiplicative sieve to compute

```text
a_m = number of nonzero integral ideals of norm m
```

for all `m <= B`. The public result must match Sage's indexing convention and
be ordinary exact integers:

```python
K.zeta_coefficients(B)
Z.coefficients(B)
```

The coefficient engine should consume compact prime splitting records in
chunks. It must not construct every corresponding prime-ideal object or factor
every integer separately.

Required exact identities include:

- `a_1=1`;
- multiplicativity at coprime arguments;
- prime-power recurrences from `Z_p(T)`;
- agreement with explicit small-norm ideal enumeration;
- invariance under an explicit field isomorphism;
- for quadratic fields, agreement with coefficients of
  `zeta(s)L(s,chi_D)`.

### Euler products in `Re(s)>1`

Implement:

```python
Z.euler_factor(p)
Z.euler_factors(start, stop)
Z.euler_product(s, prime_bound, prec=53, rigorous=False)
Z.dirichlet_series(s, coefficient_bound, prec=53)
```

For `sigma=Re(s)>1`, a finite Euler product can have an explicit missing-prime
bound derived only from `degree(K)`. Since at most `n` prime ideals lie above a
rational prime,

```text
log |tail| <= n * sum_{p>P} sum_{m>=1} p^(-m*sigma)/m.
```

Bound the right side by a computable Hurwitz-zeta/integral majorant and convert
it into an absolute enclosure for the omitted multiplicative tail. Combine
that analytic bound with Arb rounding balls. If the complete error is enclosed,
`rigorous=True` may return a ball or certified diagnostic. Otherwise it must
remain explicitly non-rigorous.

Do not evaluate this Euler product at `Re(s)<=1`, even if a short finite product
is numerically finite. Analytic continuation belongs to Project 4.

### Data interchange

Provide versioned streaming formats for:

- rational prime;
- `(e_i,f_i)` splitting records;
- optional exact prime-ideal lattices;
- local zeta polynomials;
- exact coefficient blocks;
- field polynomial, maximal-order/discriminant digest, and normalization.

This permits resumable computation and independent checking without exposing
private native handles.

### Project 3 exit criteria

- Exact coefficients agree with Sage/PARI and explicit ideal enumeration on a
  degree/discriminant corpus.
- Quadratic coefficients agree with Kronecker-character convolution.
- Euler products agree with Project 1 for quadratic fields and with direct
  series in the safe half-plane.
- A rigorous request either returns a complete enclosure or clearly rejects;
  it never relabels a heuristic truncation estimate as a proof.
- Prime and coefficient streaming is bounded-memory, resumable, and materially
  faster than repeated scalar decomposition.

## Project 4 — analytic continuation of general Dedekind zeta functions

### Scope

Implement arbitrary-precision numerical evaluation of `zeta_K(s)` for a
general absolute number field, initially at moderate precision and imaginary
height. This project supplies analytic continuation and the functional
equation; it does not prove GRH, locate zeros, or promise high-height
asymptotics.

The first production result may be non-rigorous in exactly the same sense as
the first elliptic `L`-series evaluator: Arb encloses finite arithmetic, exact
coefficients and explicit tails are tracked, but any unproved quadrature or
approximate-functional-equation remainder stays separate and the public result
is documented as a numerical approximation. A later proof-producing mode must
not reuse a midpoint-stability test as a theorem.

### Exact metadata prerequisites

Add and certify:

- `K.signature() -> (r1,r2)` using exact real-root isolation/Sturm data;
- exact discriminant and degree;
- archimedean gamma parameters in the frozen normalization;
- exact coefficient-prefix provider from Project 3;
- pole metadata at zero and one;
- functional-equation sign `+1` for Dedekind zeta.

The signature implementation should also establish a stable embedding ordering
for Project 5. Numerical root approximations alone are not an exact signature
certificate.

### General analytic engine

Build an internal, host-independent completed-Dirichlet-series evaluator from:

```text
degree, conductor/discriminant, gamma shifts,
functional-equation sign, pole/residue metadata,
and exact Dirichlet coefficients.
```

Dedekind zeta is its first and only required public consumer. Do not broaden
the public API into a universal motivic `L`-function framework until this
specialization is correct and measured.

Before implementation, commit a mathematical derivation memo fixing:

- the approximate functional equation or inverse-Mellin formula;
- smoothing kernel and gamma normalization;
- pole correction terms;
- coefficient cutoff and height/precision dependence;
- completed-to-raw conversion;
- every explicit and non-explicit error component.

Use ordinary Python and mpmath as a readable reference. The production path
should use Arb/Acb special functions and packed exact coefficient buffers.
Source-transparent `@native` kernels are preferred for summation loops; a
handwritten native mathematical kernel requires the architecture exception and
benchmark evidence prescribed by `ARCHITECTURE.md`.

### Routing

Use algorithm routing rather than one formula everywhere:

1. quadratic fields: Project 1's `zeta*L` factorization;
2. fields whose zeta is explicitly certified as a product of Dirichlet
   `L`-functions: an optional abelian-factorization oracle/accelerator;
3. `Re(s)>1` when cheaper: Project 3 direct series or Euler product;
4. far left: functional-equation reflection when numerically favorable;
5. critical region: the new smoothed AFE/inverse-Mellin evaluator.

Planning must occur before coefficient generation and must cap coefficient
count, precision, total coefficient-point operations, batch size, and height.
Batch points sharing coefficient and gamma preparation should cross the native
boundary together. Reuse adaptive plot tiling so large complex plots do not
violate a single-call resource cap.

### Derivatives and poles

Design the native computation around jets, not repeated finite differences.
Support at least:

- values and low derivatives at arbitrary regular points;
- deflated Laurent/Taylor data at `s=1`;
- raw and completed values;
- the entire `xi_K(s)` function;
- residue extraction at one;
- exact trivial-zero order predicted by `(r1,r2)` where applicable.

Near zeros and poles, stability checks must use mixed absolute/relative goals.
Never snap a nearby representable point to a special point.

### Project 4 exit criteria

- General values and derivatives agree with Sage/PARI, Magma, and Hecke/Oscar
  across degrees, signatures, discriminants, and precisions.
- The functional equation, conjugation, pole residues, trivial zeros, and
  quadratic cross-route identities pass.
- Increasing precision preserves stable digits through at least 200 bits, with
  focused 512-bit cases.
- Direct-series, Euler-product, AFE, and reflection routes agree in overlapping
  domains.
- Batches and plots reuse coefficient preparation and beat independent scalar
  calls materially.
- Requests outside the supported work domain fail before large allocation.
- Numerical documentation says exactly which error components are rigorous.

## Project 5 — units, regulators, class groups, and the class-number formula

Project 5 completes the algebraic side needed for serious computational number
theory. It must be delivered in certified vertical slices rather than beginning
with an opaque relation collector.

### 5A. Archimedean embeddings and Minkowski geometry

Implement:

- exact signature and stable real/complex embedding ordering;
- arbitrary-precision embeddings with Arb enclosures;
- Minkowski/logarithmic embedding maps;
- trace and norm compatibility checks;
- exact/interval lattice matrices suitable for LLL and enumeration;
- Minkowski bounds for ideal classes.

Complex embeddings use one representative from each conjugate pair and the
standard factor two in logarithmic coordinates. Freeze this convention before
defining the regulator.

### 5B. Roots of unity and units

Implement:

```python
K.roots_of_unity()
K.number_of_roots_of_unity()
K.unit_group()
K.units()
K.regulator(prec=...)
```

The unit group must return its finite torsion part and `r1+r2-1` independent
fundamental units. Start with deterministic algorithms:

- real quadratic continued fractions as a small, independently checked fast
  slice;
- bounded Minkowski/Fincke--Pohst enumeration and logarithmic-lattice
  saturation for general fields;
- exact norm-one/unit verification in the maximal order;
- interval-certified nonzero regulator determinant;
- an index/saturation certificate proving the returned subgroup is the full
  unit group.

An independent set of units is not automatically a system of fundamental
units. The API must not claim completeness until the finite index is certified.
If only a subgroup is known, return a separately named object with an explicit
index bound.

### 5C. Certified class groups

Implement a deterministic baseline based on Minkowski's theorem:

- enumerate the necessary prime ideals through the class bound;
- reduce fractional ideals using the Minkowski lattice;
- find exact principal relations with element witnesses;
- compute Smith normal form of the relation lattice;
- return generators, invariant factors, discrete-log/reduction maps, and
  verifiable relations;
- certify that every ideal class reduces to the presented group.

The first implementation may have explicit degree/discriminant resource caps.
Correct exponential algorithms are acceptable as the baseline; silent
probabilistic completeness is not.

After that baseline is established, add relation collection, sieving, sparse
linear algebra, compact relation certificates, and Buchmann-style acceleration.
Any conditional analytic bound or GRH assumption must be an explicit public
option and part of the returned proof status. A fast heuristic computation may
suggest a group but cannot populate the same `proof=True` cache as a certified
one.

Complete the ideal API needed by class groups:

- ideal equivalence and principality;
- principal generator recovery;
- reduced representatives;
- class-group maps in both directions;
- exact transport under field isomorphisms.

### 5D. Analytic class-number formula

With `h_K`, `R_K`, `w_K`, signature, and discriminant available, verify

```text
Res_{s=1} zeta_K(s)
  = 2^r1 * (2*pi)^r2 * h_K * R_K
    / (w_K * sqrt(|D_K|)).
```

Provide:

```python
K.analytic_class_number_formula(prec=100)
Z.residue(1, prec=100)
```

The report should contain both sides, their Arb enclosures or numerical error
status, and every exact invariant used. This is a cross-check between
independently implemented algebraic and analytic subsystems, not a circular
definition of the class number or regulator.

Special care is required for rank-zero unit groups: use the standard regulator
convention `R_K=1`. Test `QQ`, imaginary quadratic, real quadratic, mixed cubic,
totally real, and totally complex examples.

### Project 5 exit criteria

- Unit rank, roots of unity, exact unit verification, and regulators agree with
  Sage/PARI, Magma, and Hecke/Oscar.
- Fundamental-unit completeness and class-group presentations have checkable
  certificates.
- Every class-group generator and relation is represented by exact ideals and
  principal-element witnesses.
- Imaginary quadratic results agree with Sage.js's existing binary-quadratic-
  form implementation; real quadratic continued fractions agree with the
  general path.
- The analytic class-number formula agrees at independently increased
  precision across the corpus.
- Heuristic/conditional and proved computations remain distinct in caches,
  displays, serialization, and documentation.

## Oracle and regression corpus

Create one versioned offline corpus shared across the five projects. It should
include:

- `QQ` as the degree-one normalization case;
- imaginary quadratic discriminants `-3`, `-4`, `-7`, `-20`, `-23`, and larger
  class-number examples;
- real quadratic discriminants `5`, `8`, `12`, `13`, and examples with large
  fundamental units;
- cubic fields of signatures `(3,0)` and `(1,1)`;
- quartic fields of signatures `(4,0)`, `(2,1)`, and `(0,2)`;
- cyclotomic and maximal real subfields, giving independent Dirichlet-product
  identities;
- degrees five and six within practical oracle limits;
- monogenic and nonmonogenic fields;
- alternate defining polynomials for explicitly isomorphic fields;
- primes that are inert, split, partially split, tamely ramified, wildly
  ramified, and divisors of the equation-order index;
- class number one and nontrivial/cyclic/noncyclic class groups;
- unit ranks zero through at least three.

Store:

- defining polynomial and field-isomorphism metadata;
- maximal-order basis and discriminant digest;
- signature;
- prime decompositions with exact HNF ideal bases and `(e,f)`;
- zeta coefficients and local-factor hashes;
- zeta values, derivatives, residues, and completed values at 53, 100, and 200
  bits, with selected 512-bit values;
- fundamental units, torsion order, regulator, class-group invariants and
  generator ideals;
- source system, version, normalization, command, and precision.

Use persistent one-process oracle harnesses so startup does not dominate.
Sage/PARI is the primary compatibility oracle; Magma and Hecke/Oscar provide
independent implementation families. Oracle generation scripts may use these
systems, but committed tests must run offline without them.

## Validation strategy

### Exact algebra tests

- decomposition product and quotient-field certificates;
- `sum(e_i*f_i)=degree`;
- ideal inverse/product, valuations, and factor reconstruction;
- coefficient multiplicativity and local recurrences;
- field-isomorphism invariance;
- unit norms and order membership;
- regulator rank and nonzero interval determinant;
- class-group relation witnesses and Smith form;
- reduction/discrete-log round trips.

### Analytic tests

- conjugation;
- raw/completed functional equations;
- Riemann and Dedekind poles and residues;
- trivial zeros and exact special points without proximity snapping;
- quadratic `zeta*L` identity;
- abelian factorization identities;
- Euler product/direct series/AFE overlap;
- precision-doubling stability;
- batched versus scalar evaluation;
- analytic class-number formula from independent algebraic data.

### Failure and resource tests

- composite input passed as a rational prime;
- unsupported or malformed discriminant/character;
- corrupted decomposition and class-group certificates;
- incompatible field/order/ideal serialization;
- insufficient coefficient prefixes;
- precision, height, batch, enumeration, and factor-base caps;
- native capability absence and dynamic fallback;
- cancellation and interruption without cache poisoning.

## Performance program

Record exact-SHA cold, warm, cached, scalar, batch, and kernel timings on
`bench-1`, with cross-platform smoke timings. Always separate native dependency
compilation and lazy-module compilation from warm mathematical work.

Measure at least:

- Riemann and quadratic zeta scalar/jet/batch evaluation;
- prime decomposition at good, index-dividing, tame, and wild primes;
- prime-range splitting streams;
- `zeta_coefficients(B)` scaling in `B`, degree, and discriminant;
- Euler-product evaluation with and without cached local data;
- general zeta coefficient generation versus analytic summation;
- embedding, unit enumeration, regulator, relation collection, and
  certificate verification separately;
- class-group producer time versus verifier time.

Compare with direct PARI/GP, Sage wrappers, Magma, and Hecke/Oscar on the same
host when possible. Do not claim competitiveness by comparing a cached Sage.js
call with a cold reference process. Every benchmark must check a stable result
digest, not merely execute the operation.

Initial engineering goals:

- FLINT-backed Riemann and quadratic values should be within a small constant
  factor of direct FLINT/PARI after initialization;
- batched values should materially beat independent scalar calls;
- good-prime decomposition should be dominated by finite-field factorization,
  not repeated maximal-order construction;
- compact splitting streams should be materially faster and smaller than
  constructing all prime-ideal objects;
- exact certificate verification should be meaningfully cheaper than the
  hardest producer path;
- specialized quadratic arithmetic should not regress when the general APIs
  are added.

## Implementation architecture

Follow `ARCHITECTURE.md` in this order:

1. ordinary strict Python for mathematical policy, exact fallbacks,
   certificates, routing, and reference algorithms;
2. source-transparent `@native` compilation for typed exact or numeric loops;
3. declared mature FLINT/Arb functions for polynomial, matrix, finite-field,
   complex-zeta, gamma, LLL, and special-function kernels;
4. handwritten C/C++ only for representation/host adapters or a measured
   compiler limitation with an explicit architecture exception.

Organize substantial code in lazy, strict modules such as:

```text
src/lib/sagejs/number_fields/prime_ideals.py
src/lib/sagejs/number_fields/zeta_coefficients.py
src/lib/sagejs/number_fields/dedekind_zeta.py
src/lib/sagejs/number_fields/embeddings.py
src/lib/sagejs/number_fields/units.py
src/lib/sagejs/number_fields/class_groups.py
```

Keep the public bootstrap methods in `src/baselib/number_fields.py` thin. Do not
add the full algorithms to startup. Add fully migrated modules to strict
Pyright coverage and production lazy precompilation before documenting cold
interactive performance.

Native ABIs should pass packed coefficient arrays, HNF matrices, splitting
records, complex-point arrays, and status structures. Do not make one N-API
call per coefficient, prime, embedding, or relation. Host-independent kernels
must remain separable from Node adapters.

Every new native export, file, kernel, FFI declaration, and package capability
must be classified in the architecture inventories. Run `pnpm
architecture:check` after every boundary change.

## Numerical and proof policy

Use these exact labels consistently:

- **exact** — integers, rational HNF lattices, ideal products, coefficient
  lists, group presentations with exact witnesses;
- **rigorous enclosure** — Arb/Acb ball plus complete analytic truncation and
  discretization bounds;
- **numerical approximation** — arbitrary-precision midpoint with refinement
  and explicitly incomplete analytic error control;
- **conditional** — depends on GRH or another named assumption;
- **heuristic** — no completeness proof.

An Arb radius encloses only the finite arithmetic actually performed. It does
not automatically enclose omitted ideals, primes, coefficients, quadrature,
or relation searches. Keep those error and proof categories separate in
diagnostics and serialization.

Caches must include proof status. A heuristic class group or non-rigorous zeta
value must not satisfy a later `proof=True` request.

## Phased execution

### P0 — semantics, references, and corpus

- Freeze pole, derivative, completion, factorization, and proof semantics.
- Generate the shared offline oracle corpus.
- Record current Sage.js and reference baselines.
- Audit existing maximal-order local evidence and FLINT/Arb binding surfaces.
- Freeze packed schemas for splitting records, coefficient blocks, analytic
  diagnostics, and certificates.

Exit criterion: every later project has oracle inputs and an agreed public and
internal contract before implementation branches diverge.

### P1 — Riemann and quadratic zeta

- Bind arbitrary-complex Riemann zeta and jets.
- Add Kronecker characters.
- Add `DedekindZetaFunction` and the quadratic product route.
- Add values, derivatives, residues, completion, batching, plots, docs, and
  cross-platform tests.

Exit criterion: Project 1 exit criteria are green and committed independently.

### P2 — prime ideals and ideal arithmetic

- Add prime-ideal representation and certificates.
- Implement good-prime, local-evidence, and generic fallback decomposition.
- Add inversion, valuations, integral-ideal factorization, serialization, and
  prime-range streaming.
- Differentially test index-dividing and ramified cases.

Exit criterion: Project 2 exit criteria are green without relying on analytic
zeta code.

### P3 — coefficients and Euler products

- Generate compact local zeta factors and exact multiplicative coefficients.
- Add coefficient and splitting streams.
- Add controlled direct-series and Euler-product evaluation for `Re(s)>1`.
- Cross-check quadratic and explicit-ideal-enumeration identities.

Exit criterion: Project 3 exit criteria are green and documentation never
claims continuation outside the convergence domain.

### P4 — general analytic continuation

- Add exact signatures and embedding metadata.
- Commit the analytic derivation/error memo.
- Implement reference and production completed-series evaluators.
- Add routing, jets, pole deflation, batching, plotting, caching, and resource
  planning.
- Validate on all signatures and against multiple oracle families.

Exit criterion: Project 4 exit criteria are green with honest numerical status.

### P5 — units and class groups

- Add embeddings, Minkowski geometry, roots of unity, and real-quadratic units.
- Add general unit search, saturation certificates, and regulators.
- Add deterministic class groups and proof objects.
- Add optional accelerated relation collection without weakening proof status.
- Verify the analytic class-number formula independently.

Exit criterion: Project 5 exit criteria are green within documented resource
domains.

### P6 — integration and release gates

For every independently shipped phase:

- run focused CPython, Sage.js, native, and oracle tests;
- run `pnpm format:python`, strict Pyright, `pnpm architecture:check`, relevant
  native suites, documentation example tests, and `pnpm test:changed`;
- validate one exact commit on Linux x64/arm64, macOS arm64, and native Windows
  x64 when native code changed;
- update API docs, tutorials, limitations, provenance, and benchmark reports;
- commit and push coherent changes with a clean worktree.

## Suggested parallel lanes

When a phase is explicitly run as a multi-agent project, use narrow worktrees
and contracts:

1. **exact algebra lane** — prime ideals, ideal arithmetic, coefficients, or
   units/class groups for that phase;
2. **analytic/native lane** — FLINT/Arb bindings, packed evaluators, focused
   native tests;
3. **reference/oracle lane** — ordinary-Python formula, Sage/PARI, Magma, and
   Hecke/Oscar corpus;
4. **API/documentation lane** — public objects, examples, plotting, error and
   proof semantics;
5. **integration lane** — shared baselib hooks, registries, inventories, full
   gates, merge, and exact-SHA receipts;
6. **cross-platform lane** — Windows, macOS arm64, and Linux arm64 after the
   integration SHA stabilizes.

Only the integration lane should edit shared addon registries, architecture
inventories, broad package manifests, or CI routing unless explicitly
coordinated.

## Main risks and mitigations

### Polynomial factorization being mistaken for prime decomposition

At primes dividing the equation-order index, Dedekind--Kummer can return the
wrong ideals or ramification data.

Mitigation: gate that path with an index certificate, use maximal-order local
data or the finite-algebra fallback, and independently verify the exact ideal
product and residue fields.

### Local producer evidence being treated as a proof of itself

The maximal-order and OM algorithms are complex enough that reusing their
internal branch state as the only verifier would couple two bugs.

Mitigation: canonical HNF prime ideals and an independent quotient/product
certificate checker are the public truth.

### General analytic zeta being overgeneralized too early

A universal `L`-function framework could consume the project before one number
field zeta evaluator is reliable.

Mitigation: make Dedekind zeta the sole required consumer, with an internal
metadata schema only as general as its tests demand.

### Pole and gamma normalization drift

PARI, Sage, FLINT, and the literature use completed functions differing by
constant factors.

Mitigation: freeze `Gamma_R`, `Gamma_C`, `Lambda_K`, and `xi_K` above; store
normalization metadata; test residues and functional equations across routes.

### Unproved numerical errors presented as Arb proofs

Ball arithmetic does not bound omitted coefficients or an unproved AFE
remainder.

Mitigation: separate arithmetic radii from analytic errors and label results
according to the numerical/proof policy.

### Unit subgroup mistaken for the full unit group

Finding the expected number of independent units proves rank, not saturation.

Mitigation: require an index/saturation certificate before returning a
fundamental-unit group; expose incomplete subgroups under a different API.

### Probable class groups poisoning proved caches

Fast relation collection can produce a plausible presentation without proving
generation or completeness.

Mitigation: immutable proof-status keys, exact relation witnesses, Minkowski or
explicit analytic bounds, and separate heuristic results.

### Enumeration explosion

Minkowski bounds, ideal enumeration, coefficient cutoffs, and relation searches
can become enormous.

Mitigation: deterministic preflight estimates, explicit resource objects,
streaming, cancellation, checkpointing, and clear bounded-domain errors.

### Cross-platform native drift

Word sizes, signed `char`, callback ABIs, and library build assumptions have
already caused real smalljac portability bugs.

Mitigation: fixed-width public ABIs where appropriate, native Windows testing,
portable arithmetic regressions, and exact-SHA four-platform receipts for every
native change.

## Completion criteria for the full program

The five-project program is complete when:

- arbitrary-complex Riemann zeta and complete quadratic Dedekind zeta functions
  are public, tested, plotted, and documented;
- rational primes decompose into certified prime ideals in arbitrary supported
  maximal orders, including index-dividing and ramified cases;
- exact ideal factorization, zeta coefficients, and right-half-plane Euler
  products are available with honest error semantics;
- general Dedekind zeta values, derivatives, completed values, poles, and
  residues agree with independent systems across the corpus;
- exact signatures, embeddings, roots of unity, certified fundamental units,
  regulators, and class groups are implemented within documented resource
  domains;
- the analytic class-number formula cross-checks independent analytic and
  algebraic computations;
- heuristic, conditional, numerical, rigorous, and exact results cannot be
  confused through APIs, caches, or serialization;
- Linux x64/arm64, macOS arm64, and native Windows x64 pass at exact commits;
- repository architecture, strict-Python, formatting, native, documentation,
  and changed-test gates pass;
- all implementation and validation changes are committed and pushed with
  clean worktrees.

## Deferred projects

Keep these separate from the foundational program:

- relative number fields and towers;
- orders over general Dedekind domains;
- ray class groups, narrow class groups, and class fields;
- general Hecke characters and Hecke `L`-functions;
- Artin `L`-functions and general motivic `L`-function objects;
- asymptotically optimized very-high-height evaluation and zero searches;
- GRH verification and explicit-formula computations;
- subexponential class groups for huge discriminants without a practical
  certificate strategy;
- higher-genus global `L`-functions.

## Primary references

- Sage number-field zeta API and coefficient semantics:
  <https://doc.sagemath.org/html/en/reference/categories/sage/categories/number_fields.html>
- Sage algebraic number fields and prime ideals:
  <https://doc.sagemath.org/html/en/reference/number_fields/>
- FLINT Arb complex zeta and Dirichlet `L`-functions:
  <https://flintlib.org/doc/acb_dirichlet.html>
- Henri Cohen, *A Course in Computational Algebraic Number Theory*, especially
  maximal orders, ideals, units, and class groups.
- Jürgen Neukirch, *Algebraic Number Theory*, for prime decomposition, zeta
  functions, and the analytic class-number formula.
- J. Buchmann and H. W. Lenstra Jr., algorithms for maximal orders and
  computational algebraic number theory.
- J. Guàrdia, J. Montes, and E. Nart, OM representations and prime-ideal
  decomposition.
- Tim Dokchitser, *Computing special values of motivic L-functions*:
  <https://arxiv.org/abs/math/0207280>
- PARI/GP `bnf`, ideal, and `lfun` implementations as source and oracle
  references, never a runtime dependency.
- Existing Sage.js maximal-order plans:
  `agents/number-field-maximal-order-pari-parity-plan.md` and
  `agents/number-field-maximal-order-optimization-plan.md`.
- Existing Sage.js elliptic analytic infrastructure:
  `agents/elliptic-curve-lseries-complex-evaluation-plan.md` and
  `agents/elliptic-curve-lseries-performance-and-plotting-plan.md`.
