# Frozen panel row 8: authenticated accepted-retry owner

Status: the translated W0-to-accepted-candidate cut is connected and
authenticated. This is the first cut for the next required frozen sentinel; it
does not claim that C5, C6, C7, units, or final assembly are complete.

## Frozen identity and boundary

The field is frozen panel row 8:

```text
x^4 - 20018*x - 20034
generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363
```

The input starts with the authenticated maximal-order W0 export. The resident
retry computation additionally receives the already declared prepared factor
base and analytic inverse-`hR` boundary. It does not receive relation rows,
relation generators, HNF output, a regulator, retry actions, a class number, or
units. Before the translated call, relation/generator owners are zero and the
driver/result owners are poisoned with 77. The translated source computes the
retry decisions and all three relation prefixes.

The W0 authority digest is
`f36824d6417ced98e5d18529489801f687d61c78f9f9fdabb96d6d19099b0e01`.
The owner also binds the exact W0 export, collector, continuation, analytic,
pristine driver, enriched append trace, translated Python source, and pinned
PARI 2.17.4 source/archive digests.

## Computed result and pristine differential

The same translated Python call is run independently with pass limits one,
two, and three. It computes:

```text
relation counts: 150 -> 151 -> 152
actions:         RELAT -> RELAT -> accepted
status values:   -200 -> -200 -> 0
class number:    1
invariants:      []
regulator:       [5535521411280883888340490680131024664251778663230538321703, 192, 27]
```

Each computed relation-record, generator, and packed-log prefix is compared in
full with the independently instrumented pristine PARI 2.17.4 trace. All three
computed transformed-`C` prefixes are additionally packed directly from W0
events 466, 475, and 485 and compared cell for cell. The final rank-two
relation lattice is packed directly from W0 event 487 and compared cell for
cell. The terminal regulator is compared directly with W0 event 487's
`exactR` as well as the terminal result event. Reference
values are read only after a translated call has returned; they cannot select a
retry or fill a mathematical output.

The immutable production owner is:

```text
/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel8-authority/
  panel8-accepted-retry-b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591.json
```

It has mode `0444`, is 467,766 bytes, and has SHA-256
`b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591`.
Its retained exact terminal state contains:

- a `143 x 152` relation matrix (21,736 entries);
- 152 exact degree-four generators (608 entries);
- a `3 x 152` packed logarithm owner (3,192 seven-cell components);
- the matching 3-by-152 transformed-log owner;
- the `9 x 2` accepted relation lattice;
- exact retry, driver, outer-loop, and relation-owner states.

Publication is content-addressed, atomic, mode `0444`, and idempotent. An
existing path is reused only after its mode and digest are revalidated.

## Fail-closed checks

`check_panel8_accepted_retry_owner.cjs` runs the complete CPython source replay
twice, verifies byte-identical idempotent publication, and rejects mutations of:

- field identity and W0 ancestry;
- each retry count/status/action trace;
- relation records, generators, packed logarithms, transformed `C`, and the
  terminal relation lattice;
- class number and regulator;
- the pristine-terminal comparison latch;
- the supplied W0 digest, without publishing a file or leaving a temporary.

The focused check reports 16 rejected mutations. The replay's declared packed
owner estimate is 1,456,446,920 bytes, below the 2 GiB lane latch. Each replay
is bounded to 180 seconds, Node's heap is capped at 1536 MiB, and its source-only
assembly process uses the historical 4 GiB address-space guard. No native GMP
replay or job over the campaign's 600-second/4-GiB limits is performed here.

## Honest next edge

This owner closes only the existing relation/retry mathematics under the new
field-neutral immutable protocol. The next edge is to derive the panel-8 C5
state from this owner: `extract_full_lattice`, integer/floating LLL, and
`cleanarchunit`, reproducing the pristine `9 x 2 U`, `3 x 2 A`, empty `CU`, and
the same regulator. Exact eager unit expansion is deliberately not part of this
matched 192-bit flag-zero path.
