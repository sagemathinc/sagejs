# Row 13 Phase-6 resident prepared-kernel boundary

The former row-13 timing blocker is closed. The resident host is
`row13_phase6_resident_kernel_host.cjs`; the capped exact check is
`check_row13_phase6_resident_kernel.cjs`.

`prepareResident(prepared)` authenticates the frozen prepared number field,
compiles all 18 native handles sequentially, and retains them in one process.
`runResident(resident)` owns one inclusive root clock containing:

1. the prepared initial factor/relation root;
2. relation collection, the first HNF, and every incremental HNF;
3. live recovery of all seven raw unit-kernel transforms and the class
   presentation transform from those same HNF calls;
4. analytic acceptance and the terminal class/unit lattice;
5. rank-two unit reduction, `cleanarch`, and authentic flag-zero `LARGE`
   `getfu` at 256-bit precision; and
6. construction of the cyclic order-two class-generator ideal from the live
   terminal permutation and authenticated factor-base ideal.

Authentication, compilation, subprocesses, filesystem access, hashing,
detached replay, mutation checks, resource inspection, and publication are
outside the clock. No frozen `W0`, accepted owner, answer, or class/unit fixture
enters the resident graph.

The gate captures HNF transformation owners during the genuine collection
schedule and applies `reverseSchedule` once. The old second million-cell HNF
ancestry replay is no longer needed. The exact check multiplies all eight
transforms through the live 999-by-1006 relation matrix: seven give zero and the
class vector gives exactly twice the selected factor-base row. Four mutations
of the final projection are rejected.

## First bounded development observation

The predecessor of the current host (the same mathematical graph, with exact
transform replay still performed after its clock) completed under
`RLIMIT_AS=4 GiB` and a 600-second CPU limit:

```text
inclusive resident mathematical kernel             82.912107305 s
  initial root and live state                        1.455299055 s
  factor metadata projection                         0.131924390 s
  relation/HNF and live transforms                  80.888087057 s
  accepted-state projection                          0.060787333 s
  analytic acceptance/terminal lattice               0.357150929 s
  unit lattice and getfu                              0.018714461 s
  class-generator assembly                            0.000144080 s
maximum RSS                                           1,633,808 KiB
```

This is one development observation, not a qualified PARI ratio or final
validation of the current 18-handle host. It localizes over 97% of row 13 in
the connected relation/HNF/transform stage. A current-host rerun in the shared
development environment was stopped at the 600-second wall budget while other
native lanes were compiling. The ordinary-Python transform-authentication root
has passed an isolated native smoke test; the complete checker remains
explicitly pending a quiet-host rerun.

```bash
timeout 600s /usr/bin/prlimit --as=4294967296 --cpu=600 -- \
  node --expose-gc bench/pari-class-group-port/check_row13_phase6_resident_kernel.cjs
```
