# Live successful unequal-bound honesty

This cut closes the previously dishonest edge in the degree-five successful
`be_honest` experiment.  For performance-panel row 21,
`36 + 930*x - 305*x^2 - 90*x^3 + x^5`, the translated Sage-side graph now:

1. accepts only prepared number-field, factor-base, and ideal owners;
2. computes the degree-five modular rank, ranked LLL basis, transformed ideal,
   QR/enumeration state, candidate search, and smoothness admission;
3. returns each of the six collector observations; and
4. gives each live observation to the translated successful honesty scheduler,
   which consumes all six, performs the three source-required transient `KCZ`
   increments, and restores `KCZ` from 6 to 3.

The executable check is
`check_honesty_success_live_first_probe.cjs`.  It authenticates the PARI
2.17.4 release archive and pristine `buch2.c`, including the exact
`be_honest -> Fincke_Pohst_ideal` source edge.

## Independence boundary

The pristine-PARI exporter still computes a reference status for the outer
differential check.  The payload sent to Python deliberately contains only
`names`, six raw prepared inputs, and scheduler input owners.  It has no
`expectedStatuses`, `result`, or `branches` key.  PARI's reference status is
compared only after the Sage computation returns; neither the translated
collector nor scheduler can read it.

The first ideal and norm are not answer data.  They are the `pr_hnf` and
`pr_norm` inputs that PARI passes into `Fincke_Pohst_ideal`.  Likewise, the
factor-base decompositions and embedding matrices are prepared inputs.  The
candidate element, factorization, search-attempt count, and Boolean probe
observation are computed afresh by ordinary CPython-parseable translated
source.

## Evidence and remaining frontier

The checker proves that all six live Sage results equal pristine PARI's six
observations, that every ranked preparation reaches its full-rank degree-five
path, and that all caller-owned prepared inputs remain unchanged.  The exact
fresh candidate-attempt counts are `35, 157, 41, 1, 3, 23`; none is supplied as
input.  It also proves that scheduler progress is caused by the live results:
replacing the first observation with failure is rejected transactionally, with
unchanged scheduler and RNG owners.  Two malformed ranked-preparation mutations
(degree six and a short rounded-embedding owner) reject before publication.

This closes the selected successful unequal-bound path: six probes are
published and consumed, the RNG is unchanged as PARI requires for immediate
success, the scheduler terminates, and `KCZ` is restored exactly once.  It is
not a general-honesty claim.  Automorphism orbits and the failure/retry
arithmetic remain separate frontiers and are not required by this selected
success path.

Focused validation also runs the two source-identical native components.  The
six collector calls match under CPython, JavaScript-native, and GMP-native
execution, with collector transcript SHA-256
`4609694d72c788c258e9ed4c0beca46fbc6b539ded31623748468e7a1bddab92`.
The scheduler independently matches under CPython, JavaScript, GMP, and tagged
native execution.  The connected no-answer payload has transcript SHA-256
`72abc2ff0593473ec2b4988389e47c654f6c71eba6705a1e2fad9fe8e1393efe`.
