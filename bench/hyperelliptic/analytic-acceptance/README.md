# Phase-9 analytic acceptance

This directory contains the bounded acceptance contract for Phase 9 of
`agents/hyperelliptic-magma-pari-performance-plan.md`.  It exists because the
repository's only previously checked-in analytic JSON was the historical
pre-optimization baseline.  That file has no source commit or Phase-9 gates
and is not final acceptance evidence.

The runner keeps five materially different facts separate:

1. true fresh `LFunctionInit` plan misses, with exact coefficients and the
   curve-independent universal table warm, versus fresh resident-PARI
   `lfuninit` calls at `realbitprecision=64`;
2. prepared central-value cache hits versus a fresh plan;
3. native orders 0--4 versus the ordinary inverse-Mellin route in genus 2 and
   genus 3;
4. process-cold universal-table construction, warm table evaluation, and the
   direct one-worker and bounded-four-worker Arb fallbacks;
5. exact quadratic-twist coefficients and signs, deterministic sequential
   versus two-worker results, and CPU refinement of every reported numerical
   candidate.

The direct Arb evidence retains every decimal derivative from both routes.
Arb ball arithmetic is rigorous, but the contour/interpolation truncation is
still explicitly nonrigorous and accepted only after independent refinement.

## Primary acceptance command

Do not run this while another benchmark owns `bench-1`.  Once the host is
reserved and the exact source commit is checked out, build with the pinned
Node.js 22.22.2 and run:

```sh
SAGEJS_BENCH_HOST=bench-1 node \
  bench/hyperelliptic/analytic-acceptance/run.cjs \
  --acceptance \
  --samples 5 \
  --precision 64 \
  --gp /home/user/.local/pari-2.18.1-alpha/bin/gp \
  --maximum-load 0.5 \
  --maximum-wall-seconds 1200 \
  --output bench/hyperelliptic/analytic-acceptance/phase9-receipt-linux-x64.json
```

The runner refuses a dirty worktree, a stale `dist/build-receipt.json`, a
source not descending from `b30ecbfa`, the wrong GP version, the wrong Node
version, an undeclared host, or a noisy one-minute load.  It records `uptime`,
`uname`, `lscpu`, memory, top processes, governor information, algorithm-
affecting environment variables, the GP executable digest, the successful
build preflight, and SHA-256 identities for every mathematical and harness
source file. If an exception or evaluator timeout occurs before the ordinary
acceptance object exists, the runner transactionally writes a distinct
`analytic-phase9-failure-v1` receipt with that same provenance and the complete
error stack. A structurally valid failure receipt remains a failed performance
gate; it is evidence, never a pass.

The measured one-sample development-host path is 3 minutes 11 seconds for the
competitive rows plus 20--80 seconds for exact evidence, depending on whether
the task-worker runtime is already cached.  Five acceptance samples therefore
have an expected quiet-host wall time of 15--19 minutes.  The hard contract is
20 minutes.  The
competitive benchmark and exact evidence each have their own bounded timeout;
the complete receipt also fails validation if total wall time exceeds the
declared bound. A failing numerical gate or thrown benchmark stage is still
written transactionally as honest evidence and makes the acceptance command
exit nonzero.

Validate a checked-in receipt against the current sources with:

```sh
node bench/hyperelliptic/analytic-acceptance/validate-receipt.cjs \
  bench/hyperelliptic/analytic-acceptance/phase9-receipt-linux-x64.json
```

Use `--historical` only when deliberately inspecting a receipt after a source
change.  It checks the mathematical contract but does not call the result
source-current.

## Local harness validation

Development-host timings are diagnostic only:

```sh
node bench/hyperelliptic/analytic-acceptance/run.cjs \
  --diagnostic --samples 1 --precision 64 \
  --gp /home/user/.local/pari-2.18.1-alpha/bin/gp \
  --output /tmp/sagejs-phase9-diagnostic.json
```

Diagnostic mode still requires clean, built, source-current code and runs all
mathematical evidence.  It relaxes only the `bench-1`, pinned-Node, quiet-load,
and five-sample acceptance requirements.  It must never be renamed or
committed as the Linux acceptance receipt.

## Files in the contract

- `run.cjs`: transactional, bounded orchestration and host/source preflight;
- `evidence.cjs`: direct-Arb and exact CPU-family evidence in one Sage.js
  session;
- `contract.cjs`: immutable source set, gate computation, and receipt
  validation;
- `validate-receipt.cjs`: source-current or explicitly historical validation;
- `phase9-receipt-linux-x64.json`: created only by an authorized quiet
  `bench-1` acceptance run; it is intentionally absent until that run occurs.
