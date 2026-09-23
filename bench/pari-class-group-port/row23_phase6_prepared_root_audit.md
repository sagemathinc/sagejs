# Row 23 authenticated prepared-input aggregate

This cut extends the committed row-23 relation/HNF/analytic/unit aggregate to
the authentic prepared-number-field boundary. It accepts the normalized row-23
prepared field with authority digest
`0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299`.
It does **not** accept a factor-base owner, a relation owner, a final answer, or
any serialized intermediate.

## Native graph

`row23_phase6_prepared_factor_root.py` is the live translation of the existing
factor-base coordinator. In one private call graph it computes:

1. the complete 56-prime decomposition catalog through the 263 sentinel;
2. the maximal-order packet at the equation-index prime 131;
3. PARI's live `C1`, `C2`, `KC`, `KCZ`, `KCZ2`, and selected-prime product;
4. all 31 ordinary Kummer descriptors and their prime-ideal HNFs;
5. the 20 rational-prime groups and three-entry subfactor base; and
6. every packet, admission, permutation, and initial-base owner consumed by
   relation collection.

`row23_phase6_prepared_emitter.cjs` connects those live owners directly to the
already reviewed `pari_row23_phase6_aggregate_root`. In particular, relation
admission receives `factor_base_state[6]`, not a host-supplied selected-prime
product. The generated root proceeds through fresh relation collection, HNF,
analytic acceptance, rank-four unit reduction, `cleanarch`, `prepare_getfu`,
and exact unit reconstruction.

The generated public ABI contains authenticated prepared data, fixed scalar
configuration, and initially empty bounded capacities. It contains no retained
answer owner. The host proves that every non-prepared owner is empty immediately
before entering the clock.

## Boundary and result authority

Compilation, prepared-field authentication, allocation, reset, empty-owner
inspection, result projection, and replay are outside the clock. The measured
boundary is exactly one `pari_row23_phase6_prepared_root.gmp(...)` call.

The host brands both the resident lifecycle and its immutable result receipt
with transaction-local weak capabilities. Replay reprojects the live terminal
owners and compares them to the sealed result. A copied receipt has no replay
capability and is rejected. Live owners are non-enumerable and do not escape in
the public JSON receipt.

The executable check compares the live factor projection to the previously
reviewed factor authority by canonical digests for rational primes,
descriptors, ideals, norms, permutation, and subfactor. It also requires:

- factor state `KC=31`, `KCZ=KCZ2=20`, `C1=C2=123`;
- 40 accepted relations and terminal HNF state
  `[1,10,30,0,9,3,0,40,0]`;
- class group `Z/6Z`; and
- four exact units with norms `[-1,1,1,1]` and digest
  `2f8c5f4ce98e4ccdcfcdc9cd2fc8bbaac38949093eb4aa5484af2584be9850bc`.

## Validation

Source generation is deterministic. Node syntax checks and CPython parsing of
both ordinary Python sources pass. The combined ABI has 294 parameters: 85 in
the factor root and 243 in the prior aggregate, with mapped live owners shared
rather than duplicated.

The native build and complete executable check passed under the campaign's
4 GiB/600-second limits:

```bash
ulimit -v 4194304
timeout 600s node \
  bench/pari-class-group-port/check_row23_phase6_prepared_root.cjs
```

The successful cached rerun produced:

- cache key
  `6cb9423964c1254a7b3cbee8acee58eb0cf7b38e87daa71240b633f339d14d0b`;
- one-call kernel time **4.271016308 seconds** on the shared development host;
- 127,016,632 bytes of caller-owned storage;
- 51.106 seconds inclusive wall time, dominated by loading/checking the very
  large generated module and by outside-clock reset/projection work; and
- sampled peak descendant RSS 1,070,220 KiB.

This is a development diagnostic, not a quiet-host qualification timing. The
kernel time includes authentic factor-base construction, unlike the earlier
3.098-second relation/HNF/unit-only aggregate.

Persisted evidence:

```text
/scratch/row23-phase6-prepared-root-check-v1-20260918.json
sha256 6828b040a590c44e97756bf698ee5470db4d5a87f735df08b98e836bc5cd3266

/scratch/row23-phase6-prepared-root-check-v1-20260918.resource.txt
sha256 d1efd019b90fa8ca14569a268a3fa2c1cec704c351d5a8c980f6ce4faaca1183
```

The generated C core is 95,272,505 bytes with SHA-256
`615cf2075d244368275b9196d4e4097ad8dd0bc22c8eb5c4ddb0d56b1804c58a`.
The native addon is 14,879,520 bytes with SHA-256
`8b53c043729103ae41d7538e16c83abb1ec0214cac3a96b2c55b1d60fe03e661`.
The runtime receipt proves all six frozen factor-owner digests, the live PARI
bounds and selected-prime product, 40 accepted relations, `Z/6Z`, four exact
units, replay-capability enforcement, copied-receipt rejection, and complete
post-run erasure back to the prepared-data-only lifecycle.
