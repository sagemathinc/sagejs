# Row 0 independent unit-index replay

Row 0 now has a detached analytic certificate for the two exact units retained
by the genuine fresh prepared transaction.  This is not an agreement check
against PARI.  Sage.js reconstructs the exact field and units, proves their
norms, recomputes their rigorous weighted-log regulator, independently computes
a Belabas--Friedman enclosure for the Dedekind-zeta log residue, and applies the
analytic class-number formula.

At 128-bit interval precision and zeta absolute error `1/8`, the computation
uses rational-prime threshold 63,738 and proves

```text
lower unit index = upper unit index = unique unit index = 1.
```

The focused checker writes the canonical certificate to a new process and
recomputes the complete regulator, zeta, and index proof there.  The detached
replay has no live analytic workspace.  Its exact units contain
hundreds-of-digit coefficients, so its canonical JSON is carried opaquely
through JavaScript; parsing those coefficients as JavaScript numbers would be
lossy.  SHA-256 binds those exact bytes at both certificate and row-0 evidence
layers.

## Logical scope

The analytic formula takes the phase-3 class number `1` as a premise.  The
focused output checker independently replays the full

```text
U [73,73] * R [73,66] * V [66,66] = D [73,66]
```

Smith identity and binds its three material digests into the unit certificate.
Thus the new computation is an independent exact unit-index replay, not a
claim derived from PARI's selected units or reported regulator.

The upstream factor-base generation theorem is still absent.  The certificate
records `factor_base_generation_proved=false`, and both the certificate and
output-v2 assessment record `public_class_unit_complete=false`.  Consequently
this closes phase 4 relative to the authenticated phase-3 presentation while
leaving `proved-factor-base-bound` as an explicit capability gap.  It does not
authorize the public completed class/unit API.

## Replay

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
node bench/pari-class-group-port/check_row0_unit_saturation_evidence.cjs \
  /path/to/row0-class-unit-result-dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58.json
```

The accepted focused receipt is:

```text
evidence SHA-256:    b6a22daf67c93cfba39be878f35629b2d397fc7e29820251238d6f3e06998c13
certificate SHA-256: 52d9bafe9aef8fe05bd73ff85c0d67aa91aee0255d1ab4e6b7b449a0a584736f
zeta threshold:      63738
index interval:      [1,1]
```

This is semantic validation only; it makes no qualified timing claim.
