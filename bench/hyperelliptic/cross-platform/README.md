# Hyperelliptic cross-platform acceptance

This directory measures two exact workloads that are already integrated into
Sage.js:

- the packed smalljac and coefficient-only genus-2 local-factor streams;
- source-transparent genus-2 prime-field Kummer duplication;
- prepared packed genus-2 and genus-3 Cantor addition, scalar, and progression
  batches.

The runner is deliberately self-contained. It compiles the Kummer and Cantor
sources into a content-addressed native cache, starts separate resident Sage.js
processes in target-asserted-native and forced-dynamic modes, and rejects
unequal canonical output digests. It records process/object cold timings, warm
batch samples, CPU time, RSS, the compiler and source hashes, host metadata,
load, and relevant
thread and algorithm environment variables.

Prepare an exact checkout before collecting a receipt:

```sh
pnpm install --frozen-lockfile
pnpm parallel:cache -- prepare
pnpm build
node bench/hyperelliptic/cross-platform/run.cjs \
  --limits 10000,100000 --kummer-batch 4096 --repeat 5 \
  --cantor-scalar-items 64 --cantor-scalar-repeat 1 \
  --output bench/hyperelliptic/cross-platform/results/HOST.json
```

The primary Linux x86-64 performance host is `ssh bench-1`. The platform
acceptance hosts are `ssh bench-arm`, `ssh m1`, and `ssh windows`. Absolute
timings are not compared across unlike architectures. Magma rows belong only
to `bench-1`; a missing competitor is never counted as a Sage.js win.

Before accepting a receipt, confirm that the preflight load is suitable. The
runner records the raw preflight evidence but does not pretend to know whether
an unfamiliar process is legitimate. A receipt must have a clean repository
status, one exact commit, identical dynamic/native digests, and a native Kummer
capability value beginning with `(True, 'native')`. Any unreachable host is
recorded with the actual SSH error and retried; no timing is inferred from a
different machine.

The local-factor packed backend is the external smalljac addon in both Sage.js
execution modes. Its two rows establish portable exactness and boundary cost;
they are not a claim that smalljac has a dynamic same-source implementation.
The coefficient-only stream exercises the new bounded-materialization public
path. Kummer and Cantor use the same Python source bodies in both modes and are
the actual dynamic/native differential workloads. The fixed Cantor performance
slice is 1,000 public additions, 64 independent 256-bit scalars, and a packed
1,000-element progression in both genus 2 and genus 3. Addition and scalar
batches are timed once with packed-backed public divisors retained and once
with polynomial `(u,v)` materialization forced. Progressions report raw packed
rows, packed-backed public divisors, and forced materialization separately.
Every full packed digest must agree. A complete tiny `GF(3)` Jacobian supplies
a separate exact digest independent of those timing checksums.

The ordinary dynamic reference path already constructs polynomial divisors,
so it records forced materialization as not applicable instead of rerunning an
identical expensive scalar batch and pretending that it is a distinct tier.

Receipts are immutable evidence. If the commit, compiler, VM image, workload,
or runner changes, add a new receipt rather than overwriting an old one.

## Branch-covering Cantor domain corpus

The original release policy deliberately authorized only two exact model
fingerprints at `GF(1009)`.  A broader `auto` entry requires evidence for the
whole named model class, not an inference from those two curves.  The checked
`domain-corpus-v1.json` therefore crosses:

- genus 2 and genus 3;
- the primes 5, 13, 101, 1009, and 65521;
- odd-degree one-infinity models with both `h = 0` and `h != 0`;
- singleton calls and the maximum admitted add, scalar, and progression
  workloads.

Every curve independently checks that `h^2 + 4*f` is squarefree.  The runner
executes the same typed Cantor source once in forced-dynamic mode and once in
native mode, rejects any difference in the complete canonical packed output,
and requires native execution to be faster for all three operations.  It does
not cover split even-degree models, extension fields, primes outside the
recorded interval, larger batches, or scalars wider than 256 bits.

From an exact clean checkout with a current build, collect a receipt with:

```sh
node bench/hyperelliptic/cross-platform/run-domain-corpus.cjs \
  --repeat 1 \
  --output bench/hyperelliptic/cross-platform/results/HOST-domain.json
```

Use `--check` for the cheap structural corpus regression.  Domain receipts are
inputs to the release-policy generator; their mere presence never enables an
automatic native path.

After collecting comparable receipts, verify their per-mode and cross-host
digests and print a compact timing/RSS summary with:

```sh
node bench/hyperelliptic/cross-platform/verify.cjs \
  bench/hyperelliptic/cross-platform/results/*.json
```

Generate the human-readable table from the same primary and companion JSON
receipts with:

```sh
node bench/hyperelliptic/cross-platform/report.cjs \
  --output bench/hyperelliptic/cross-platform/results/report.md \
  bench/hyperelliptic/cross-platform/results/*.json
```

Phase 10 also has a portable-artifact companion receipt. Run it from the same
clean checkout after installing that exact commit's authenticated
`packages/flint-wasm/dist` artifact:

```sh
node bench/hyperelliptic/cross-platform/run-phase10-extras.cjs \
  --expected-commit COMMIT --repeat 5 \
  --output bench/hyperelliptic/cross-platform/results/HOST-extras.json
```

This companion compares the checked-in POSIX standalone Cantor harness with
the authenticated Wasm core on the same 1,000-row packed inputs and rejects a
digest mismatch. It also records Kummer Wasm throughput, artifact
authentication/load, evaluator cancellation and recovery, checked source
bounds, and the production package-load test. The standalone cell is labeled
unavailable on native Windows because the current standalone harness links
POSIX static archives. It is also unavailable on macOS because its current
standalone build emits GNU/ELF linker flags rejected by Mach-O `ld`. The
separately compiled Windows and macOS native modes are still required by the
primary receipt.

When a test-only package correction lands after the mathematical source
freeze, rerun just that smoke test without changing the recorded source
commit:

```sh
SAGEJS_ROOT=/path/to/clean/frozen/checkout \
node bench/hyperelliptic/cross-platform/rerun-package-smoke.cjs \
  --input HOST-extras.json --output HOST-extras.json \
  --expected-commit FROZEN_COMMIT --test-patch-commit TEST_COMMIT
```

The updater obtains the one test file from Git, runs it under a temporary name
beside the frozen test, restores a clean checkout, and records the frozen test
hash, overlay commit/hash, updater hash, command output, and status in the
receipt. It rejects a dirty checkout or a failing corrected smoke test.

## Release policy generation

Cross-platform receipts do not authorize `algorithm="auto"` merely by being
present. After one mathematical source bundle has passed the four-platform
matrix, the release-specific generator validates the raw receipts, failure
evidence, and sanitizer evidence and emits exact normalized policy receipts:

```sh
node bench/hyperelliptic/cross-platform/release-policy.cjs --write
node bench/hyperelliptic/cross-platform/release-policy.cjs --check
node scripts/hyperelliptic-auto-receipt-policy.cjs verify
```

The generated policy is intentionally an allowlist of receipt-backed model and
workload envelopes. The `c5622982` freeze replaces the two `GF(1009)` exact
fingerprints with three named-domain entries: add, scalar, and progression for
odd-prime, odd-degree one-infinity genus-2/3 models, `h = 0` or `h != 0`, primes
5 through 65521, and only the recorded resource bounds. Its 12 normalized
receipts bind the four raw `*-c5622982-domain.json` artifacts. Failure and
sanitizer evidence from `70513bba` is carried forward only because the framed
mathematical runtime source bundle is byte-identical, and that provenance is
explicit in `policy-c5622982/evidence-index.json`.

This does not authorize split even-degree models, extension fields,
neighboring primes, larger batches, wider scalars, or different operations. A
release without a matching verified entry uses the existing exact
dynamic/reference path; `algorithm="native"` remains an explicit developer or
receipt-collection choice subject to the ordinary capability and resource
checks.
