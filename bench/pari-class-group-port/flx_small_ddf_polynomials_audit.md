# Exposing the existing Shoup components

`pari_flx_small_ddf_polynomials` exposes the component polynomials previously
discarded by the degree-only translation. Its shared implementation retains
the original Frobenius, power-table, evaluation, GCD and quotient calls. The
legacy entry supplies disabled output offsets; only the new entry copies the
raw second-stage GCD and final `Tr` into output storage. In particular, it does
not normalize the second-stage GCD. Source: pinned PARI 2.17.4
`FpX_factor.c:Flx_ddf_Shoup` (GPL-2.0-or-later attribution in Python).

All offsets address one caller-owned `IntegerBuffer`: input 9 entries,
components 36, component degrees 4, scratch 272. These spans must be disjoint.
The input is canonical, nonzero, degree 0–4, over a caller-established odd prime
at most 3037000493. Signed defining-polynomial coefficients must first be
reduced as in the existing `get_fs` boundary. Degree-zero/one inputs still
compute Frobenius before returning, matching the upstream wrapper evaluation
order. Four constant-one output slots include padding beyond the source's
logical vector length (the returned input degree). No EDF is implemented here.

Validation on CPython, generated JavaScript, native GMP and tagged backends:

- 948 raw-component comparisons against extracted source, including every
  monic polynomial of degrees 0–4 over F3 and F5, four selected defining
  polynomials at 3/5/7/37, and nonmonic/large-prime controls. Nonsquarefree cases
  compare raw DDF behavior, not a claimed squarefree factorization.
- Eight malformed-input controls verify preflight failure without mutation.
- Existing `check_get_fs_small.cjs --native`: 260 cases, 340 sorting controls,
  ten unsupported and four invalid controls retain their previous behavior.

Final artifacts: `/tmp/sagejs-ddf-polynomials-bnhDBk/fixtures.json` and
`/tmp/sagejs-get-fs-small-WoxIIf/fixtures.json`. Candidate source hash:
`3be5116714ba8607be9b74158f5aeed3d1ece94a7a9899dc8b56652be1c993b7`.
The DDF generated core is 5,108,044 bytes; compilation and execution were
metered under a 4 GiB address-space cap. These are correctness/resource
receipts, not qualified timings or instruction-count equivalence claims.
Existing bounded arithmetic primitive mappings remain unchanged.
