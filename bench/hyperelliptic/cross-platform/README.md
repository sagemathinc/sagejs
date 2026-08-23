# Hyperelliptic cross-platform acceptance

This directory measures three exact workloads that are already integrated into
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

After collecting comparable receipts, verify their per-mode and cross-host
digests and print a compact timing/RSS summary with:

```sh
node bench/hyperelliptic/cross-platform/verify.cjs \
  bench/hyperelliptic/cross-platform/results/*.json
```
