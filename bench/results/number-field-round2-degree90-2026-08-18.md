# Independent-prime Round-2 receipt

The exact independent-prime path now applies to degrees 64 through 96. Each
local solve starts from the same immutable equation order. The result is the
sum of the scaled local generator lattices, not a rowwise CRT of unrelated
normal forms.

At common denominator `D`, every local overorder contains the equation order,
so the stacked integer generator lattice contains `D*Z^n`. Consequently its
largest Smith elementary divisor divides `D`, which is the exact precondition
for FLINT's modular elementary-divisor HNF.

## Degree 64: vector429

- Prime batch: `[2, 3, 5]`
- Quiet production native boundary: **1.846863 s**
- Canonical lattice SHA-256:
  `a708a4a6ff595fa0a1e4ed4f8a8b266b47829f4685270aae72ba4ae385a0dfdd`
- Exact equality with the forced compounded sequential implementation: yes
- Independent equation-order containment and multiplication closure: checked
- Denominator: `2479491129600000`

The retained timing is one quiet fresh high-level
`native_order_from_polynomial` call after rebuilding the generated adapter.
Samples overlapping another lane's diagnostics were discarded.

## Degree 90

The 18-prime direct batch is **4.548697 s**. Its exact split is 4.528713 s for
the local critical path, 14.476 ms for modular HNF merge, 3.627 ms unpacking,
1.393 ms publication, and 0.427 ms cleanup. The earlier generic tall HNF alone
took 3.214790 s.

The full 18-prime forced-generic-HNF oracle and full public frozen-lattice
receipt remain the final follow-up checks.
