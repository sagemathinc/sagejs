# Classical modular forms with nebentypus: object-layer design

## Objective

Extend the parented classical modular-form layer from the trivial-character
$\Gamma_0(N)/\QQ$ case to fixed Dirichlet character spaces

$$
M_k(N,\varepsilon),\qquad S_k(N,\varepsilon),
$$

without weakening exactness, parent identity, Sturm certification, or the
existing trivial-character API.

The first public constructor surface is Sage-compatible:

```sage
chi = DirichletGroup(13).0^2
M = ModularForms(chi, 2)
S = CuspForms(chi, 2)
```

Quadratic characters use $\QQ$. Characters of order greater than $2$ use the
minimal exact cyclotomic field containing their values. An explicitly supplied
exact cyclotomic overfield is accepted when it contains every character value.

## Mathematical domain

The initial certified domain is weight $k\geq2$ with the parity condition

$$
\varepsilon(-1)=(-1)^k.
$$

Parity-incompatible spaces are valid zero-dimensional parents. Weight $1$
cusp spaces remain outside this slice because their dimensions require the
Schaeffer algorithm; Eisenstein-only weight-$1$ support may be added
independently later.

The defining level is the character modulus, not merely its conductor. This is
part of parent identity and is essential for imprimitive characters.

## Parent and element identity

`ModularFormsSpace` stores both:

- `_group = Gamma0(N)`, for index and level geometry;
- `_character = epsilon`, or `None` only for the historical
  trivial-character $\Gamma_0(N)$ constructor.

Every ambient signature contains the character modulus and canonical value
table in addition to level, weight, and coefficient ring. Thus two different
nebentypus characters can never share elements, coordinates, operators, or
caches accidentally.

The following methods propagate the exact defining data:

- `character()` on ambient spaces, subspaces, elements, old/new spaces, and
  newforms;
- `base_ring()` everywhere;
- `group()` remains `Gamma0(N)`;
- `level()` remains $N$.

Coordinate vectors, basis matrices, zero series, scalar arithmetic, and Hecke
matrices are all constructed over `space.base_ring()`. There are no implicit
coercions through $\QQ$ in the character path.

## Basis construction

### Cuspidal basis

The canonical cusp basis is the existing exact Hecke-dual echelon basis of

```sage
ModularSymbols(epsilon, k, sign=1, base_ring=K).cuspidal_submodule()
```

at precision strictly beyond the Sturm bound. This engine already includes
the character Manin relations, boundary kernel, diamond scalar, good-prime
nebentypus recurrence, and bad-prime $U_p$ action.

### Eisenstein basis

Enumerate the standard new Eisenstein data $(\chi,\psi,t)$ satisfying

$$
\chi\psi=\varepsilon,
\qquad
\operatorname{cond}(\chi)\operatorname{cond}(\psi)t\mid N,
$$

and

$$
\chi(-1)\psi(-1)=(-1)^k.
$$

Each candidate is the exact series

$$
E_k(\chi,\psi)(q^t),\qquad
a_n=\sum_{d\mid n}\psi(d)\chi(n/d)d^{k-1}.
$$

Candidates are coerced into the ambient coefficient field, echelonized at a
Sturm-certified precision, and required to have rank exactly
`dimension_eis(epsilon,k)`. Failure is an arithmetic error, never silent basis
truncation. The parameter list is deterministic and inspectable.

The ambient basis is the Eisenstein echelon basis followed by the cusp echelon
basis, preserving the existing parent-coordinate convention.

## Membership, coordinates, and arithmetic

Membership and coordinate recovery solve against the canonical basis over the
ambient exact field and verify the reconstructed coefficient row. Low display
precision is only truncation of a basis first certified beyond Sturm.

Addition requires equal ambient signatures. Products have

$$
(N_1,k_1,\varepsilon_1)(N_2,k_2,\varepsilon_2)
\longmapsto
(\operatorname{lcm}(N_1,N_2),k_1+k_2,
\widetilde\varepsilon_1\widetilde\varepsilon_2),
$$

where characters are induced to the common level and multiplied exactly.
The result coefficient field is a common exact cyclotomic field. The product
is recovered through a Sturm-certified expansion in its target parent.

## Hecke action

For cusp and new spaces, transport the already-certified modular-symbol Hecke
matrix into the canonical q-expansion basis. For the ambient and Eisenstein
spaces, apply the exact coefficient formula

$$
a_m(T_n f)=
\sum_{d\mid(m,n)}\varepsilon(d)d^{k-1}
a_{mn/d^2}(f),
$$

with the usual bad-prime interpretation when $d$ is not coprime to $N$.
The resulting matrix is solved and verified over the exact coefficient field.

## Old and new spaces

If $\varepsilon$ is primitive, the cuspidal space is new at every prime
needed to lower the modulus, so the oldspace is zero and the newspace is the
whole cusp space.

For imprimitive $\varepsilon$, build its unique descended character at each
eligible lower level and form the two degeneracy images $f(q)$ and $f(q^p)$.
Their exact Sturm-echelon span is the oldspace. The newspace is obtained from
the character modular-symbol new kernel when available; otherwise it is the
Hecke-stable exact complement certified by equality of old-plus-new spans
through Sturm. No dimension subtraction alone counts as a construction.

## Eigenforms and coefficient fields

Decompose the new character modular-symbol space by exact good-prime Hecke
operators and then bad-prime operators. A one-dimensional constituent over
$K$ yields a normalized eigenform with coefficient field $K$, not $\QQ$.
Higher-dimensional constituents require an exact simple extension of $K$.
The relative defining polynomial over $K$ is retained as certificate data,
while the selected extension and all eigenvalues are represented by their
canonical exact embedding in `QQbar`. This avoids inventing a rational field
and avoids pretending that the current absolute-number-field parent is a
general public relative-number-field implementation.

Eigenvalues obey

$$
a_{p^r}=a_p a_{p^{r-1}}-\varepsilon(p)p^{k-1}a_{p^{r-2}}
$$

at good primes and the $U_p$ recurrence at bad primes.

## Serialization

SagePack stores the defining character as part of every character ambient
parent. Subspaces and elements continue to serialize through their parent and
exact coordinate vector. Round trips must preserve character, coefficient
field, basis, old/new parent, Hecke operator, and newform data.

## Differential corpus

Pin exact Sage and Magma receipts for:

- quadratic characters over $\QQ$, including odd weight;
- order $3$, $4$, and $6$ characters over cyclotomic fields;
- primitive prime modulus and imprimitive prime-power/composite modulus;
- zero-dimensional parity mismatch;
- cusp, Eisenstein, and ambient bases through the Sturm bound;
- good $T_p$, bad $U_p$, and composite $T_n$ matrices and characteristic
  polynomials;
- old/new dimensions and exact span equality;
- normalized eigenform coefficients beyond Sturm;
- SagePack round trips.

Comparisons use exact coefficient embeddings or invariant characteristic
polynomials, never decimal approximations.

SageMath $10.9.post1$ is the primary independent oracle for the full character
range. Magma $V2.18-5$ independently checks the quadratic rows. Its available
public `ModularForms([chi])` interface combines Galois-conjugate characters,
and its direct Hecke path rejects characters with values outside $\{\pm1\}$,
so higher-order comparisons use Galois-invariant packet data rather than
claiming a one-character basis comparison that this installed Magma does not
provide.

## Delivery gates

1. Constructor, identity, representation, and ring tests.
2. Exact cusp/Eisenstein/ambient basis tests through Sturm.
3. Membership, coordinates, scalar arithmetic, and products.
4. Good/bad/composite Hecke tests.
5. Primitive and imprimitive old/new tests.
6. Eigenform and serialization tests.
7. Sage and Magma differential receipts plus bounded performance receipts.
8. Strict Python, formatting, changed tests, architecture checks, docs, and
   native Windows/Linux/macOS CI on the stacked pull request.

## Implemented vertical slice

The delivered slice covers:

- nontrivial quadratic characters over $\QQ$ and higher-order characters over
  exact cyclotomic fields;
- canonical ambient, cusp, and Eisenstein bases certified beyond Sturm;
- exact membership, coordinates, products, and good, bad, and composite Hecke
  action;
- primitive and imprimitive old/new spaces with exact direct-sum
  certificates;
- normalized one-dimensional packets over the character field and
  higher-dimensional relative packets in exact `QQbar` embeddings;
- deterministic SagePack round trips for parents, subspaces, elements,
  operators, and normalized newforms.

The pinned integration corpus uses Conrey-numbered characters at levels $4$,
$5$, $9$, $12$, $13$, and $20$. It includes parity-zero parents, a quadratic
Magma row, cyclotomic Sage rows, bad-prime and composite-index operators,
imprimitive degeneracy images, prime-power coefficient recurrences, and
serialization authentication.
