# Phase 1 development-ladder audit

This is an identity and existing-evidence audit at integration commit
`dc534fa05e68c330871fd3720718bdfa7c03e8db`. It performs no timing, build, or
new PARI execution. In particular, field metadata is never treated as proof
that a source branch ran.

## Frozen population

`phase1-development-ladder.json` freezes the four sentinels and twelve
additional development fields already selected by
`class-unit-qualification-manifest.json`. The deterministic rule is:

1. the already-exercised real cubic (panel row 0);
2. the already-exercised mixed quartic (row 8);
3. the first remaining tuning row with a known nontrivial class group (row 1);
4. the remaining tuning row with maximum known class number, ties by field ID
   (row 14);
5. all remaining tuning rows retain panel order as additional development
   fields.

The checker independently recomputes steps 3--5. Each selected identity and
polynomial hash is compared with the frozen panel and the earlier qualification
manifest. The 24-row panel remains byte-identical at SHA256
`7c6515240940db971cff3bc28819f9e6547adae9305643b0f6274eeafe6ec3a5`;
the eight final-reserve rows remain closed.

The oracle identity is pristine PARI 2.17.4: archive SHA256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`
and `pari-2.17.4/src/basemath/buch2.c` SHA256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

## Existing trace evidence

The tracked pristine-source driver checker has selectors for only four of the
sixteen development identities:

| selector | panel row | role | field |
| --- | ---: | --- | --- |
| `--field0` | 0 | sentinel | `x^3-20018*x+20034` |
| `--field1` | 1 | sentinel | `x^3-20010*x+20018` |
| `--field2` | 8 | sentinel | `x^4-20018*x-20034` |
| `--field3` | 10 | additional | `x^4-2000022*x-2000042` |

Thus existing evidence covers 4/16 identities. There is no tracked default
driver trace for rows 3, 4, 6, 11, 13, 14, 16, 18, 19, 20, 21, or 23. Phase
1's requirement to trace all sixteen candidates before implementation is not
satisfied. In particular, sentinel row 14 was selected by its class number;
the current evidence does **not** prove that it exercises retry, precision, or
honesty work.

## Branch coverage audit

| required behavior | performance-population evidence | finding |
| --- | --- | --- |
| nonempty `W` | row 10 (`--field3`) | observed; the quartic retry retains nonempty append transactions |
| rank deficiency | rows 8 and 10 | observed; row 8 has an index-two unit-lattice shortage and row 10 begins with two missing ideal rows |
| random relations | none | absent; all four traces avoid `rnd_rel` and factor-base enlargement |
| precision escalation | none | absent; all four traces remain at 192 bits and avoid precision rebuild |
| honesty | none | absent from the performance population; the default first endpoint has equal bounds |

The unequal-bound `honesty_branch_fixture.json` is useful but deliberately
correctness-only. It records 51 failed no-cache probes and 50
`random_bits(4)` retry-ideal sequences. Those random draws are **not** PARI's
`rnd_rel` branch. The fixture also stops on failure and therefore does not
cover a successful full honesty scheduler, automorphism orbit selection,
conditional ideal reduction, or the complete temporary-`KCZ`
mutation/restoration lifecycle.

The manifest consequently predeclares three correctness-only requirements:
an actual `rnd_rel` trace, a precision-rebuild trace, and a successful full
honesty trace. They are not performance inputs and may not replace or enlarge
the frozen 24-field panel.

## Reproduction

Run the read-only checker from the repository root:

```sh
node bench/pari-class-group-port/check_phase1_development_ladder.cjs
```

It hashes all frozen inputs and cited evidence, rederives the selection,
cross-checks all identities, verifies the pristine PARI pins embedded in the
existing driver evidence, and rejects any claim that the partial honesty
fixture supplies random-relation coverage.
