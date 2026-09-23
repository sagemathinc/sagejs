# Polynomial-to-prime-pattern translation

This step implements the non-index-divisor branch of PARI 2.17.4 `get_fs`
for monic degree 2--4 polynomials and rational primes at most
3037000493. It accepts coefficients and the equation-order index, not modular
factors or known splitting patterns. Primality is a caller precondition.
The final counts count distinct irreducible factors, not their exponents.

The connected source is `get_fs_small.py`, `flx_small_factor.py`,
`flx_small_power.py`, `flx_small.py`, `f2x_small.py`, and
`f2x_small_factor.py`. The implementation retains:

- the quadratic discriminant/Kronecker dispatch;
- squarefree decomposition, including inseparable and empty layers;
- the degree-at-most-four specialization of Shoup distinct-degree factoring;
- Frobenius binary/sliding-window power scheduling and source power tables;
- quotient-only versus remainder-only arithmetic;
- the source small-vector stable sort and final degree grouping.

This is not root enumeration or a substituted polynomial factorizer. The
small-domain predicates make the upstream basecase dispatch explicit. See
`get_fs_dependency_frontier.md` for the pinned source hashes and dependencies.

## Representation and validation boundary

Polynomials occupy nine exact-integer slots with an explicit degree (-1 for
zero). The entry requires 393 workspace slots, derived from the actual fixed
span layout. Clearing unused slot tails and copying between disjoint owners
are representation overhead relative to PARI's variable-length stack objects;
equal arithmetic schedules do not establish equal memory traffic or runtime.

The entry returns explicit unsupported statuses for index divisors,
larger degree/prime, and insufficient storage. These returns
leave outputs and scratch unchanged and publish only a frontier status.
The missing index-divisor branch is not silently replaced by ordinary
polynomial factor degrees. No class-group proof status or production dispatch
changes.

The checker obtains factor degrees/exponents from linked pinned `Flx_degfact`
and groups them with the literal upstream `get_fs` loop. Optional catalog
replay first computes `nfinit` indices/discriminants independently and checks
the field identities. It then compares every supported catalog prime, with
excluded primes counted explicitly. It never calls `bnfinit` for candidate
inputs. Synthetic reducible polynomials are local factorization controls, not
claims about number fields.

Reproduce the full replay under the experiment resource wrapper:

```sh
node bench/pari-class-group-port/check_get_fs_small.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz \
  --catalog /tmp/sagejs-analytic-invhr-d88QqB/fixtures.json --native
```

The generated receipt records all six source hashes, upstream source hashes,
linked library identity, generated native core/addon identities, and actual
coverage. This diagnostic is not a paired performance comparison.

## Qualified checkpoint

### Characteristic-two extension

`/tmp/sagejs-get-fs-small-jhs9Oh/fixtures.json` supersedes the coverage below:
5,178 exact matches in CPython, JavaScript, GMP and tagged execution, including
all 28 monic binary polynomials of degrees 2--4 and 4,918 catalog primes.
All four characteristic-two catalog entries now execute. Only the two index
divisors (3 and 37) remain excluded. Workspace remains 393 words; the ten
frontier and four invalid-input controls still pass on all backends.

The binary translation retains squarefree layers, valuation-factor insertion,
Berlekamp Frobenius construction, exact pivot/basis order, second-kernel-vector
splitting, and stable degree-only sorting. After stripping x, a squarefree
polynomial of degree at most four has at most two irreducible factors: three
distinct non-x factors require degrees at least 1+2+3. This proves the upstream
random-split branch unreachable in this domain, rather than substituting a
factor table. Constant squarefree layers are skipped as in the binary source.

Packed polynomial bits use checked uint64 XOR/OR because arbitrary-precision
native XOR/OR is unsupported. The bitwise helper has the explicit native-bitwise
source directive; a remaining unannotated indexed XOR initially lowered as
exponentiation and failed compilation. It now calls that tested helper.
Packed lookup tables have the source values but different access costs;
bounded representation equivalence does not establish equal runtime costs.

Independent leaf receipt `/tmp/sagejs-f2x-small-w0sbNd/fixtures.json` covers
35,392 polynomial cases and 787 matrix cases against PARI and all execution
modes, including exact mutated columns, basis order and untouched tails.
The final connected replay used 40.843691 CPU seconds including compilation,
37.743613 wall seconds, and 370652 KiB peak child RSS under the unchanged
4 GiB address cap. Core SHA-256:
`6be21103d44f4145cc165ce524896c8f624d492fc1d33aff7598132b57c6bc7d`.
Addon SHA-256:
`9bca41c3b5a3613de92dd028b1e4de89c8dd7f484064d7f767c15d691f2186c9`.
This is correctness qualification, not a new performance comparison or a
completed prepared-nf class-group path.

### Next dependency: index primes

The source `get_fs` calls full `idealprimedec`, not the degree-only shortcut.
The source audit of `base2.c:primedec_aux` therefore requires actual factors,
Dedekind correction, radical and quotient-algebra linear algebra, and complete
prime descriptors before extracting degrees. Merely calling a degree-only
routine would remove upstream work from the experiment.

For the cubic index prime 3, the correction leaves no Kummer factor; the
Frobenius radical has dimension two and the quotient is one-dimensional.
The required descriptor has ramification/residue degrees (3,1). For the
quartic index prime 37, a quadratic Kummer factor survives and the residual
two-dimensional algebra splits into two linear primes, giving (1,1), (1,1),
(1,2). These observations guide translation; they are not candidate tables.

Reusable pieces include integral-basis multiplication, prime-ideal HNF,
valuation, and embedding norm operations. Remaining source dependencies
include modular kernel/image/supplement/inverse operations, modular power
scheduling, the residual minimal-polynomial/root splitter, Kummer resultant
valuation, and scalar/exact-integer embedding-norm cases. Preserve full
`primedec_end` uniformizer/anti-uniformizer construction and sorting. The
inferred candidate sequence still needs a full-driver trace; do not report
these dependency probes as integrated execution.

### Earlier odd-prime checkpoint

`/tmp/sagejs-get-fs-small-tmDXL6/fixtures.json` records 5,146 exact matches
in CPython, generated JavaScript, GMP and tagged native execution. This includes
232 targeted controls and 4,914 supported catalog primes. The four fields
contribute 1,229, 1,228, 1,229 and 1,228 primes respectively. Each excludes
characteristic two; fields 1 and 3 additionally exclude their index divisors
3 and 37. Their independently checked equation-order indices are 1, 3, 1, 37.
There are also 340 CPython stable-sort controls, ten frontier controls and four
invalid-input controls; the latter fourteen pass in every execution mode.

The full native replay consumed 34.691276 CPU seconds, including compilation,
with peak child RSS 356180 KiB and a 4 GiB address-space cap. Generated core
SHA-256 is `dfee56ec68fc8571df3f0ec4c4a05b8d3863dbb63e1ae1223124eed726f855e3`;
loaded addon SHA-256 is
`1b46f87594d4f5d213d9d92e61b5e8e75e1782d018679045dbf56c44ff5ca0c8`.

The first connected native attempt failed during lowering because a sort
helper returned `None`, an unsupported native call boundary. Its buffered API
now returns the active count; the sorting work is unchanged. That failed run
(6.111755 CPU seconds) remains in the ledger. This adapts the explicit helper
ABI; it does not claim to have added general void-return compiler support.

Independent leaf tests cover 3,624 arithmetic cases, 327 quotient-power cases,
80 evaluation cases and short power tables. The power checker compares exact
square/multiply callback counts with pinned `gen_powu_i`, not just final
polynomials. Source review corrected monic normalization, low-zero square
prefixes, constant-modulus remainder, quotient-only arithmetic, empty-layer
processing, and small sorting dispatch before the final connected pass.

After final formatting, leaf qualification was rerun:
`/tmp/sagejs-flx-small-N9HDx9/fixtures.json` and
`/tmp/sagejs-flx-small-power-FNahVH/fixtures.json` (power checker).
The architecture gate again passes through native/WASM resource checks and
then fails at the existing stale optimizer-opportunity manifest, expected
input `2abcd76253ba21e539148ec7330d1647ab2712e9710970c27243835e5ef01825`
versus recorded `ba010bb412b1a3024c4c62aa0b1086bea2507388dd103943be53b07cb267cc55`.
The manifest was not regenerated to hide that failure.
`pnpm test:baselib:strict` passes with zero errors/warnings (403 configured
Pyright modules); the formatter checks all 1,044 Python files. The experimental
bench modules additionally run directly in CPython in the differential tests.

The additional source components copied for Kronecker, table sizing and sorting
were checked against the pristine archive and the checkout:

| Source | SHA-256 |
| --- | --- |
| `arith1.c` | `b8c6de3f34a02dc4a47516e30dd009d090ab9b9a2870fdfc2827f47a069d7265` |
| `RgX.c` | `1b42292ccf82fc0c50331df6e2851e821e40ac02d04f22e0256e12ba0d0650a6` |
| `bibli2.c` | `ad03adfa80ec125e41cfe435e7ee1ab1c160b2954c074fdd30eef7709ce66d4f` |

## Remaining full-path work

Characteristic two and index-divisor decomposition are still required to
generate a complete analytic prime catalog. Full selected prime descriptors
(including generators and tau) remain a separate dependency. Prime enumeration,
cache growth and source ordering must be composed with the analytic and
class-attempt drivers before claiming the declared `nfinit` preparation
boundary. Completing this producer alone does not complete the experiment.
