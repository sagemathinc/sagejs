# Connected noninert prime descriptors

`prime_descriptor.py` connects the translated PARI 2.17.4 uniformizer to
`get_pr`'s first dependence, antiuniformizer multiplication matrix and
conditional ramification valuation. One source-transparent native entry
publishes `[p,e,f,u...,tau...]` from prepared P/V subspaces and nf arithmetic
data. It does not receive a precomputed uniformizer or antiuniformizer.

This is the noninert matrix branch only. It still receives prepared P/V and
the source-selected embedding norm data; it is not full `idealprimedec`,
Kummer preparation, or an nfinit-input class-group engine.

## Source and storage correspondence

- `base2.c:get_pr`: first dependence of multiplication by u, then the exact
  multiplication matrix of the selected dependence t. Reduction is private
  to the modular dependence computation; the subsequent tau remains exact.
- `base3.c:ZC_nfvalrem`: the provisional descriptor has **e=0**, not e=1.
  Its every-sixteenth-iteration content stripping must still run even though
  the resulting count is multiplied by zero. No valuation is called when
  the discriminant is prime-to-p.
- The inherited valuation routine now computes quotient/remainder together,
  restores the truncating quotient sign, and stores that quotient before
  testing the remainder, matching `dvmdii`'s source order. This fixes an
  observable failing-scratch difference as well as avoiding separate
  quotient/remainder operations in that row loop. It is not a measured speedup.
- Owners remain disjoint. Workspace and embedding-value owners are reused
  only after their previous contents' final read. Source pointer swaps are
  still represented by packed copies in valuation, a documented storage-cost
  difference. Internal row-major tau is transposed on detached publication.
- Stage outputs may be partial after failure. The final descriptor is not
  touched until both stages succeed; publication retains ordinary scalar
  resource-failure semantics. Status becomes successful only after publication.

## Evidence

The pinned source oracle supplies 34 actual noninert ideal cases, 57 norm
tests and 12 valuation calls across six fields and primes 2,3,5,37. All four
execution modes (CPython, JavaScript, GMP and tagged) agree with PARI on
uniformizers, antiuniformizers, tau, e/f and norm decisions, and with each
other on all scratch. Ramification indices 1,2,3,4 occur. Immutable owners,
sentinel tails and short-final-storage guards pass.

Connected receipt: `/tmp/sagejs-connected-prime-descriptor-q9SkIc/fixtures.json`.
Source SHA-256:
`14a828e07ac632c27300d4043dfc35298d081c4816d2987613afb7c2ec05c01d`.
Core SHA-256:
`70396eb1c733d90c14b881c1c204dc7e38455dd229ad727f41270b1eb0de478c`.
The check used 30.40 CPU seconds and 382844 KiB peak child RSS under the
4 GiB address-space cap. These are qualification resources, not kernel timings.

The existing 406 element-valuation cases still agree in all execution modes.
Eight additional **synthetic source controls**, not claimed to be genuine
prime ideals, exercise provisional e=0, negative nonexact division and
periodic content stripping. With tau=I and p^17-scaled vectors, PARI and the
port return 16 for e=0 and 17 for e=1, for p=2 and p=3. The negative failed
first-row quotient is -1 and is published before return.
Receipt: `/tmp/sagejs-valuation-provisional-K3IMo6/fixtures.json`.
The oracle uses source `utoipos(0)` rather than canonical `gen_0` for the
provisional e field, because PARI's accessor reads its integer limb directly.

Reproduce using the existing meter and 4 GiB cap:

```sh
node bench/pari-class-group-port/check_connected_prime_descriptor.cjs PARI_DIR PARI_ARCHIVE
node bench/pari-class-group-port/check_prime_descriptor.cjs PARI_DIR PARI_ARCHIVE
node bench/pari-class-group-port/check_valuation_provisional.cjs PARI_DIR PARI_ARCHIVE
node bench/pari-class-group-port/check_compiled_valuation.cjs PARI_DIR
```

The broader gate remains subject to the independently reproduced module-cache
`Any` error and stale optimizer-manifest architecture failure recorded in the
uniformizer audit. Neither is waived or refreshed by this checkpoint.
The architecture gate was rerun and reports the same stale manifest. Direct
strict-library checking passes all 403 configured modules with zero errors or
warnings. A concurrent full strict command caught two still-in-progress lane
files before formatting; that failed run is retained in the resource ledger,
not relabeled as a success. The connected check is recorded through
`parallel:run` with the same source/core hashes.

## Next dependency priority

The next priority is the ordinary Kummer branch, not further tuning this
noninert matrix branch. Field 0 has equation-order index 1, so all its primes
take the Kummer route; 50 of 51 selected field-1 ideals also do. Required:
actual polynomial factors (not degree patterns), source random generation,
Kummer basis conversion and generator correction via modular resultant, then
index-divisor dispatch and final descriptor ordering. These remain explicit
dependencies before removing prepared descriptor packets from the class driver.
