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

The full 18-prime modular result is byte-identical to forced generic tall HNF;
its canonical SHA-256 is
`2c5dade462e02facdccd5a8fa41fdcbb1791ddbe16bf2fc002d41ffc3a9920a3`.

Replacing fixed modulo lanes with a mutex-protected FIFO work queue reduced
one quiet exact batch from 4.050572 s to **3.922759 s**. The canonical basis
remained identical. The dynamic and static local critical paths were
3.906130 s and 4.029060 s, respectively.

The static modulo-lane job-wall totals were 2.909345, 3.405733, 4.028836,
2.456436, and 1.795418 seconds. Reconstructing the dynamic FIFO assignments
from the measured job walls gives 1.927858, 2.828357, 3.232615, 3.905893, and
2.199591 seconds. The last `p=2683361` solve still determines the dynamic
critical path, but the queue removes the avoidable fixed-lane imbalance.

The focused witness uses seeded per-index delays, compares the dynamic result
with a forced-static build against a frozen identity lattice, and injects a
sibling failure to exercise joined transactional cleanup. Normal and
ASan/UBSan dynamic/failure runs passed; the normal forced-static differential
also passed. The driver is configured to include forced-static sanitizer
coverage in the final integration rerun.

One fresh full public diagnostic exceeded its 120-second bound and was
terminated. It emitted no stage record because that worker reports only after
completion. The separately bounded 4.55-second native batch rules out the old
native Round-2 tail; the residual is downstream, but this censored run cannot
honestly distinguish merge, materialization, and certification.
