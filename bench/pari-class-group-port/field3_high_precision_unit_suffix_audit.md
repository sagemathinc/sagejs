# Field-3 high-precision unit suffix audit

## Claim

At integration commit `91bf2c937`, the hard mixed quartic

```text
x^4 - 2000022*x - 2000042
```

now has one independently regenerated, authentic relation-log column at
153,088 bits. The implementation authenticates the frozen complete relation
owner and initial integral-basis owner, observes that the first principal
generator is the source-recorded scalar `2`, and computes its weighted
signature `(2, 1)` logarithm as

```text
(log(2), log(2), 2*log(2))
```

using the qualified caller-owned packed `log(2)` graph. It consumes no
192-bit embedding, log, regulator, unit, or answer-derived transform.

This is intentionally **not** a claim that the accepted unit lattice,
regulator, or `getfu` result has been regenerated.

## Exact authority boundary

The checker reads these immutable artifacts and verifies their complete byte
hashes before translated execution:

- full 301-column live owner:
  `246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c`;
- initial collector and 64-cell multiplication-basis owner:
  `81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe`.

The native leaf additionally checks the defining polynomial, multiplication
by one in the exact four-element integral basis, all 26 scalar-prefix
generator shapes and metadata records, generator one equal to `2`, and its
first relation entry equal to `4`. These checks are mathematical/provenance
preconditions; the SHA-256 values are out-of-band artifact integrity, not
mathematical certificates.

PARI 2.17.4 is invoked once to freeze the exact packed `mplog2(153088)` input
boundary. No PARI call occurs after that boundary. The translated output
matches its 21-word packed relation-log column exactly.

## Result

The focused monitored run reported:

| item | result |
|---|---:|
| published columns | 1 of 301 |
| authenticated scalar prefix | 26 columns |
| packed scalar fields compared exactly | 6 |
| GMP run | 81,795.69 ms |
| total wall time | 87,169 ms |
| peak aggregate RSS | 2,112,088 KiB |
| generated core | 3,028,635 bytes |
| addon | 776,832 bytes |
| output SHA-256 | `a192d3498a7cd5026202b6d776bbb7ee177006ea0b37467955015c619eb8432a` |
| oracle trace SHA-256 | `f83fdde79054401a041908cd4e191ed1b8ac28f77386bc0157a87e200439f25b` |

The run stayed below the 3.5 GiB abort threshold and the ten-minute probe
limit. Undersized storage, a non-target precision, and a mutated polynomial
all reject before publication. The ordinary CPython fallback independently
passes the same fail-closed precision preflight; the multi-minute positive
calculation is exercised once through GMP.

## Exact stopping cut

The first column is the largest honest high-precision field-specific subset
available from the currently qualified primitive graph. Columns 2 through 26
are other rational primes, while columns 27 through 301 are non-scalar
algebraic generators. Closing them requires:

1. a high-precision mixed-quartic embedding rebuild from the exact defining
   polynomial and integral basis, including the complex conjugate pair;
2. the arbitrary-real/complex AGM logarithm branch above the current 384-bit
   non-AGM ceiling, then replay of 300 remaining principal-generator columns;
3. the exact same-run 301-by-13 accepted-column transform (3,913 integers), so
   regenerated raw logs can form the accepted `A` without importing an answer;
4. only then, integer/real lattice reduction, `cleanarchunit`, regulator
   comparison, and `getfu` at the rebuilt precision.

Consequently no accepted lattice or regulator can be derived from this one
column, and the checker records `acceptedLatticeDerived: false`. The result is
useful because it isolates the next genuine mathematical/compiler dependency:
the blocker is no longer the 153,088-bit packed storage corridor itself, but
quartic embeddings plus arbitrary AGM logarithms and exact transform
provenance.

## Reproduction

```bash
node bench/pari-class-group-port/check_field3_high_precision_unit_suffix.cjs
```

The checker enforces a 4 GiB address-space limit, kills the process tree above
3.5 GiB aggregate RSS, and kills probes exceeding ten minutes.
