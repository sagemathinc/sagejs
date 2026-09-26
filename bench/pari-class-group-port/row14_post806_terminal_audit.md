# Row-14 post-806 terminal lane

This lane begins at the immutable live relation owner
`row14-accepted-9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65.json.gz`.
It never invokes relation collection and does not read the frozen W0 trace.
The second authenticated input is factor metadata
`cca3c14630fc91a407a052bbc7fb2799b5e95bce79f1948fc422ca39cda07684`.

The host generates the quartic prime-degree catalog from the prepared
polynomial and the existing runtime-prime prefix ending at 10627.  The
translated analytic path independently selects residue bound 10626, processes
1295 primes, and computes inverse-`hR`; no inverse-`hR`, regulator, class
number, or invariant is an input.  The field identity retains its signed
discriminant.  Only the regulator-normalization boundary receives its absolute
value, matching PARI's `absi_shallow(nf_get_disc(nf))` source operation.

`pari_row14_post806_terminal` then preserves source order:

1. run the dimension/log and regulator acceptance path on live `H/C`;
2. authenticate the factor-base counters and dispatch honesty from
   `KCZ2 > KCZ` (the live equal-bound state skips it);
3. compute invariant-only Smith output from the accepted live presentation.

The resulting class number is 192 and the decreasing nonunit invariant factors
are `[24, 8]`.  The accepted rank-two integer relation lattice is retained as
14 column-major cells with SHA-256
`ac3b40e1d95edee9b8af61f2689a32a937945ed43b2a6112ec97f0783497aef8`.
This is intentionally not a full public class-group witness:
the terminal state and receipt keep full Smith transforms, mapped ideal
generators, and principal-relation witnesses false.  Those require the
separate retained-ancestry/witness lane.

The focused checker runs under both a 4 GiB address-space limit and 600-second
CPU/wall limits.  The successful run used 518016 KiB peak RSS and 15.219
seconds with cached native kernels.
