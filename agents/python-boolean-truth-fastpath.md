# Boolean identity fast path

Return the two host Boolean values directly from the bootstrap truth primitive,
before type lookup. Identity checks cannot invoke user equality or truth hooks.
All other inputs retain the existing path, at the cost of two extra comparisons.
The compiler's existing function-scoped bootstrap exception lowers this branch
to native strict identity and logical OR; no new compiler exception is added.

The baseline is clean `71414f6f5`. A local diagnostic covers explicit `bool`
calls and branch conditions on Boolean, integer, string, list, `__bool__`, and
`__len__` inputs. Each has 40,000 input truth operations, three warmups, seven
samples and verified checksums; CPython 3.14.4 executes identical source.
Timing includes loop, arithmetic and call overhead. It is not an independently
qualified performance-cliff result. All twelve local median timings improved
22–29%, with nonoverlapping before/after sample ranges. Boolean branch timing
fell from 4.54ms to 3.25ms; explicit Boolean conversion fell from 11.16ms to
7.90ms. Non-Boolean workloads also improved: their loop conditions and runtime
helpers consume Boolean predicates, so these measurements do not isolate the
cost of the input's two additional identity checks.

Raw, byte-preserved receipts are in
`evidence/python-boolean-truth-{before,after}.json`; the exact driver and input
are in `evidence/python-boolean-truth-benchmark/`. The before tree was clean;
the after report truthfully records the dirty candidate before committing its
source, tests, documentation and evidence. Both runs bind source, executable,
build and artifact identities, with matching program hashes and checksums.
Reproduce from the repository root with:

```sh
node agents/evidence/python-boolean-truth-benchmark/run.cjs --root . --python /path/to/python3.14.4 --out /tmp/truth-measurement.json
```

Architecture and routine validation pass (10m 31s including rebuild and startup
checks). The generated-code regression confirms native strict identity/OR and
no recursive truth calls. Python/Sage protocol fixtures pass. Source-current
full-manifest replay retains exactly 522 passes, three reviewed differences and
eleven existing required failures; its unchanged-input guard passes and the
full gate remains unqualified. Package results remain 8/11 plus seven passing
Tomli upstream tests. No four-platform qualification or performance-cliff
closure is claimed. The existing core source ceiling remains unchanged.

The proposed broad truth fixture exposed a preexisting issue: `bool(float('nan'))`
is false on the baseline. That issue is not caused or repaired by Boolean
identity checks. The new regression tests cover the already-working truth
protocols and exceptions without encoding the NaN result as correct; NaN truth
needs a separate numerical correctness repair.
