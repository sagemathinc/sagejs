# Next faithful preparation producer: non-index-divisor `get_fs`

Read-only dependency audit, 2026-09-15. No implementation or timing claim.

## Concrete next entry

Implement `pari_get_fs_nonindex(coefficients, degree, equation_index, prime,
workspace, factor_degrees, factor_exponents, degrees, counts, state)`.
Inputs are the monic defining polynomial and equation-order index from the
declared `nfinit` interchange, one rational prime, and explicit scratch/output
owners. There are no supplied modular factors, splitting patterns, prime
ideals, or class-group answers. Coefficients are low-to-high exact integers.

Start with degree 2–4 and odd primes at most 3037000493, the pinned 64-bit
PARI `SMALL_ULONG` boundary. Check `equation_index % prime != 0` before any
publication. Return explicit unsupported statuses for characteristic two,
index divisors, larger degree/prime, and inadequate workspace. Do not silently
substitute a different factorization algorithm on those branches. Exact
workspace bounds should be derived while assigning the actual temporary
polynomial spans, not inferred from an expected result.

`factor_degrees` and `factor_exponents` expose the sorted `Flx_degfact` result
for replay. The final `degrees/counts` are the compressed `[f,n]` from
`buch2.c:get_fs`: count **distinct irreducible factors** of each degree,
not their factorization multiplicities. A ramified polynomial at a
non-index-dividing prime still belongs in this first corridor, so squarefree
decomposition cannot be omitted. The source's sorted order must be retained.

This closes the polynomial-to-raw-pattern boundary for that declared domain.
It does not yet supply every prime needed by analytic normalization, let alone
the full selected descriptor catalog. Prime enumeration/cache growth remain
separate scheduling inputs to this one-prime producer.

## Exact upstream slice

Use function names as authoritative anchors (line numbers below refer to the
unmodified archive except the explicitly named local instrumentation caveat).

1. `buch2.c:get_fs`: reduce `P` by `ZX_to_Flx`, call `Flx_degfact`, then group
   adjacent equal degrees. Preserve the index-divisor guard.
2. `FpX_factor.c:Flx_degfact` (2322), `Flx_factor_i` (2303), flag 1:
   normalize; dispatch characteristic two separately; degree at most two
   uses `Flx_factor_deg2` / `Flx_degfact_2` (1539–1577).
3. The quadratic branch uses `Flx_quad_factortype`, `Fl_disc_bc`, and `krouu`.
   Its three results distinguish split, irreducible, and repeated-linear
   cases. Do not replace this source dispatch with root enumeration.
4. Degrees three/four enter `Flx_simplefact_Cantor` (2271):
   `Flx_get_red_pre`, `Flx_factor_squarefree_pre` (1959), then for each
   squarefree multiplicity layer `Flx_Frobenius_pre` and `Flx_ddf_Shoup`
   (2023), followed by `vddf_to_simplefact` (715) and source sorting.
   Despite the wrapper name, this degree-only route does not require
   equal-degree splitting or a random irreducible-factor search.
5. Polynomial primitive slice in `Flx.c`: normalization (547), derivative,
   deflation, add/subtract, basecase multiplication (665), dedicated square
   (1008), remainder (1359), division/remainder (1428), basecase GCD (2129),
   quotient-ring multiply/square, powers, and polynomial evaluation from a
   power table. Preserve leading/trailing-zero trimming and normalization.
   The pinned small degrees are below the Barrett, half-GCD, Karatsuba and
   packed-integer dispatch thresholds; verify intermediate degrees too.
6. `Flx_Frobenius_pre` (3032) calls `Flxq_powu_pre` (2920), which reaches
   `bb_group.c:gen_powu_i` (147). **Preserve its power schedule**: binary for
   exponent below 512, sliding window 2 below `2^25`, otherwise window 3.
   A generic replacement binary-power loop would change source work for
   many actual factor-base primes.

For degree three/four, Shoup has `B=floor(n/2)` and `l=floor(sqrt(B))=1`.
The baby-step loop is empty, but the giant-step power-table/evaluation and
GCD/division stages still follow the literal source. Port that source shape;
do not replace the cubic case with a root-count trick merely because the
answers coincide. Preserve `brent_kung_optpow` and actual table dimensions.

At the scalar leaves, the small-prime `pi=0` branch is available. PARI's
basecase convolution/remainder delay reductions and reduce when `HIGHBIT`
is set; replacing every product/addition with `% p` is mathematically valid
but is not the same arithmetic schedule. Ordinary exact Python can retain
these source branches while the compiler represents bounded intermediates.

## What can actually be reused

- Port `relation_cache.py:pari_word_mod_inverse` already supplies the literal
  scalar inverse. `factorization.py:pari_word_kronecker_odd` supplies the odd
  Kronecker leaf, subject to confirming its normalization domain matches the
  reduced quadratic discriminant. Exact integer operations and ordinary
  explicit buffers already work through the compiler.
- Main-library `kernels/polynomial/packed_prime_field.py` has native add,
  subtract, negate, derivative, multiply, evaluation and quotient/remainder;
  `polynomial_algorithms/packed_prime_xgcd.py` has extended GCD. These are
  useful independent oracles/primitive references, **not** a ready PARI
  `Flx` factorizer. They use a `PrimeFieldModulus`/`UInt64Buffer` domain at most
  `2^32-1`; direct composition with the port's exact-owner graph needs an
  explicit ABI decision. Their reductions and GCD normalization differ from
  the source schedule, so they cannot silently replace the above chain in
  a language-isolation experiment.
- `number_fields/bl_composite_kernel.py` contains ordinary exact-buffer
  polynomial copy/division/GCD helpers (1408–1488), useful for differential
  checks. Those also are not a source-equivalent PARI schedule.
- `number_fields/prime_ideals.py` already offers FLINT-backed packed degree
  records and an alternative certified finite-algebra decomposition. Using
  either would close a practical data boundary, but would change the chosen
  algorithm and therefore answer a different experiment.

No existing port module found implements the needed `Flx` polynomial layer.
The next implementation should explicitly own that small layer rather than
assume that scalar `pari_word_modpow` can power quotient-ring polynomials.

## Branches needed after this first producer

Characteristic two is a separate real dependency, not a disposable example:
`Flx_factor_i` calls `F2x_factor_i` (1938), and flag 1 at degree above two
selects **Berlekamp**, not the disabled `F2x_simplefact_Cantor` block.
The slice is `F2x_Berlekamp_i` (1666), squarefree decomposition,
`F2x_split_Berlekamp`, Frobenius matrix, and binary-matrix kernel. Existing
packed GF(2) arithmetic can support leaves but source pivot/split policy must
still be translated.

Follow-up audit narrows the degree-at-most-four characteristic-two branch:
after stripping the valuation at X, each squarefree layer has at most two
irreducible factors. Three distinct factors with nonzero constant term need
at least degrees 1+2+3=6 over F2. Exhaustive checks of all 28 monic degree-2--4
binary polynomials confirm this. Thus the source random-combination branch
for kernel dimension greater than two is unreachable in this domain; the
Berlekamp matrix and its exact second kernel vector are still required.
`F2m_ker_sp` processes columns left-to-right, chooses the lowest unused pivot
row, performs forward column XORs retaining dependency bits, and constructs
the basis in ascending free-column order. A generic equivalent nullspace basis
does not necessarily preserve the chosen splitting polynomial. Unlike the odd
prime path, this source skips constant squarefree layers.

For index divisors, `get_fs` calls full `idealprimedec`, not just polynomial
factor degrees. `base2.c:primedec_aux` (2248) includes Dedekind obstruction,
`pradical`, Frobenius on the maximal-order algebra, and splitting its etale
quotient. Do not report ordinary polynomial factors as field splitting there.

Full selected descriptors are a later and deeper slice even away from index
divisors: `primedec_aux` calls **full** `FpX_factor`, then
`idealprimedec_kummer` (2085). The latter needs polynomial-to-integral-basis
conversion, centered representatives, quotient `T/u`, valuation correction
via `ZpX_resultant_val`, and `zk_multable` for tau. Inert descriptors alone
are trivial, but an inert-only producer does not close the active factor-base
boundary. The existing prime-ideal HNF/selected packet constructor starts
after these generators and tau data exist.

## Required replay before connecting the analytic cache

Compare degrees **and** multiplicities to pinned `Flx_degfact`, then grouped
patterns to pinned `get_fs`, for all supported primes in the four tuning
catalogs. Include repeated factors (not only discriminant-coprime primes),
zero intermediate derivatives, normalization/zero-tail cases, and modulus
boundaries. Count Frobenius square/multiply calls and source DDF stages to
detect algorithm substitutions. Check unsupported p=2/index-divisor calls
return their frontier before output publication. Only then consume produced
patterns in GRH/inverse-residue preparation; keep missing branches explicit.

## Source identity

Archive: `/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz`, SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
The following hashes were checked directly from archive members:

| `src/basemath/` member | SHA-256 |
| --- | --- |
| `buch2.c` | `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac` |
| `FpX_factor.c` | `41af00858395172cc1663d8b48e774dfee599f08f4e28088be2e7e957b595b49` |
| `Flx.c` | `7d22f056fe56aa3c5fbd6b0e8f02fdb2e13e285d8a519382ddb2dbe7efefda44` |
| `base2.c` | `60c5d59b843d400a3aab248282464d6c5d47ee57f9d62634334603542abd1e91` |
| `bb_group.c` | `30ceda3cedce14d61e646021fe7c59e057beb8694002ee09b8532eaa32ea27c3` |

The existing extracted `buch2.c` in that scratch tree is instrumented and
currently hashes `d8b09a54e51399c83f2faa92ccc3f1f70f41d660b1cb279738bc207ff553f87a`.
Do not use that mutable instrumentation as the pinned source oracle. The
other four inspected source files match the archive. Threshold references
are `src/headers/parigen.h:SMALL_ULONG` and `src/kernel/gmp/tune.h`; an eventual
new platform qualification must record its actual word width and thresholds.
