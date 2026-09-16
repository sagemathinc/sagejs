# Prime-descriptor ordering

The new `pari_prime_descriptor_sort(degrees,generators,n,count,order,diagnostic)`
returns a zero-based permutation for up to four descriptors over one rational
prime. Generators are contiguous signed integral n-vectors. The actual inert
generator `(p,0,...)` must be used, not its later admission-metadata placeholder.
`order` has at least count entries and `diagnostic` has at least two; owners
are disjoint and tails are unchanged. The return value is count.

This translates `bibli2.c:cmp_prime_over_p`, `ZV.c:ZV_cmp`, and the applicable
`bibli2.c:gen_sortspec` branches from PARI 2.17.4. It first compares residue
degrees, then generator coordinates lexicographically with signed comparison.
For counts 1/2/3 it follows the literal source comparison tree; four uses the
source two-plus-two merge. Count one retains the otherwise redundant source
self-comparison. Equal keys preserve original order.

The helper exposes the index-sort stage. The caller must gather **every**
descriptor owner in this order. That gather substitutes fixed-owner copies for
`sort_extract`'s deep generic copies, and is outside this helper. Polynomial
factor ordering is insufficient because basis conversion and uniformizer
correction can change descriptor order.

`check_prime_descriptor_sort.cjs` compares the permutation and exact comparator/
coordinate-comparison counts against extracted source. It covers 426 tiny
synthetic orderings (including duplicate keys, late-coordinate negative values
and a coordinate equal to `2^100`) and 33 permutations of actual Kummer
descriptor groups, including inert and corrected generators. Eight malformed
inputs test atomic preflight guards. CPython, generated JavaScript, native GMP
and tagged backends all pass under a metered 4 GiB address-space cap.

Final artifact: `/tmp/sagejs-descriptor-sort-LLSQgK/fixtures.json`.
Source SHA256:
`9cc52c71a9ef1cf50a5762ffaf24ddc8d3b55c473d32dcda76151cbab3c667d0`.
Core SHA256:
`5162b81e711c6a25d0177fcc411927c6e021769da36c0ae77c8dcb311a1a61c4`.
No timing or general prime-decomposition claim is made.
