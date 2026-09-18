# Row 19 Phase-6 resident relation-root audit

Date: 2026-09-18

This lane closes the largest honest resident cut currently available for row
19. It does **not** claim a complete prepared-field class-and-unit kernel.

## Boundary closed

The former transaction published a gzip first-HNF owner, reread and
authenticated it, then recomputed the complete 423-column collection and first
HNF solely to recreate native handles for terminal continuation. The new
`runTerminalContinuationLive` entry accepts that live first-HNF object. The
Phase-6 root therefore executes exactly once, in one process and without file
publication:

1. relation collection from 71 to 423 columns;
2. first sparse cleanup, HNF and CUP reduction;
3. next-pass control;
4. collection of the final seven relations;
5. HNF append and CUP suffix; and
6. analytic inverse-`hR` and terminal acceptance.

The retained exact projection is unchanged:

- first state: `[9,15,408,7,6,69,0,423,0]`;
- terminal state: `[9,15,415,0,6,7,0,430,0]`;
- relation state: `[430,4350,0,0,430,430]`;
- class-number candidate: `39366`;
- terminal result SHA-256:
  `7613a87cb7005bd3c92c594a00bacb2a6ceb6a1cc9f7dd38dcc7562dd960cc8c`;
- complete retained relation-identity SHA-256:
  `17608bc125082b69104323ce6e84f9f3102562e284bfc03ec834485532be15ac`.

The root reports zero subprocesses, zero serialized owners, and zero duplicate
first-HNF executions inside its boundary. Its conservative owner-byte upper
bound is 505,170,392 bytes, below the four-GiB gate. A private `WeakMap` retains
the first-HNF object plus the terminal collector/HNF native buffers for the
next class/unit connection; those capabilities are absent from the serializable
result projection and cannot be forged by copying it.

## Validation

`check_row19_phase6_resident_relation_root.cjs` runs in a fresh child with
four-GiB address/RSS and 600-second CPU limits. It authenticates the prepared
input, rejects a changed polynomial and an unbranded resident context, scans
the resident entry point for process/filesystem operations, and checks the
full exact projection hashes above. The checker uses a row-private native cache
on `/scratch`; a deliberately repeated run exposed that sharing a build-cache
directory with concurrent compiler lanes can race inside `node-gyp`, which is
not a mathematical failure and is forbidden for this receipt. A validation
execution completed with
1,023,248 KiB maximum RSS. Its 94.885-second resident wall observation was
made while multiple independent compilation lanes were consuming the same
host and is diagnostic only, not qualification timing.
The complete receipt is
`/scratch/row19-phase6-resident-relation-root-check-v6.json` with SHA-256
`101f27aa813b67b7b8877604e1d42e2adfe9272ee9803cd56ab5f6ae6469f7c6`.

The legacy descriptor entry point remains and passes its unchanged focused
test. It now delegates to the live implementation after descriptor replay, so
correctness consumers are not forked onto different mathematics.

## Exact remaining source cut

`residentPreparedKernelTimingReady` remains false. Three boundaries prevent
an honest prepared-field or end-to-end timing claim:

1. factor-base/initial-relation and analytic-catalog prefixes are ordinary
   Python orchestrators currently invoked in subprocesses during
   `prepareResident`;
2. the class-principal, compact-unit, exact-unit, and final-result paths still
   consume serialized owners and invoke CPython; and
3. the existing first/terminal hosts perform authenticated native-artifact
   cache lookups inside the resident call rather than receiving a fully bound
   callable graph.

Consequently this is a real resident relation/HNF/acceptance aggregate and a
useful implementation predecessor, but it is deliberately marked
`correspondenceComplete=false`, `publicComplete=false`, and
`qualifiedTiming=false`. Timing the old complete transaction or presenting
this subgraph as end-to-end would be misleading.
