# Prime descriptor dependencies after quotient splitting

The next preparation boundary is `base2.c:primedec_end`, not another class
group algorithm. Its source builds complementary ideal images with get_LV,
selects uniformizers using inverse images and norm tests, then constructs
antiuniformizers and valuations. Actual polynomial factorization and Kummer
selection/removal remain separate prerequisites for full primedec_aux.

## Complementary ideal spaces

`prime_complements.py` translates get_LV's prefix/suffix intersections for
matrix-form ideal inputs. Source NULL is represented by rank -1, not by an
empty subspace. Its identity branches preserve signed original columns;
actual intersections return reduced columns. Single-ideal input returns the
identity without preparing any prefix/suffix workspace. Packed copies replace
shallow GEN aliases explicitly. Kummer descriptors' Fp_basis/pr_hnf conversion
is not implemented by this entry.

`small_prime_matrix_intersection.py` follows FpM_intersect_i's word-prime
dispatch: both inputs convert to Flm, including at 2 and 3; Flm kernel of
their concatenation is truncated to the first input coordinates, then
multiplied by that input. Reusing the FpM kernel dispatcher would incorrectly
select binary/ternary algorithms. A reusable explicit Flm Gaussian helper
also supports the following inverse-image dependency.

The matrix component passes 1,620 cases across PARI, CPython, JavaScript,
GMP and tagged execution, including signed/empty inputs and eight columns:
`/tmp/sagejs-small-prime-intersection-h5QfIE/fixtures.json`.
The connected prefix/suffix entry passes 30 cases in all four port modes:
`/tmp/sagejs-prime-complements-qjA5rB/fixtures.json`.
These include 24 actual radical-split field/prime cases and six explicitly
synthetic coordinate-hyperplane cases of the split algebra Fp^4 at 2,3,37.
The synthetic controls exercise four-ideal work, not additional number fields.
Exact A/B/LV matrices, ranks, original inputs, owner tails and guard atomicity
are checked. The test requires all ideal counts 1,2,3,4. Independent source
review found no blocker in the schedule, sentinel semantics or workspace.

Complement core SHA-256:
`8f6b876fd8b2305949b1a00557f2d7c9dd92f91c2b907650240cab282eace58e`.
Its compilation and replay used 9.15 CPU seconds, peak child RSS 238912 KiB,
under the unchanged 4 GiB address cap. These are qualification resource
measurements, not paired speed evidence.

## Norm representation frontier

Uniformizer norm tests use get_norm's error threshold -5, not factorgen's
-32 threshold. Prepared embedding rows already represent exact integers by
precision -1, but the old prepared norm rejects them. The new separate
embedding-only get_norm entry evaluates every row first, then preserves
embed_norm's first-entry integer shortcut. It does not silently round exact
scalar zero/one into real numbers. The source init_norm selection and
resultant fallback remain outside that entry; an oracle separately reports
the real branch decision for each fixture.

The first native compile exposed a known bounded-integer IR limitation:
power requires a literal exponent. For the declared degree-three/four
corridor, two explicit power literals preserve the requested bigint primitive;
they do not claim identical backend multiplication schedules. A general
variable-exponent compiler extension is not hidden in this checkpoint.

Final norm receipt `/tmp/sagejs-prime-embedding-norm-qKuLdF/fixtures.json`
passes 119 cases in CPython/JavaScript/GMP/tagged. Of these, 116 use actual
nfinit matrices (all independently satisfy init_norm's embedding criterion),
including 48 exact-first-entry shortcuts. Three explicitly synthetic diagonal
matrices test rounding errors -4, -5 and -6: the first raises the source
precision error and the other two succeed. These are threshold tests, not
additional number fields. The oracle catches PARI's actual e_PREC exception.
The checker compares every computed embedding triple and all output tails,
including scratch on rejection, plus input and preflight-guard preservation.
Core SHA-256:
`9a3a167bb2b8197e6af9f6e8dc544cccdc16b1407b0888555010642f31b14c8c`.
Initial successful native compile/replay used 11.56 CPU seconds and peak
248988 KiB RSS; final cached replay used 3.22 CPU seconds.

## Reproduction and remaining work

The inverse-image bridge retains F2 only at p=2 and direct Flm for odd
primes, including 3. Its augmented kernel selects the last basis vector and
scales by the inverse of its negated final coordinate. Gaussian support is
extended from seven to eight columns, while rows remain at most seven:
PARI's Flm CUP dispatcher requires both dimensions at least eight; binary
and ternary source branches have no corresponding size switch here. This
extends explicit port coverage without changing upstream math or the 4 GiB
process cap. The old eight-column rejection tests move to nine columns and
positive eight-column cases are added. It includes the three actual quartic
systems that the narrower wrapper initially excluded.

Final stable-build inverse-image qualification passes 2,751 cases across
PARI/CPython/JavaScript/GMP/tagged, including all 38 ideal systems from the
actual fixtures with no exclusions and 686 no-solution controls:
`/tmp/sagejs-small-prime-invimage-ikg7fT/fixtures.json`.
Core SHA-256:
`2c0e7b29d722911df8486b97c5875196a4480461f91364a61415c0835c485d82`.
The shared full-kernel/first-dependence regression passes 2,177 cases including
480 new eight-column controls, with exact partial matrices and output guards:
`/tmp/sagejs-small-prime-kernel-J3omxX/fixtures.json`.
Core SHA-256:
`e668771bcbf107aad5e51deafbb0d0cc5afd3bad2b5b340a29560ef7ef6f9196`.
Those final checks consumed 11.83 and 10.75 CPU seconds respectively under
4 GiB. Inverse-image output is the actual source-selected solution, not only
an independently valid solution of the same system.

## Build qualification

The changed-file gate selected merge and documentation checks and triggered
a full rebuild, which completed successfully in 7m38s. Two overlapping
component invocations failed while loading transient compiler artifacts
(`assignedNames` instanceof); they were not mathematical disagreements.
After build completion, both components were requalified on stable artifacts:
complements `/tmp/sagejs-prime-complements-3GJ316/fixtures.json` and norm
`/tmp/sagejs-prime-embedding-norm-fP6TES/fixtures.json`, with unchanged core
hashes. The failed invocations remain in the ledger and task receipts.
The architecture gate still reports the pre-existing stale optimizer manifest;
it was not refreshed or waived.
Strict Python checks pass (403 configured modules, zero errors/warnings).
A separate post-build module-cache regression still fails at the existing
`$ρσ$py$Any is not defined` error; the successful build/docs gate does not
resolve it or qualify the complete portable suite.

Use the existing meter_command.py wrapper, one thread and 4 GiB address cap:

```sh
node bench/pari-class-group-port/check_prime_complements.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
node bench/pari-class-group-port/check_prime_embedding_norm.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

These components are not yet a uniformizer or complete prime descriptor.
Remaining connected work includes inverse-image solve, centered products,
norm-tested candidate schedule, antiuniformizer, valuation and Kummer branch.
No full prepared-nf class-group completion, new timing parity or public
verified result status is claimed.
