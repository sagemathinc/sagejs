# Row-0 general supported-ideal maps

## Boundary

`row0_general_ideal_maps.py` supplies factor, reduce, and combine operations
for arbitrary canonical cubic integral/fractional ideals whose complete prime
support lies in the 66-prime factor base retained by the genuine row-0 run.
The input is not selected from a fixture table. The factor operation discovers
each valuation by exact lattice containment in successive prime-ideal powers,
checks the complete norm contribution, and reconstructs the input HNF.

The module does not call PARI. It reconstructs the integral-basis
multiplication tensor from the retained polynomial and integral basis, then
uses the generated native implementation of
`pari_cubic_ideal_hnf_multiply`. The orchestration remains ordinary
CPython-parseable source. The supported native corridor requires every cubic
HNF multiplication modulus and the fractional denominator to be below
`2**64`; an input outside that corridor is rejected.

Reduction uses the full same-run identity `U R V = D`. For row 0 all 66 Smith
diagonal factors are one, so every supported signed factor tape is replayed as
an exact signed combination of the 73 retained principal relations. The
returned witness identifies those relations, their exponents, and their exact
principal generators. Combine is signed tape addition followed by the same
exact replay.

## Independent checks

Run:

```bash
node bench/pari-class-group-port/check_row0_general_ideal_maps.cjs
node bench/pari-class-group-port/check_row0_class_unit_output_evidence_v2.cjs \
  /scratch/sagejs-row0-v2-current/row0-class-unit-result-dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58.json
```

The focused map check replays:

- all 66 retained prime ideals through factorization;
- two nonfixture integral products and their Smith witnesses;
- a supported nonintegral fractional ideal with a principal denominator;
- combine on independently factored inputs;
- an outside-support numerator and denominator rejection;
- mutations of both a factor-base ideal and the raw Smith right transform; and
- multiplication-tensor reconstruction and cubic ideal multiplication through
  generated native code, independently of the CPython fallback.

The stable focused receipt is:

```text
receiptSha256 = aef1c953c720bd1129fa9b967ba9d6c72f062a5702ff0634285b99f892342de1
contentSha256 = 24fc4daa60c6e7f57cc540f94fe40fdf6e30b2f54d915ebdf7610185a775af26
```

The corresponding final output-evidence check records:

```text
outputEvidenceSha256 = 7a4534762f5381e3634a2a452243b5f44bc1e89f8974f516be27c1925e4d6661
assessmentSha256 = 181080ba51f9724708514c666c0918aaabd9cb1fc8270f6d9fc18a929b8d9fc0
```

## Output-evidence status

The row-0 output-evidence-v2 adapter now publishes authenticated
`factor_map`, `reduce_map`, and `combine_map` materials and truthfully marks
phase 5 complete. It does **not** mark the entire public output boundary
complete. Two gaps remain:

1. `proved-factor-base-bound`: the retained independent analytic unit-index
   certificate explicitly does not prove that every ideal class admits this
   factor-base representation; the map therefore rejects rather than guesses
   outside its supported domain.
2. `public-api-integration`: these source-transparent maps are evidence-side
   capabilities, not yet wired into the public number-field ideal API.

Thus this closes the row-0 phase-5 map implementation without silently
claiming an unrestricted global ideal-factorization theorem.
