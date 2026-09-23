# Connected uniformizer selection

`prime_uniformizer.py` translates PARI 2.17.4 `base2.c:uniformizer` with
prepared integral multiplication and embedding matrices, matrix-form P/V
ideals, and the source-selected embedding branch of init_norm. It connects
the inverse-image and embedding-norm dependencies without host callbacks.
It is not primedec_end or a complete prepared-nf class-group implementation.

The source schedule is retained: compute q=p^(f+1); solve the inverse image
of one in [P|V]; truncate to P coordinates; form and center the exact product;
test its norm; adjust the scalar coordinate; short-circuit the second test
when unramified; otherwise build the multiplication matrix of 1-u and try
P columns in ascending order. No extra norm call is made on the unramified
scalar-shift return. The source first multiplication-matrix column is copied
directly rather than routed through an extra basis-multiply helper.

Centering follows signed remii, including the negative half-modulus tie at
p=2. Ordinary Euclidean remainder followed by a positive-centered correction
would change that tie and the next candidate. Matrix-vector products retain
the first multiplication and subsequent zero-addition skips. Bigint powers
use literal exponents 2,3,4 in the current compiler corridor; backend primitive
instruction-count equality is not asserted. Packed copies explicitly replace
PARI shallow references.

All owners are disjoint. Output publication occurs only on success. State
keeps status -1 on exceptions, a completed norm-test count and the successful
branch. Diagnostic trace records only actually tested candidates, including
norm, grndtoi error and divisibility result. Source init_norm selection and
its resultant fallback are not implemented by this entry; the PARI oracle
records that all admitted cases actually select the embedding branch.

## Qualification

The literal-source oracle uses 34 noninert ideal cases from six number fields
and primes 2,3,5,37. It records 57 norm-tested candidates and exact returned
uniformizers. All candidates, norms, errors, decisions, final output and
same-source scratch agree in CPython, JavaScript, GMP and tagged execution.
Tests also preserve immutable input owners, sentinel tails and atomic short
storage errors. The source review checked centering, dot-product order,
short-circuit behavior, fallback order and workspace separation.

Final receipt: `/tmp/sagejs-prime-uniformizer-TCcANP/fixtures.json`.
Source SHA-256:
`3998abddb35763cb4ff33df07098d0af174911a00fe3dd3be01b6ce49fbafa8b`.
Core SHA-256:
`d0439ebf28bb2c452a04b4c4bfe71063f21b27ceaeca3b4e6b35eb7568e10908`.
The first-column schedule correction was made during an initial compile;
that initial receipt is superseded by this frozen-source replay. The corrected
compile/recorded check used 27.28 CPU seconds and 389520 KiB peak child RSS;
the final cached replay with CPython storage guards used 6.29 CPU seconds.
These are resource receipts, not paired runtime measurements.

Strict Python checks pass with zero errors/warnings (403 configured modules).
The architecture gate retains the pre-existing stale optimizer-manifest
failure, with no refresh or waiver. The earlier module-cache failure is not
claimed resolved by these focused tests.

The broader `pnpm test:changed -- --base HEAD` run exited 1 after 47.98
seconds. Its terminal output was lost across the session transition, so its
exact first failing test is not inferred from that receipt. A subsequent
metered `node test/module-cache.cjs` independently reproduces the existing
`ReferenceError: $ρσ$py$Any is not defined` in the generated shadow-module
`RealNumberBuffer = list[Any]` initialization (test line 218). That fixture
does not import the new uniformizer benchmark. The broad gate is not green.

Reproduce with the existing resource meter, one thread, 4 GiB address cap:

```sh
node bench/pari-class-group-port/check_prime_uniformizer.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

## Next connection

Complete prime descriptors still require antiuniformizer dependence,
multiplication matrix and ramification valuation. Kummer factor selection,
actual polynomial factors, resultant fallback and integration with the
class-group driver remain visible dependencies. No class-group timing parity
or broad completed nfinit-input path is claimed here.
