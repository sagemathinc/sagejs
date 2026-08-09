# ADR 0002: Host-isolated native kernels

- Status: accepted
- Date: 2026-08-09

## Context

Ahead-of-time compilation is only a distinct mathematical execution layer if
the compiled region does not repeatedly return to the dynamic Sage.js runtime.
An implementation that silently inserts JavaScript or Python callbacks can
appear native while retaining interpreter latency, object-model semantics, and
host-specific coupling. It is also difficult to reuse in a worker, standalone
library, command-line program, or WebAssembly module.

Native Kernel v15 already compiled direct function graphs and kept ordinary
Python as a same-source fallback, but exact-kernel functions carried a
`napi_env` so cold error paths could throw Node exceptions. The mathematical
loop did not call JavaScript, yet this representation prevented the generated
core from being independently compiled and made the isolation property
implicit.

## Decision

After an adapter marshals host values, a native kernel and every function it
calls must execute without entering Python, JavaScript, Node-API, or another
interpreter runtime. Unsupported source is rejected at compile time. Native
mathematical libraries, the C standard library, compiler representation
primitives, and explicitly owned or borrowed packed storage are not host
callbacks and remain permitted.

Generated kernels return a small structured status through a C ABI. Host
adapters translate that status only after the kernel returns. Every supported
kernel kind emits two independently useful artifacts:

- `kernel_core.c`, containing the generated mathematical graph and native
  representation runtime;
- `kernel_core.h`, declaring stable packed types, statuses, and entry points.

The Node addon is a separate adapter around this core. The compiler constructs
and audits the core before generating that adapter; there is no monolithic or
partially isolated fallback pipeline. Compiler introspection reports the
certified isolation boundary for every accepted kernel kind. A proposed
backend that cannot satisfy the boundary is rejected rather than registered as
partially migrated.

## Enforcement

- `sagejs native explain` reports host-isolation eligibility.
- `sagejs native emit-core-c` and `emit-header` expose the boundary.
- Core generation scans for Node-API, CPython, and JavaScript-engine symbols
  and fails closed if any are present.
- Tests compile an emitted exact core into a standalone executable, compile
  and execute every backend family through its adapter, inspect every emitted
  core for forbidden host APIs, and compare results with JavaScript/native
  paths.
- When the repository's WASI/GMP toolchain is present, the identical core is
  also compiled to WebAssembly and executed differentially.
- The native-kernel registry accepts only `certified` witnesses.

## Consequences

- Successful isolated compilation has a strong meaning: the native region is
  genuine machine code rather than an accelerated interpreter extension.
- Long-running kernels may be scheduled on workers without changing their
  mathematical implementation.
- Generated kernels have standalone value outside Sage.js and Node.
- I/O such as `print` requires a future explicit native capability or buffered
  output ABI; it cannot accidentally resolve to Python's or JavaScript's
  implementation.
- Exact/GMP, packed binary64, MPFR/MPC, source-transparent prime-field, and
  specialized prime-field backends share the status ABI and isolated-core
  pipeline.

## Rejected alternatives

- **Allow arbitrary host callbacks.** This makes compilation permissive but
  destroys predictable performance, portability, and standalone reuse.
- **Forbid all native libraries.** GMP, MPFR, FLINT, and similar libraries are
  mathematical primitives rather than interpreters; excluding them would make
  exact computation slower and duplicate mature work.
- **Give native `print` subtly different implicit semantics.** Observable I/O
  must be an explicit capability with documented ordering, encoding, and error
  behavior.
