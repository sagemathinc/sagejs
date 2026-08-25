# Final Linux x64 acceptance receipts

These receipts were collected on `bench-1` with Node.js 22.22.2 from the
clean mathematical source freeze
`a680c04d06fbffd7831a96b3d6e0791ebfc39f26`. The analytic-timeout correction
and bounded rational-scalar receipt use the descendant benchmark revision
`e9669012a2078b7ed0e800410564433112452a82`; neither descendant change is in
the authenticated mathematical source bundle, whose framed digest is
`36495206826f889109076b8f19702c1225ba2d7ff3ebfbd3a5c3e0aae89573e1`.

## Closed gates

- Authenticated first ingress of 1,000 canonical serialized rows takes
  66.784 ms in genus 2 and 66.118 ms in genus 3, versus 1.680 s and 1.673 s
  for scalar reference validation: 25.15x and 25.30x speedups. Subsequent
  retained preparation takes 24.576 and 24.064 microseconds. The identical
  packed Cantor boundary is 1.040x/1.046x its standalone core.
- The rank-three order-32 map passes in five separate Node processes after
  production native-artifact publication: 0.532--0.563 s, 0.539 s median,
  or 15.03x the 8.103 s baseline. The first artifact-cold sample after the
  build took 1.224 s and failed the 0.8103 s gate; that full diagnostic is
  retained rather than discarded.
- All ordinary public finite-field add, double, and 256-bit scalar rows are
  within 2x Magma: genus-2 ratios are 1.777x, 1.575x, and 1.357x; genus-3
  ratios are 1.029x, 0.730x, and 0.739x. Exact Sage.js, reference, and Magma
  Mumford rows agree.
- Bounded-output rational non-torsion scalar multiplication is 1.664x Magma
  for scalar 17 with 347-bit maximum output coefficients, and 0.407x Magma
  for scalar 65 with 5,094-bit maximum output coefficients. The separately
  labelled 256-bit rational 2-torsion row is 0.334x Magma. Every exact result
  replays through the reference certificate. The generalized `h != 0` row is
  retained as a non-gating 2.181x result.

## Open analytic gate

Phase 9 does not have an accepted source-current receipt. The original
five-sample run hit the benchmark's inconsistent 300-second inner evaluation
timeout at 8,932,188 KiB peak RSS. After increasing that inner bound to 600
seconds while retaining the 1,200-second outer acceptance limit, the
five-sample run again timed out at 17,030,428 KiB peak RSS. A separately run
one-sample diagnostic also timed out at 600 seconds and 17,408,284 KiB peak
RSS. This establishes a source-current single-workload analytic regression,
not merely five-sample accumulation. The stderr and `/usr/bin/time -v`
artifacts for all three failures are checked in here; no Phase-9 receipt was
fabricated.

The first rational attempt is also retained. It failed before receipt
publication because Magma reported exactly 0.01 seconds for the generalized
row, equal to its timer resolution. The accepted rerun used 512 rather than
128 non-torsion iterations; it did not relax the timer-resolution check.
