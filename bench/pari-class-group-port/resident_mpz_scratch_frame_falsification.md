# Resident `mpz` scratch-frame campaign: rejected

This ledger records the bounded root-owned `mpz_t` scratch-frame experiment
against the frozen resident relation-to-HNF workload. The compiler prototype
was reverted. No compiler or mathematical source change is included here.

## Question and gate

The experiment asked whether repeated per-function GMP scratch initialization
and clearing dominates the real resident relation-to-HNF kernel. The prototype
gave `pari_connected_relation_hnf` a 4,096-slot root-owned frame, lazily
initialized slots at their first use, zeroed borrowed slots at each function
entry, and retained ordinary local scratch whenever root authority or capacity
was absent.

The acceptance gate was intentionally strong:

- at least 75% fewer honestly measured lifecycle sites or executions; and
- at least 3× faster real kernel CPU time.

Failure of either condition rejects the optimization.

## Correctness

The A/B used the frozen four-field fixture with SHA-256
`8d3b97b1320e31f9091fceb46e2167eb0dc0614cc697cf56ff6475e9547ac8f0`.
Five alternating samples per field produced 20 timed calls per variant. Class
outputs and the complete resident-buffer digest agreed on every call. The four
field digests are preserved in the adjacent JSON ledger.

The minimal compiler probe also covered public checked fallback, recursive
helpers, fresh frames for nested roots, zeroing on acquisition, and ordinary
local fallback when a deliberately undersized frame was exhausted. That probe
passed before the implementation was reverted.

## Result

| Metric | Baseline | Scratch frame | Ratio/delta |
|---|---:|---:|---:|
| CPU ms/call | 2,091.899 | 1,982.010 | **1.055×** |
| Wall ms/call | 2,230.697 | 2,096.834 | 1.064× |
| Generated core bytes | 45,610,040 | 45,712,151 | +102,111 |
| Native addon bytes | 7,281,376 | 7,453,480 | +172,104 |
| Lexical `mpz_init` sites, whole core | 2,588 | 2,787 | +199 |
| Lexical `mpz_clear` sites, whole core | 5,161 | 5,163 | +2 |

The framed source retains ordinary fallback branches, so lexical site counts
are not a dynamic lifecycle measurement. Because the independent CPU gate
failed by nearly a factor of three, a lifecycle interposer campaign was not
continued and the lifecycle gate is explicitly unqualified—not silently
claimed as passing.

Resident owner storage was identical by construction: 202 owners per field,
15.2–16.1 MB logical live bytes, and 452–481 MB fixed-capacity live bytes. The
alternating same-process run ended at 680,280,064 RSS bytes; this is not a
qualified per-variant RSS delta.

## Conclusion

The hypothesis is falsified for this graph. Correct root-owned scratch reuse
removes some lifecycle work, but improves real CPU time by only about 5.5%, far
short of the required 3×. Per-function `mpz_init`/`mpz_clear` churn is therefore
not the dominant cause of the remaining relation-to-HNF performance gap.

The next compiler campaign should target work demonstrated inside the hot
kernel—particularly repeated exact-buffer conversion/copy traffic or arithmetic
representation—rather than generalizing this scratch-frame mechanism.

Machine-readable provenance, artifact hashes, owner sizes, and the exact gate
decision are in
`resident-mpz-scratch-frame-falsification-20260917.json`.
