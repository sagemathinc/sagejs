# Mathematical cryptography book compatibility corpus

This corpus pins Luís Finotti's *A Practical and Computational Introduction to
Mathematical Cryptography* and its homework sets. It inventories every code
cell and executes the reader-facing Sage sessions as a compatibility target
for Sage.js.

The author explicitly granted permission in the `sage-support` thread on
2026-08-03 to include all of the code in the Sage.js test suite. The scope and
provenance of that permission are recorded in `SOURCE.json`. The book source
also carries GPL-3.0-only; the homework repository does not declare a license,
so its separate explicit permission is material to this corpus.

Initialize the pinned sources after cloning Sage.js:

```sh
git submodule update --init upstream-tests/pcimc/source
git submodule update --init upstream-tests/pcimc/homework-source
```

Regenerate the deterministic cell inventory:

```sh
pnpm pcimc:extract
```

Run the reviewed compatibility gate or a diagnostic report:

```sh
pnpm test:pcimc
pnpm pcimc:report
```

Each book chapter runs in a fresh stateful Sage session, with its cells kept in
source order. Homework notebooks likewise form independent sessions. Cells
from the homework notebooks remain in the inventory, including checks and
benchmarks, but are classified as `exercise-template` because they depend on
student-filled answers rather than forming completed programs. Notebook shell
commands and unsupported presentation-only cell magics are also retained with
an explicit classification.

The MyST sources do not retain notebook output, so the initial gate checks that
each executable cell completes successfully. Location-specific expected
failures live in `expectations.json`; an unexpected pass is an error so the
compatibility ledger cannot silently become stale.

At the pinned revisions, the corpus contains 1,130 cells. The reviewed gate
currently has 637 passing book cells and 299 location-specific expected
failures. It classifies 194 cells separately: 160 homework exercise cells, 22
benchmarks, eight notebook shell commands, two presentation-only magics, and
two bounded-runtime exclusions.
