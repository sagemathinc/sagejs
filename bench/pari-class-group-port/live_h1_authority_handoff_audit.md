# Live-owner authority handoff for the composed `h = 1` root

The authentic cubic evidence previously existed, but downstream composition
reopened the qualified resident file and separately joined unit fixtures. That
is appropriate for detached audit tools, not for a single live composed root.
The root must be able to retain the exact owners it has just produced and hand
them forward before reusing its workspaces.

`live_h1_authority_handoff.py` provides that boundary. It accepts only live
owner sequences and an out-of-band generation authority. It performs no file
or fixture access.

## Retained logical owners

The immutable handoff copies:

- the cubic polynomial and 27-entry multiplication table;
- the complete `66 x 73` raw relation matrix;
- all 73 principal generators `alpha_j`, each with three integral-basis
  coordinates;
- the complete `73 x 73` sparse-cleanup column transform;
- the active `8 x 15` relation matrix; and
- the complete `15 x 15` active HNF transform.

It immediately composes and retains the resulting `7 x 73` map from each HNF
kernel column to the original principal generators. All seven map rows are
checked to cancel every one of the 66 factor-base exponents, while the first
seven active HNF-transform columns are independently checked to lie in the
kernel of the active relation matrix.

The handoff copies only logical prefixes. Its checker overwrites every source
workspace after capture and then reauthenticates and consumes the retained
owners successfully. This models exactly what the composed native root needs
before arena/workspace reuse.

## Freshness, diagnostic digest, and scope

The runtime boundary does **not** compare its live inputs with a frozen digest.
Doing so would make a regression artifact control an in-bound computation.
Instead it validates the owner shapes, run/generation freshness, and both
algebraic kernel identities, then computes and returns the live owner digest.

The external checker alone records the regression digest

```text
7eed284b9a90e00bb27feea24fbbed30b9d1a9196ce4bddc5ead5e854b0eb6e9
```

for the qualified evidence. It does not participate in capture or require
control flow. Runtime freshness is established by run id
`authentic-real-cubic-h1-p2304`, generation 1. Requiring the handoff again
recomputes its live digest and derived kernel map. It rejects stale
generations, post-capture owner changes, altered transforms, invalid relation
owners, and coordinated replacement of a derived map.

This is an internal handoff only. It preserves enough exact information for a
downstream root to reconstruct compact relation factors and unit products
without a file or fixture join. It does not prove unit saturation, does not
upgrade the upstream class-bound assumptions, and does not claim public
class-and-unit completion.

Run:

```bash
node bench/pari-class-group-port/check_live_h1_authority_handoff.cjs \
  /tmp/sagejs-resident-generated-class-3qtnS5/output.json
```
