# Hyperelliptic cross-platform acceptance

This directory measures two exact workloads that are already integrated into
Sage.js:

- the packed smalljac and coefficient-only genus-2 local-factor streams;
- source-transparent genus-2 prime-field Kummer duplication.

The runner is deliberately self-contained. It compiles the Kummer source into
a content-addressed native cache, starts separate resident Sage.js processes
in required-native and forced-dynamic modes, rejects unequal canonical output
digests, and records process/object cold timings, warm batch samples, CPU time,
RSS, the compiler and source hashes, host metadata, load, and relevant thread
and algorithm environment variables.

Prepare an exact checkout before collecting a receipt:

```sh
pnpm install --frozen-lockfile
pnpm parallel:cache -- prepare
pnpm build
node bench/hyperelliptic/cross-platform/run.cjs \
  --limits 10000,100000 --kummer-batch 4096 --repeat 5 \
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
path. Kummer is the same Python source body in both modes and is the actual
dynamic/native differential workload.

Receipts are immutable evidence. If the commit, compiler, VM image, workload,
or runner changes, add a new receipt rather than overwriting an old one.
