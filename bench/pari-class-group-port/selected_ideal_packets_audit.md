# Selected ideal packet boundary

`pari_selected_ideal_packets` consumes a prepared maximal-order multiplication
table, full prime-descriptor catalog, and the zero-based selected indices from
translated `pari_prepared_initial_base`. It invokes the existing translated
`pari_prime_ideal_hnf` and derives each norm by exact multiplication of `p`,
`f` times. Selected packet order and row-major matrix layout are preserved.
It does not consume PARI ideal HNFs, ideal norms, or selected group answers.

The focused harness computes initial-base selection in CPython from the actual
prepared catalog and then exercises the connector on CPython, generated JS,
native GMP, and tagged. This is not a claim of one native call combining all
preparation. The subsequent collector integration described below invokes
these translated stages separately; it is not a single preparation closure.

Four declared tuning fields produce 66, 51, 143, and 288 active ideals. Empty,
one-ideal, and full-active prefixes match source `pr_hnf` and `pr_norm` exactly,
including untouched output tails. Invalid negative/out-of-range selected
indices leave scratch and output owners unchanged. Inputs/outputs must be
disjoint; this is a documented precondition, not a runtime alias detector.
Mathematical descriptor consistency/primality remains a prepared-input
precondition; failure inside a later HNF does not roll back earlier packets.

## Pattern versus descriptor catalogs

The diagnostic exports full descriptors for the primes already present in its
GRH cache, so a single concrete ordering supplies both selection and packet
construction. This is intentionally overprepared diagnostic input, not a
proposal to call `idealprimedec` for every analytic-bound prime in production.
PARI `get_fs` uses degree factorization when the rational prime does not divide
the equation index; full decomposition is needed there only for index divisors.
The analytic pattern catalog and selected-prime descriptor catalog are distinct
future preparation boundaries. This connector removes supplied HNF/norm
answers, not prime decomposition or maximal-order preparation.

## Qualification

Pinned PARI 2.17.4 archive and extracted `buch2.c` hashes are checked. The
source oracle calls actual GRH selection and FBgen, then directly iterates
`F.LV[F.FB[i]]` to obtain expected HNFs/norms. These are assertions only.

Initial harness failure: the first oracle incorrectly accessed `F.LP` directly
after FBgen, before later code constructs that flattened vector, causing a
PARI segmentation-fault diagnostic. It was corrected to iterate the initialized
LV groups; the failed run is retained in the CPU ledger (2.068779 seconds).

Corrected qualification: `/tmp/sagejs-selected-ideals-MmtVaF/fixtures.json`, all
four fields and all listed backends passed. Metered CPU 8.187804 seconds,
wall 7.614152 seconds, peak child RSS 235036 KiB, under a 4 GiB address-space
limit. These include oracle preparation/compilation and are not performance
measurements. No full collector native build was performed.

## Actual initial collector integration

`check_actual_initial_collector.cjs` now exports the raw multiplication table
and descriptor catalog, computes selection with translated `initial_base`,
and constructs the selected HNF/norm packets on each backend. Those actual
outputs feed subfactor selection and, outside policy-only mode, the collector.
PARI-selected ideal HNFs/norms are assertions only, never constructor inputs.
CP-only fixture exports retain the actual CPython-produced packets rather
than the host's initially empty buffers. The inspector still prepares selected
tau/e/f admission metadata and embedding arithmetic; these boundaries have
not been removed.

The same integration incorporates the translated subfactor-product policy
(`LOGD < 20`, exponential/square-root formula, clamp to 3, then cap by actual
initial-base C2). CPython/GMP/tagged compare exactly to the pinned source;
generated JavaScript allows four epsilon relative error for libm differences,
then requires the exact source permutation. On the two actual policy fields,
the product is exact on every backend (259 and 812 respectively).

Current policy qualification covers CPython, generated JS, GMP, and tagged:

- Field 1: 51 constructed packets, product 259, subfactor count 3;
  `/tmp/sagejs-actual-initial-collector-vRwzBH/fixtures.json`.
- Field 2: 143 constructed packets, product 812, subfactor count 4;
  `/tmp/sagejs-actual-initial-collector-W6mJxJ/fixtures.json`.

All packet entries, bad flags, and resulting permutations match PARI exactly.
These two runs cost 30.245576 and 17.454310 CPU seconds including small-graph
compilation; peak RSS was 298272 KiB. No full collector native rebuild or
timing comparison is included. Independent review by the integration agent
and subfactor-policy author found no blocker.

Full field-1 CPython collector/log/HNF replay on the final checker passed:
11 initialized relations, 58 collected relations, exact source generators,
weighted logs, H/D/B/C, and permutation. Receipt:
`/tmp/sagejs-actual-initial-collector-0nyMWA/fixtures.json`, 14.865147 CPU
seconds, peak RSS 173468 KiB. A separate assertion verified that this CP-only
fixture exports all 51 actual generated HNF/norm packets intact. An earlier
full CP replay also passed (14.923669 CPU seconds) before that fixture-export
fix; it is not used as the final export qualification. All runs used the 4 GiB
address-space cap and a 60-second process limit.
