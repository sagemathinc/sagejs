# Row 23 index-prime descriptor and packet-HNF identity

This cut removes the first row-23-only degree-five dependency.  Starting from
the authenticated prepared maximal order for
`5.5.1002836007889.1`, `pari_row23_index_prime_packet` computes the complete
decomposition of the equation-order index prime 131.  It composes the existing
translations of PARI 2.17.4's `pradical`, quotient splitting, complementary
images, uniformizers, antiuniformizers, and descriptor ordering with a narrow
degree-five translation of `zk_multable` and `ZM_hnfmodprime`/`pr_hnf`.

The runtime boundary contains only the prepared maximal-order multiplication
tensor and authenticated embedding matrices.  No residue degree, prime
generator, descriptor, norm, or ideal HNF is supplied.  Descriptor and packet
outputs are staged in one private 12,600-entry workspace before publication.
The live result is:

```text
p = 131
three primes above p
e = 1, 1, 1
f = 1, 2, 2
descriptor image ranks = 4, 3, 3
norms = 131, 17161, 17161
```

`check_row23_index_prime_packet.cjs` authenticates the frozen prepared input,
pins the PARI 2.17.4 archive and relevant `base3.c`, `base4.c`, `bibli2.c`, and
`hnf_snf.c` sources, then builds an assertion-only C oracle against that exact
PARI build.  Every computed packet HNF and norm agrees exactly with
`idealprimedec`/`pr_hnf`.  The third computed uniformizer is intentionally a
different representative from PARI's current representative, so exact HNF
agreement is substantive ideal identity rather than byte equality of a chosen
generator.

CPython, JavaScript, native GMP, and native tagged executions agree exactly.
A short output-owner control is rejected before any caller-owned output is
mutated.  The receipt is written under `/scratch` and reports its native core,
source, descriptor, packet, oracle-source, and oracle-binary hashes.

Reproduce with:

```sh
node bench/pari-class-group-port/check_row23_index_prime_packet.cjs
```

This is a dependency/correctness result, not a qualified timing or completed
row-23 computation.  It proves the previously missing prime-131 maximal-order
descriptor and packet corridor.  Row 23 still requires complete live
factor-base production, 40-relation collection and HNF closure, the cyclic
order-six class witness, rank-four unit reconstruction, and neutral C7
publication.
