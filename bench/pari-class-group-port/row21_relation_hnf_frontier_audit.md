# Row 21 relation/HNF frontier

Status: authentic initial-relation owner; exact executable blocker before the
small-norm collection and 32-column HNF.

`row21_relation_hnf_frontier.py` connects the immutable row-21 prepared
factor-base owner to PARI 2.17.4's `init_rel` translation.  It is ordinary
CPython-parseable Python compiled through Sage.js's normal source-transparent
native machinery.  The runtime boundary accepts only the content-authenticated
factor owner; it accepts no W0 relation, candidate, log, HNF, class-number,
regulator, or unit data.

The factor owner's selected `(p,e,f)` descriptors reconstruct all 15 active
rational-prime groups.  A group is complete exactly when the selected local
degrees sum to five.  The complete groups at 2, 3, 5, 11, and 13 produce the
five authentic rational relations.  The published state is:

```text
factor-base rows (KC)                24
active rational-prime groups        15
initial rational relations           5
target                              32
need                                27
missing after initialization        19
BNF_RELPID                           4
record reserve                     370
```

The checker makes two independent immutable publications before it opens W0.
Only then does it compare all five exact relation vectors, first-nonzero hints,
rational generators, origins, and automorphism tags with the frozen source
trace.

The full slice does not yet reach the 32-relation HNF.  The exact next blocker
is the admission condition in `unreduced_small_norm.py`:

```python
if n < 3 or n > 4 or construct_primes < 0 or construct_primes > 3:
    raise ValueError("invalid unreduced ideal packets")
```

Row 21 supplies `n = 5`, so the connected collector rejects before visiting
its already-computed ideal HNF packets.  This is narrower than the older audit:
`ideal_ranked_preparation.py` and its LLL selector now admit degree five, and
the authenticated row is expected to take the non-FLATTER path.  The next cut
must widen the collector admission and differentially execute the 27 accepted
candidates through `pari_hnfspec_complete`; deleting the guard alone is not an
HNF result.

Reproduce with an independently published factor owner:

```sh
node bench/pari-class-group-port/check_row21_relation_hnf_frontier.cjs \
  /scratch/row21-factor-owner.json.gz \
  /scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json
```

The factor owner must have SHA-256
`7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533`.
