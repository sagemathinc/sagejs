# Row 14 Gate-C initial prepared storage profile

This diagnostic closes the initial-owner construction observation from the
row-14 Gate-C storage profile. It does not change the collector, `hnfspec`, or
continuation algorithms and is not timing-qualification evidence.

## Prepared boundary

`warmPreparedGateC({ profile: true, prepared, root })` authenticates the exact
prepared/root pair and constructs the collector and initial `hnfspec` typed
owners before the Gate-C clock. The retained envelope is bound to those owner
objects and the exact compiled handles and may be claimed exactly once.

The envelope contains 198 typed owners:

```text
component                  bytes       elements
collector             102,083,908      7,416,701
initial hnfspec     1,416,376,056     14,559,674
total               1,518,459,964     21,976,375
```

The `hnfspec` log input contains the exact 16,842-entry live prefix for 802
columns, three places, and seven words per real value. It does not retain the
collector's unused 153,468-entry log tail. At execution, the host clears the
retained HNF logical state and copies the exact relation, permutation, and log
prefixes produced by the collector. No initial typed owner is constructed
inside Gate C.

## Authentic capped diagnostic

The one authentic run produced
`/scratch/row14-gate-c-initial-storage-profile.json`, SHA-256
`623c59ca4b91428d8770c17951d4552c9288bf06b9498d0607b8550d3f1562ab`.
The receipt declares `qualification: false` and ran with 4-GiB address-space
and RSS limits, 600-second CPU and wall limits, and a 3-GiB Node old-space
limit. Maximum RSS was 940,328 KiB.

The full result digest is unchanged:

```text
1c669dd03269ef25e1c79e08c104f416062465380964515c6079902a96aacfef
```

That digest covers all four HNF checkpoints, the complete 806-column relation
and logarithm prefixes, the final relation state, and the prepared RNG. The
final relation state remained `[806,8110,0,0,806,806]`, and all eight authentic
collection passes completed.

The diagnostic Gate-C clock was 20.440127353 seconds. Its profile contains no
`initial.allocate-collector` or `initial.allocate-hnfspec` event. The sole
initial-storage host event inside Gate C was
`initial.reset-and-load-hnfspec`, at 0.054632918 seconds. For comparison, the
immediately preceding diagnostic attributed about 5.65 seconds to initial
typed-owner construction. This is a mechanism check, not a qualified speed
ratio: the shared host was not reserved, and the 165.215184288-second prepared
phase includes diagnostic compilation and owner preparation outside Gate C.

Reproduce the capped diagnostic with:

```bash
node bench/pari-class-group-port/check_row14_gate_c_initial_storage_profile.cjs
```
