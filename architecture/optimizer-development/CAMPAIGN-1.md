# Campaign 1: rectangular binary64 plotting dataflow

Campaign 1 is the first accepted Sage.js optimization-engine pilot. The
systematic audit selected a `compiler` intervention; that result was not fixed
in advance. Algorithm, mature-library, representation, runtime, boundary,
cache, and source alternatives were retained or rejected by the same evidence
rules.

## Selected intervention

- Public source: `src/lib/sagejs/plotting/field_layers.py`, fused outer region
  lines 920–952.
- Region identity:
  `sha256:1b888e5cc426630fb14cf3ad835f7db052bfcf2e566fdbf8844661f6032f39c9`.
- Compiler pass:
  `math.closed-transactional-rectangular-binary64-dataflow.v1`.
- Lowering:
  `v8.closed-transactional-rectangular-binary64-dataflow.v1`.
- Intervention: source-transparent compiler work with an untouched same-source
  fallback.
- Target boundary: resident V8 numbers and two transactionally private output
  arrays; no native/Wasm boundary and no copied input bytes.

The current generated dashboard is
`sha256:6853805f245450978a3aaf8ae322a9f74baceac21791ecf6a638e9988c6609a8`.
Its selected decision for the fused region is
`sha256:0edc45e028eec7c75d139767895347090c6958809f9f9b5d81b3ca08eefb5eab`.

## Accepted evidence

The checked-in receipt is
[`evidence/campaign-1-arrow.json`](evidence/campaign-1-arrow.json), with content
identity
`sha256:b8ebaefb14f85ff96d2b61990f13540d9ea42ee443a820c7f4fb741935e06188`
and file SHA-256
`588d2df47bce1e9cbaf96f720237a8fc41fecb1844ee3f6a8eca446b252809ea`.
It binds clean commit `08d1ef2bd2a9f3d9cc9473e78afc74b3cdcc7396`, its exact tree, and a current
successful build receipt.

Both arms compile the same current Python source under O2 in fresh evaluators.
The baseline disables only the selected pass; the candidate enables it. Both
bypass production and writable precompiled-module caches, so the experiment
does not compare two copies of the same cached JavaScript.

| Complete public consumer | Baseline median | Candidate median | Speedup | Worst paired saving |
| --- | ---: | ---: | ---: | ---: |
| Representative vector field | 739.850 ms | 449.183 ms | 1.647x | 29.86% |
| Held-out slope field | 690.896 ms | 502.362 ms | 1.375x | 20.39% |

Each consumer has 11 alternating ABBA/BAAB pairs, and all 22 paired differences
are positive. The independently recomputed campaign decision is `accepted`:
both consumers exceed the 10% complete-public-call threshold even at their
worst observed pair. Exact complete outputs and trace digests agree in every
pair.

The guard audit covers accepted input, `None` components, ragged grids, zero
magnitudes, all pivot branches, replacement of `math.hypot`, and transactional
failure without partial publication. Every guard miss returns to the untouched
source loop over the original live-ins.

Reproduce the standard receipt after a clean current build with:

```sh
pnpm build
node bench/optimizer-workloads/arrow-field-compiler-promotion.cjs \
  --output=/scratch/sagejs-campaign1/arrow-compiler-promotion.json
```

This is acceptance of the optimization campaign and its causal compiler
intervention. The global release promotion contract remains stricter: its
separate receipt still requires the declared four-platform and three-browser
authorities before making a universal production-deployment claim.

## What the campaign changed

The initial system was organized as a compiler-development engine. The audit
showed why that was too narrow: many attractive hotspots were actually mature
library-routing opportunities, algorithm boundaries, representation costs, or
runtime attribution artifacts. Several detached microkernels were dramatically
faster yet lost or became immaterial at the complete public boundary.

The version-one evidence flow now makes the intervention an explicit reviewed
object carried through opportunity, overlay, dossier, campaign, and promotion
documents. Classification does not imply action. Compiler work alone requires
current compiler decision IR and source-transparent route evidence; other
categories cannot manufacture those claims. The performance, oracle, negative
evidence, fallback, resource, platform, and conservative paired-measurement
gates remain shared.
