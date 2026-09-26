# Row 14 Gate-C reusable transaction storage

This experiment removes the continuation allocator boundary from the exact
row-14 `42 -> 802 -> 804 -> 805 -> 806` relation/HNF computation. It changes
neither the translated PARI 2.17.4 algorithms nor their native compiler
options. The four compiled collector, `hnfspec`, controller, and `hnfadd`
handles remain resident before the mathematical clock starts.

## Mechanism

The three nonempty `hnfadd` calls have authenticated input shapes:

```text
old HNF state                         appended columns
[3,10,792,4,7,105,0,802,0]                  2
[4,11,793,2,7,1,0,804,0]                    1
[2, 9,796,1,7,  3,0,805,0]                  1
```

The host computes the componentwise maximum of every owner shape once. It
creates one 14,146,540-byte envelope containing 110,205 logical elements: 32
packed `IntegerBuffer` owners and seven `Int64Buffer` owners. Before each
transaction it:

1. rejects any state/batch pair outside the three reviewed shapes;
2. checks every exact input prefix and every fixed capacity;
3. resets packed integers by clearing signed-size metadata and resets word
   owners in place;
4. copies only the live input prefixes into the retained owners; and
5. invokes the unchanged `pari_hnfadd` graph with the original scalar
   dimensions.

Clearing a packed integer's signed size makes its logical value exactly zero;
stale limbs are unreachable and are overwritten before becoming live. This
avoids both a full limb wipe and `Array(size).fill(0n)`. The seven continuation
controller calls similarly retain the collector's six existing typed owners
and add only one three-word control owner and one 799-word permutation owner.
No cross-call input/output aliases were introduced.

The old continuation constructed exactly 215 typed owners:

```text
7 controller passes * 14 owners       98
3 hnfadd passes * 39 owners          117
total                                215
```

The retained path constructs 41:

```text
controller owners constructed once     2
hnfadd owners constructed once         39
total                                  41
```

Thus it removes 174 owner constructions (80.9%) and all 96 scratch zero
Arrays. These counts exclude unchanged initial collector and `hnfspec` owners.

## Lightweight proof

`check_row14_gate_c_storage_reuse.cjs` poisons every physical owner, resets and
loads all three authentic shapes, and checks exact input prefixes and zero
scratch/tail semantics. It rejects 12 mutations: two unreviewed transaction
shapes, seven noncanonical input lengths, one undersized retained capacity,
one signed-word overflow, and one malformed controller owner. It performs no
authentic field computation.

## One capped authentic profile

The one authorized authentic profile is
`/tmp/row14-gate-c-storage-reuse-profile.json`, SHA-256
`9a72f9d2b1fd841a1315b20d92337a14eed8480df2f9f0d1258b0d1447725876`.
It ran with 4-GiB address-space/RSS limits and 600-second CPU/wall limits. Its
result digest remained
`1c669dd03269ef25e1c79e08c104f416062465380964515c6079902a96aacfef`,
including all four HNF checkpoints, the 806-column relation/log prefixes, final
relation state, and RNG. Maximum RSS was 914,200 KiB. The run explicitly
records four resident handles and zero compilation inside Gate C.

Measured Gate-C time was 28.143388883 seconds (28.555762071 seconds around the
JS call including result validation/publication immediately outside its
internal clock). Exclusive native roots totaled 19.421959958 seconds. The
retained continuation host work was:

```text
controller setup, seven passes          0.002166367 s
reset/load hnfadd, three passes          0.018343121 s
publish resident outputs                0.055929785 s
```

For context, the immediately preceding exclusive receipt
`/tmp/row14-relation-hnf-profile-resident.json`, SHA-256
`f9e7553cf68578433563558bc9cc8fcc0cc3a37e2da80a4796065fd9c20b841a`,
measured 0.026858264 seconds of controller setup and 6.704667657 seconds of
`hnfadd` materialization/allocation. The directly targeted host work therefore
fell from 6.731525921 to 0.020509488 seconds, about 328x. The old receipt still
placed 50.162306800 seconds of cached compile/lower inspection calls inside its
Gate-C clock; subtracting those measured calls gives 34.627156275 seconds,
versus the new true resident-handle 28.143388883 seconds. That 6.483767392-
second difference is diagnostic only, not an alternating performance ratio.

The remaining dominant work is now sharply separated: about 19.42 seconds in
the initial collector/`hnfspec` native roots and about 5.65 seconds constructing
their initial fixed owners. The continuation allocator is no longer a plausible
explanation for the PARI gap.

Reproduction:

```bash
node bench/pari-class-group-port/check_row14_gate_c_storage_reuse.cjs
node bench/pari-class-group-port/check_row14_gate_c_storage_reuse_profile.cjs
```

