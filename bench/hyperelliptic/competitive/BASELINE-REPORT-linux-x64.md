# Frozen Phase-0 competitive hyperelliptic baseline

Generated from `/home/user/sagejs/bench/hyperelliptic/competitive/baseline-receipt-linux-x64.json` (2026-08-23T05:45:06.318Z).

Source commit: `a66abc5694fa7dced52f1e4ddd2eef892e446afd`. Corpus: `f58ce393bd5070b0606a919a5132af79e4fd4f4cfab893fc6e42c8e5d9defd2a` (28 acceptance cases).

> This is the before-performance baseline. It is not the final acceptance receipt; rerun the identical harness at the final integrated performance SHA for the after comparison.

Host: cocalc-vm-51c5044ca6d3406d983e0f10, x64 linux, AMD EPYC 7B13, Node v22.22.2.

> Times are median ± MAD in milliseconds. “Loop/item” is a serial repeated warm loop, not a packed batch. A cache hit is never labeled warm arithmetic. Unsupported and unavailable cells are retained.

| Case | Backend | Status | Object cold wall | Object cold CPU | Warm wall | Warm CPU | Warm mode | Loop/item wall | Loop/item CPU | Exact digest | Notes |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|
| g2-p13-add-coprime | sagejs | ok | 13.07 ± 1.42 | 13.05 ± 1.42 | 5.91 ± 0.1125 | 5.89 ± 0.0942 | warm-arithmetic | 3.84 ± 0.0503 | 3.84 ± 0.0503 | `2ef2ecec534e…` | — |
| g2-p13-double | sagejs | ok | 7.36 ± 0.1221 | 7.34 ± 0.1204 | 3.26 ± 0.0203 | 3.24 ± 0.0353 | warm-arithmetic | 2.78 ± 0.0105 | 2.78 ± 0.0105 | `09674064d70d…` | — |
| g2-p13-scalar-256 | sagejs | ok | 674.11 ± 5.63 | 674.08 ± 5.65 | 658.70 ± 1.36 | 658.66 ± 1.34 | warm-arithmetic | 662.99 ± 0.6170 | 662.96 ± 0.6335 | `e9713735b8ce…` | — |
| g2-p13-general-h-shared-factor | sagejs | ok | 6.90 ± 0.0772 | 6.88 ± 0.0751 | 3.61 ± 0.0303 | 3.59 ± 0.0296 | warm-arithmetic | 3.19 ± 0.0154 | 3.19 ± 0.0154 | `99b09d0ab83d…` | — |
| g2-p13-conjugate-cancellation | sagejs | ok | 4.94 ± 0.0765 | 4.92 ± 0.0777 | 1.91 ± 0.0188 | 1.89 ± 0.0176 | warm-arithmetic | 1.66 ± 0.0112 | 1.66 ± 0.0111 | `a7f15699bd21…` | — |
| g2-p13-degree0-validate | sagejs | ok | 1.98 ± 0.0346 | 1.96 ± 0.0348 | 0.1006 ± 0.0186 | 0.0865 ± 0.0181 | warm-arithmetic | 0.0010 ± 0.0001 | 0.0010 ± 0.0001 | `a7f15699bd21…` | — |
| g3-p5-degree3-validate | sagejs | ok | 2.29 ± 0.0219 | 2.27 ± 0.0217 | 0.1309 ± 0.0122 | 0.1175 ± 0.0141 | warm-arithmetic | 0.0011 ± 0.0001 | 0.0011 ± 0.0001 | `a0260df28834…` | — |
| g3-p5-double | sagejs | ok | 4.33 ± 0.0613 | 4.31 ± 0.0629 | 2.24 ± 0.0155 | 2.21 ± 0.0103 | warm-arithmetic | 1.92 ± 0.0280 | 1.92 ± 0.0280 | `f912beca55ec…` | — |
| g3-p5-scalar-1024 | sagejs | ok | 3344.23 ± 12.40 | 3344.20 ± 12.41 | 3337.67 ± 7.68 | 3337.64 ± 7.68 | warm-arithmetic | 3315.74 ± 12.24 | 3315.71 ± 12.24 | `a0260df28834…` | — |
| g3-p5-scalar-64-native | sagejs | ok | 4.72 ± 0.2587 | 4.70 ± 0.2596 | 2.05 ± 0.0346 | 2.03 ± 0.0353 | warm-arithmetic | 2.22 ± 0.2241 | 2.21 ± 0.2391 | `e1ac63614965…` | — |
| g3-p5-scalar-64-reference | sagejs | ok | 414.67 ± 0.2389 | 414.62 ± 0.2615 | 393.91 ± 2.71 | 393.89 ± 2.71 | warm-arithmetic | 395.15 ± 1.65 | 395.12 ± 1.65 | `e1ac63614965…` | — |
| g2-p5-group-rank2 | sagejs | ok | 938.15 ± 6.65 | 938.11 ± 6.63 | 0.2408 ± 0.0308 | 0.2258 ± 0.0293 | cache-hit | 0.2170 ± 0.0074 | 0.2034 ± 0.0074 | `6a0697e30112…` | — |
| g3-p13-group-cyclic | sagejs | ok | 815.01 ± 2.39 | 814.99 ± 2.39 | 0.2222 ± 0.0184 | 0.2072 ± 0.0181 | cache-hit | 0.2344 ± 0.0134 | 0.2100 ± 0.0041 | `cc8eccc094f5…` | — |
| g3-p19-group-cyclic | sagejs | ok | 2310.13 ± 35.27 | 2310.11 ± 35.28 | 0.2079 ± 0.0043 | 0.1931 ± 0.0036 | cache-hit | 0.2046 ± 0.0017 | 0.1907 ± 0.0021 | `cff5cedb61f5…` | — |
| g2-p11-local-factor | sagejs | ok | 2.37 ± 0.0451 | 2.35 ± 0.0460 | 0.7627 ± 0.0429 | 0.7458 ± 0.0420 | warm-arithmetic | 0.4955 ± 0.0249 | 0.4955 ± 0.0249 | `6d893c0d3152…` | — |
| g3-p7-local-factor | sagejs | ok | 121.88 ± 0.4311 | 121.83 ± 0.4568 | 0.7560 ± 0.0427 | 0.7386 ± 0.0412 | warm-arithmetic | 0.7639 ± 0.0584 | 0.7479 ± 0.0691 | `89089dd96b9c…` | — |
| g2-p5-even-local-factor | sagejs | ok | 2.29 ± 0.0272 | 2.27 ± 0.0286 | 0.7679 ± 0.0169 | 0.7482 ± 0.0470 | warm-arithmetic | 0.4755 ± 0.0014 | 0.4754 ± 0.0013 | `ef846163660a…` | — |
| g3-p5-even-local-factor | sagejs | ok | 53.14 ± 1.87 | 53.12 ± 1.87 | 0.7374 ± 0.0346 | 0.7210 ± 0.0336 | warm-arithmetic | 0.7215 ± 0.0143 | 0.7057 ± 0.0353 | `2c1256046956…` | — |
| g2-global-reduction | sagejs | ok | 130.02 ± 4.00 | 130.00 ± 4.01 | 0.1934 ± 0.0572 | 0.1791 ± 0.0505 | cache-hit | 0.1385 ± 0.0145 | 0.1142 ± 0.0036 | `8b2fbc8a4213…` | — |
| g2-qq-general-h-shared-factor | sagejs | ok | 11.68 ± 0.4759 | 11.66 ± 0.4773 | 6.27 ± 0.0234 | 6.24 ± 0.0200 | warm-arithmetic | 4.74 ± 0.0423 | 4.74 ± 0.0423 | `5f8e42de746b…` | — |
| g2-real-period-64 | sagejs | ok | 26.36 ± 0.3707 | 26.34 ± 0.9189 | 859.65 ± 1.31 | 859.60 ± 1.29 | cache-hit | 859.19 ± 2.11 | 859.17 ± 2.11 | — | — |
| g2-central-value-32 | sagejs | ok | 182.27 ± 3.75 | 182.25 ± 3.75 | 3.10 ± 0.2127 | 3.08 ± 0.1976 | cache-hit | 3.11 ± 0.1152 | 3.09 ± 0.1111 | — | — |
| g2-lfunction-init-32-order4 | sagejs | ok | 176.61 ± 0.9682 | 176.56 ± 0.9913 | 5.21 ± 0.0908 | 5.20 ± 0.0911 | prepared-curve-init | 5.17 ± 0.1383 | 5.15 ± 0.1535 | — | — |
| g3-real-period-64 | sagejs | ok | 35.08 ± 0.4351 | 35.06 ± 0.4361 | 1322.01 ± 0.1805 | 1321.99 ± 0.1829 | cache-hit | 1311.10 ± 6.12 | 1311.07 ± 6.12 | — | — |
| g3-central-value-16 | sagejs | ok | 1671.64 ± 26.76 | 1671.62 ± 26.76 | 2.65 ± 0.0408 | 2.62 ± 0.0238 | cache-hit | 2.74 ± 0.0513 | 2.72 ± 0.0255 | — | — |
| unsupported-characteristic-2-jacobian | sagejs | ok | 0.6478 ± 0.0000 | 0.6616 ± 0.0000 | — | — | not-applicable | — | — | `a588afe1d1f1…` | — |
| unsupported-even-degree-jacobian | sagejs | ok | 0.5124 ± 0.0000 | 0.5240 ± 0.0000 | — | — | not-applicable | — | — | `693f27ced8b6…` | — |
| unsupported-wild-p2-global | sagejs | ok | 3.55 ± 0.0000 | 3.56 ± 0.0000 | — | — | not-applicable | — | — | `4cdeb2cf7d0f…` | — |
| g2-p13-add-coprime | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-double | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-scalar-256 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-general-h-shared-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-conjugate-cancellation | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-degree0-validate | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-degree3-validate | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-double | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-scalar-1024 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-scalar-64-native | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-scalar-64-reference | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p5-group-rank2 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p13-group-cyclic | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p19-group-cyclic | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p11-local-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p7-local-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p5-even-local-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-p5-even-local-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-global-reduction | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-qq-general-h-shared-factor | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-real-period-64 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-central-value-32 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-lfunction-init-32-order4 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-real-period-64 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g3-central-value-16 | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| unsupported-characteristic-2-jacobian | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| unsupported-even-degree-jacobian | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| unsupported-wild-p2-global | standalone | unsupported | — | — | — | — | — | — | — | — | standalone: no general public Cantor/period/L-function standalone core exists yet; packed smalljac is measured separately |
| g2-p13-add-coprime | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-double | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-scalar-256 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-general-h-shared-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-conjugate-cancellation | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-degree0-validate | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-degree3-validate | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-double | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-scalar-1024 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-scalar-64-native | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-scalar-64-reference | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p5-group-rank2 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p13-group-cyclic | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p19-group-cyclic | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p11-local-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p7-local-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p5-even-local-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-p5-even-local-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-global-reduction | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-qq-general-h-shared-factor | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-real-period-64 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-central-value-32 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-lfunction-init-32-order4 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-real-period-64 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g3-central-value-16 | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| unsupported-characteristic-2-jacobian | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| unsupported-even-degree-jacobian | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| unsupported-wild-p2-global | wasm | unsupported | — | — | — | — | — | — | — | — | wasm: no production competitive hyperelliptic Wasm artifact exists yet |
| g2-p13-add-coprime | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `2ef2ecec534e…` | — |
| g2-p13-double | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `09674064d70d…` | — |
| g2-p13-scalar-256 | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `e9713735b8ce…` | — |
| g2-p13-general-h-shared-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `99b09d0ab83d…` | — |
| g2-p13-conjugate-cancellation | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `a7f15699bd21…` | — |
| g2-p13-degree0-validate | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `a7f15699bd21…` | — |
| g3-p5-degree3-validate | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `a0260df28834…` | — |
| g3-p5-double | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `f912beca55ec…` | — |
| g3-p5-scalar-1024 | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `a0260df28834…` | — |
| g3-p5-scalar-64-native | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `e1ac63614965…` | — |
| g3-p5-scalar-64-reference | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `e1ac63614965…` | — |
| g2-p5-group-rank2 | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | cache-hit | 0.0000 ± 0.0000 | — | `6a0697e30112…` | — |
| g3-p13-group-cyclic | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | cache-hit | 0.0000 ± 0.0000 | — | `cc8eccc094f5…` | — |
| g3-p19-group-cyclic | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | cache-hit | 0.0000 ± 0.0000 | — | `cff5cedb61f5…` | — |
| g2-p11-local-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `6d893c0d3152…` | — |
| g3-p7-local-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `89089dd96b9c…` | — |
| g2-p5-even-local-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `ef846163660a…` | — |
| g3-p5-even-local-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0000 ± 0.0000 | — | `2c1256046956…` | — |
| g2-global-reduction | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable global_reduction contract |
| g2-qq-general-h-shared-factor | magma | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | warm-arithmetic | 0.0100 ± 0.0000 | — | `5f8e42de746b…` | — |
| g2-real-period-64 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable real_period contract |
| g2-central-value-32 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable central_value contract |
| g2-lfunction-init-32-order4 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable lfunction_init contract |
| g3-real-period-64 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable real_period contract |
| g3-central-value-16 | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable central_value contract |
| unsupported-characteristic-2-jacobian | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable unsupported_characteristic_2_jacobian contract |
| unsupported-even-degree-jacobian | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable unsupported_even_degree_jacobian contract |
| unsupported-wild-p2-global | magma | unsupported | — | — | — | — | — | — | — | — | Magma runner has no comparable unsupported_wild_global contract |
| g2-p13-add-coprime | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_add contract |
| g2-p13-double | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_double contract |
| g2-p13-scalar-256 | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_scalar contract |
| g2-p13-general-h-shared-factor | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_add contract |
| g2-p13-conjugate-cancellation | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_add contract |
| g2-p13-degree0-validate | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_validate contract |
| g3-p5-degree3-validate | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_validate contract |
| g3-p5-double | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_double contract |
| g3-p5-scalar-1024 | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_scalar contract |
| g3-p5-scalar-64-native | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_scalar contract |
| g3-p5-scalar-64-reference | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_scalar contract |
| g2-p5-group-rank2 | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable group_structure contract |
| g3-p13-group-cyclic | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable group_structure contract |
| g3-p19-group-cyclic | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable group_structure contract |
| g2-p11-local-factor | pari | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | resident-recompute | 0.0050 ± 0.0000 | — | `6d893c0d3152…` | PARI bits n/a→64 |
| g3-p7-local-factor | pari | ok | 1.00 ± 0.0000 | — | 1.00 ± 0.0000 | — | resident-recompute | 1.00 ± 0.0000 | — | `89089dd96b9c…` | PARI bits n/a→64 |
| g2-p5-even-local-factor | pari | ok | 0.0000 ± 0.0000 | — | 0.0000 ± 0.0000 | — | resident-recompute | 0.0020 ± 0.0000 | — | `ef846163660a…` | PARI bits n/a→64 |
| g3-p5-even-local-factor | pari | ok | 1.00 ± 0.0000 | — | 1.00 ± 0.0000 | — | resident-recompute | 1.00 ± 0.0000 | — | `2c1256046956…` | PARI bits n/a→64 |
| g2-global-reduction | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable global_reduction contract |
| g2-qq-general-h-shared-factor | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable jacobian_add contract |
| g2-real-period-64 | pari | ok | 2.00 ± 0.0000 | — | 2.00 ± 0.0000 | — | resident-recompute | 2.00 ± 0.0000 | — | — | PARI bits 64→64 |
| g2-central-value-32 | pari | ok | 3.00 ± 0.0000 | — | 0.0000 ± 0.0000 | — | prepared-analytic-evaluation | 0.0000 ± 0.0000 | — | — | PARI bits 32→32 |
| g2-lfunction-init-32-order4 | pari | ok | 3.00 ± 0.0000 | — | 3.00 ± 0.0000 | — | prepared-descriptor-init | 3.00 ± 0.0000 | — | — | PARI bits 32→32 |
| g3-real-period-64 | pari | ok | 4.00 ± 0.0000 | — | 4.00 ± 0.0000 | — | resident-recompute | 4.00 ± 0.0000 | — | — | PARI bits 64→64 |
| g3-central-value-16 | pari | unsupported | — | — | — | — | — | — | — | — | PARI lfungenus2 is genus-2 only |
| unsupported-characteristic-2-jacobian | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable unsupported_characteristic_2_jacobian contract |
| unsupported-even-degree-jacobian | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable unsupported_even_degree_jacobian contract |
| unsupported-wild-p2-global | pari | unsupported | — | — | — | — | — | — | — | — | PARI has no comparable unsupported_wild_global contract |
| g2-p13-add-coprime | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-double | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-scalar-256 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-general-h-shared-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-conjugate-cancellation | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p13-degree0-validate | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-degree3-validate | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-double | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-scalar-1024 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-scalar-64-native | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-scalar-64-reference | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p5-group-rank2 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p13-group-cyclic | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p19-group-cyclic | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p11-local-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p7-local-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-p5-even-local-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-p5-even-local-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-global-reduction | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-qq-general-h-shared-factor | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-real-period-64 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-central-value-32 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g2-lfunction-init-32-order4 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-real-period-64 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| g3-central-value-16 | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| unsupported-characteristic-2-jacobian | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| unsupported-even-degree-jacobian | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |
| unsupported-wild-p2-global | sagemath | unsupported | — | — | — | — | — | — | — | — | sagemath: executable-not-installed |

## Resident resource envelope

| Backend | Process-cold wall ms | Outer CPU user/system ms | Resident peak RSS KiB | Mathematical user/system s |
|---|---:|---:|---:|---:|
| sagejs | 249648.12 | 1.24 / 0.1370 | 773716 | 256.89 / 1.01 |
| standalone | — | — | — | — |
| wasm | — | — | — | — |
| magma | 504.31 | 1.57 / 0.7170 | 22428 | 0.3700 / 0.0800 |
| pari | 246.83 | 1.14 / 0.1750 | 13376 | 0.1900 / 0.0000 |
| sagemath | — | — | — | — |

## Validation

Every emitted timing row passed its declared exact or numerical result contract.

Exact cross-backend digests are computed only after normalization (for example, Magma's odd-degree infinity weight is checked but not treated as an extra mathematical result).

## Host preflight

```text
$ uptime
05:45:06 up 19:41,  1 user,  load average: 0.02, 0.48, 0.77
$ uname -a
Linux cocalc-vm-51c5044ca6d3406d983e0f10 6.17.0-1022-gcp #25-Ubuntu SMP Sat Jul 25 01:12:40 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux
$ lscpu
Architecture:                            x86_64
CPU op-mode(s):                          32-bit, 64-bit
Address sizes:                           48 bits physical, 48 bits virtual
Byte Order:                              Little Endian
CPU(s):                                  8
On-line CPU(s) list:                     0-7
Vendor ID:                               AuthenticAMD
Model name:                              AMD EPYC 7B13
CPU family:                              25
Model:                                   1
Thread(s) per core:                      1
Core(s) per socket:                      8
Socket(s):                               1
Stepping:                                0
BogoMIPS:                                4899.99
Flags:                                   fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ht syscall nx mmxext fxsr_opt pdpe1gb rdtscp lm constant_tsc rep_good nopl xtopology nonstop_tsc cpuid extd_apicid tsc_known_freq pni pclmulqdq ssse3 fma cx16 pcid sse4_1 sse4_2 x2apic movbe popcnt aes xsave avx f16c rdrand hypervisor lahf_lm cmp_legacy cr8_legacy abm sse4a misalignsse 3dnowprefetch osvw topoext ssbd ibrs ibpb stibp vmmcall fsgsbase tsc_adjust bmi1 avx2 smep bmi2 erms invpcid rdseed adx smap clflushopt clwb sha_ni xsaveopt xsavec xgetbv1 clzero xsaveerptr arat umip vaes vpclmulqdq rdpid fsrm
Hypervisor vendor:                       KVM
Virtualization type:                     full
L1d cache:                               256 KiB (8 instances)
L1i cache:                               256 KiB (8 instances)
L2 cache:                                4 MiB (8 instances)
L3 cache:                                32 MiB (1 instance)
NUMA node(s):                            1
NUMA node0 CPU(s):                       0-7
Vulnerability Gather data sampling:      Not affected
Vulnerability Ghostwrite:                Not affected
Vulnerability Indirect target selection: Not affected
Vulnerability Itlb multihit:             Not affected
Vulnerability L1tf:                      Not affected
Vulnerability Mds:                       Not affected
Vulnerability Meltdown:                  Not affected
Vulnerability Mmio stale data:           Not affected
Vulnerability Old microcode:             Not affected
Vulnerability Reg file data sampling:    Not affected
Vulnerability Retbleed:                  Not affected
Vulnerability Spec rstack overflow:      Mitigation; Safe RET
Vulnerability Spec store bypass:         Mitigation; Speculative Store Bypass disabled via prctl
Vulnerability Spectre v1:                Mitigation; usercopy/swapgs barriers and __user pointer sanitization
Vulnerability Spectre v2:                Mitigation; Retpolines; IBPB conditional; IBRS_FW; STIBP disabled; RSB filling; PBRSB-eIBRS Not affected; BHI Not affected
Vulnerability Srbds:                     Not affected
Vulnerability Tsa:                       Mitigation; Clear CPU buffers
Vulnerability Tsx async abort:           Not affected
Vulnerability Vmscape:                   Not affected
$ free -b
total        used        free      shared  buff/cache   available
Mem:     33649016832  1016487936 22139637760     1097728 10978267136 32632528896
Swap:              0           0           0
$ ps -eo pid,ppid,comm,%cpu,%mem,rss --sort=-%cpu | head -25
PID    PPID COMMAND         %CPU %MEM   RSS
 316693  316692 node            23.0  0.1 48964
 316646     842 sshd             3.1  0.0 10468
 316499       1 systemd          0.9  0.0 11632
 290395       2 kworker/u32:2+i  0.1  0.0     0
      1       0 systemd          0.0  0.0 14008
 290840       2 kworker/u32:6-e  0.0  0.0     0
 289597       2 kworker/3:2-eve  0.0  0.0     0
    708       1 google_osconfig  0.0  0.1 49664
    977       1 google_guest_ag  0.0  0.0 23324
     15       2 rcu_sched        0.0  0.0     0
    241       1 multipathd       0.0  0.0 27332
     97       2 hwrng            0.0  0.0     0
    177       1 systemd-journal  0.0  0.1 42456
 290838       2 kworker/u32:4-e  0.0  0.0     0
  29497       2 kworker/0:0-eve  0.0  0.0     0
  46175       2 kworker/2:2-eve  0.0  0.0     0
 290841       2 kworker/u32:7-f  0.0  0.0     0
 290157       2 kworker/u32:3-i  0.0  0.0     0
    754       1 snapd            0.0  0.1 40920
    693       1 dbus-daemon      0.0  0.0  5476
 276040       2 kworker/4:1-cgr  0.0  0.0     0
 290844       2 kworker/7:1-eve  0.0  0.0     0
     73       2 kcompactd0       0.0  0.0     0
  48616       2 kworker/5:0-cgr  0.0  0.0     0
$ for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do test -r "$f" && printf '%s=' "$f" && cat "$f"; done

```

