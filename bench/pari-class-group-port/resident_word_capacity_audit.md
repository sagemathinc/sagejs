# Fixed-slot capacity diagnostic

This is a storage-capacity experiment, not a qualified timing comparison or an
automatic-capacity policy. No mathematical or compiler source was changed.

`probe_resident_class_attempt.cjs --word-capacity N` selects the ordinary
`IntegerBuffer` word floor, defaulting to the existing 64. CUP keeps its
four-word floor. Each owner's maximum supplied input bit length may raise its
initial capacity; computed outputs never do. The native overflow failure
remains in force. Every computation restores all original owner contents.

The predeclared eight-word experiment used the same prepared cubic input:

- Input SHA-256:
  `37abbff3ea5a0fbbd81d4261a737f19808a2b85220c725417d0f315d15c0e10c`.
- Uninstrumented core SHA-256:
  `052512849c16228619410f6c1626b1ed5f32273250e7ddf27b759d56e1c27f10`.
- Prepared reference:
  `/tmp/sagejs-prepared-attempt-reference-r6W2XO/fixtures.json`.
- Results:
  `/tmp/sagejs-cubic-capacity8-tzqFz5S6/gmp.json` and `tagged.json`.

Both backends pass one fresh-state warmup and three fresh-state single-call
samples. Each call checks class number 3, invariants `[3]`, the exact regulator
triple, 58 relations, and work counts 491 small elements / 54 factor attempts /
12 ideals against the independent replay/reference. No buffer overflow occurs
on this field; this does not establish eight-word sufficiency for other inputs.

Owners occupy 42,312,456 bytes, with the same snapshot cost, versus the previous
64-word policy's 271,240,904 bytes each. `admission_products` still reserves
1,470 words from its supplied input; CUP stays at four words.

| Backend | Single-call milliseconds | Reset milliseconds |
| --- | --- | --- |
| GMP | 100.484, 100.329, 100.194 | 4.772, 4.842, 4.709 |
| Tagged | 107.354, 106.655, 107.132 | 5.091, 5.258, 5.186 |

Other validation workloads were running on the host. These are unqualified
diagnostic samples, not paired speedups, not a backend ranking, and not a PARI
comparison. They show a substantial exact storage reduction without making
the approximately hundred-millisecond computation disappear. The fixed slot
floor alone does not explain the large performance gap; phase-level work and
representation costs still need investigation.

The two metered invocations consumed 71.09 CPU seconds including source/cache
resolution and setup; the processes retained the 4 GiB address-space limit and
1.5 GiB Node heap limit. Raw JSON artifacts are temporary evidence, not backups.
