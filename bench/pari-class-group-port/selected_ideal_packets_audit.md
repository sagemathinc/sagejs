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
preparation. Integration into the existing collector remains separate; that
checker is owned by another lane and was not modified here.

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
