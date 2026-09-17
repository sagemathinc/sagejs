# Live-owner bridge for the authentic `h = 1` cubic

## Result

`pari_live_h1_owner_bridge` removes the JSON/unit-fixture join between the
resident generated class candidate and two already translated suffixes. It is
one source-transparent native call which consumes the resident owners directly
and executes:

1. rank-two unit-lattice preparation from the seven accepted archimedean
   columns and the live `accept_relations` lattice;
2. the real pre-`getfu` LLL factor;
3. exact composition of the two-by-seven compact-unit provenance; and
4. equal-bound honesty plus transactional class-log `cleanarch` status from
   the live factor-base, HNF, and acceptance states.

For `x^3-20018*x+20034`, the bridge publishes:

```text
class number                 1
class invariant count       0
accepted relations          73
HNF rank                     8
KCZ = KCZ2                  48
unit rank                    2
compact factor count         7
cleaned class-log columns    7
getfu factor                 [1, 0; 0, 1]
compact provenance           [0,0,0,0,0,0,1; 0,0,0,0,0,1,-1]
public complete              false
```

No unit, class, relation, HNF, regulator, or status fixture is an input to the
bridge. No PARI oracle is an input. The focused checker uses the qualified
resident JSON only as a temporary stand-in for owners that the existing giant
resident entry already holds in memory. It does not read either unit fixture.
CPython, generated JavaScript, native GMP, and tagged native execution agree.

## Live ownership contract

The algorithmic inputs are prefixes of owners already produced by
`pari_resident_generated_class_attempt`:

```text
hnf_result_c[0:147]          accepted seven-field log columns
accept_relations[0:14]       rank-two relation lattice
accept_regulator[0:3]        accepted regulator
prep_base_state[0:7]         generated factor-base state
prep_state[0:8]              generated preparation state
hnf_state[0:9]               connected HNF state
accept_acceptance_state[0:3] analytic acceptance state
attempt_state[0:4]           terminal candidate state
class_number[0:1]            terminal class number
```

Everything else is caller-owned empty workspace or publication storage. The
first guard rejects any nonterminal/nontrivial candidate before touching the
compact or cleaned outputs. The 16-word bridge state records each connected
stage status and the final live dimensions.

This interface can be called at the bottom of the resident root without
packing, decoding, or hashing any intermediate state. The current checker does
not alter the 351-argument resident function because that shared entry is owned
by the integration lane; it establishes the executable edge needed for that
small integration change.

## Remaining final-root boundary

This closes the **compact flag-zero handoff**, not exact eager unit expansion.
At resident 192-bit precision the unit-lattice and pre-`getfu` factor are
complete, but exact algebraic `getfu` reconstruction still legitimately asks
for the known 2176/2240/2304-bit retry resources. The bridge therefore does not
claim expanded fundamental units, unit saturation, Phase 5 certification, or a
public completed class/unit result.

The next edge is now smaller and explicit:

```text
live compact provenance
  -> rebuild embeddings/logs at requested precision
  -> signed cubic getfu reconstruction
  -> exact resident relation-factor materialization
  -> internal final publication
```

The recent resident-derived factor-pool code proves that the last two exact
steps can avoid answer-derived factors. What remains for a truly single timed
root is the native precision rebuild and direct owner-to-owner call, not another
JSON composer.

Run the focused check with the qualified resident artifact:

```bash
node bench/pari-class-group-port/check_live_h1_owner_bridge.cjs \
  /tmp/sagejs-resident-generated-class-3qtnS5/output.json
```
