# ADR 0005: Linux mathematical addons live for the process lifetime

- Status: accepted
- Date: 2026-09-04

## Context

The P8 numerical release qualification exposed an intermittent Linux ARM64 SEA
failure after a mathematically successful program. The same workload could
abort in glibc or segfault while repeatedly combining native mathematics,
`multiprocessing.Pool`, and a subsequent child-process spawn.

A retained core identified the conflicting operations precisely:

- the main Node thread was in `uv_spawn()` and glibc `fork()`; and
- a worker thread was destroying its Node environment, calling
  `node::binding::DLib::Close()`, and finalizing `sagejs_flint_ffi.node`.

The addon statically embeds OpenBLAS. OpenBLAS registers process-wide
`pthread_atfork` handlers; unloading the addon deregistered those handlers
while glibc was iterating the same handler array for `fork()`. Waiting for the
worker's JavaScript-level close message cannot solve this: the message is sent
before Node destroys the environment and unloads its dynamic libraries.
Likewise, `Worker.terminate()` completes asynchronously, while the compiled
Python host boundary is intentionally synchronous.

Copying a non-unloadable SEA addon separately for every worker would avoid the
race but retain one large mapped image per worker, which is not an acceptable
lifetime policy for a long-running embedding.

## Decision

Generated Linux mathematical addons are linked with ELF `DF_1_NODELETE`
(`-Wl,-z,nodelete`). The direct FLINT addon follows the same rule. Such addons
may contain statically linked libraries with process-wide allocator, thread,
or atfork state, so their code and static storage remain mapped until the Node
process exits even when a worker environment releases its DLib handle.

SEA kernel and multiprocessing workers borrow one parent-owned native resource
directory. Embedded files are published by complete private write followed by
an atomic rename, so concurrent isolates never observe partial addon or wrapper
bytes. Worker isolates clear their own JavaScript caches but never remove the
shared directory; the parent removes it at process exit where the operating
system permits. This makes all worker environments refer to the same physical
ELF images and prevents `NODELETE` from multiplying mapped native payloads.

This is a Linux rule. macOS and Windows retain their platform-native loader
behavior, though SEA workers still share the extraction directory there to
avoid redundant payload copies.

## Consequences

- A Linux process cannot reclaim a loaded mathematical addon's static image
  before process exit. This is intentional: those libraries already expose
  process-wide state whose safe teardown cannot be scoped to one Node isolate.
- New direct Linux addons that statically embed process-wide runtimes must adopt
  the same linker policy or demonstrate an isolate-safe unload contract.
- Generated native-kernel cache identity includes the compiler source, so this
  linker-policy change invalidates and rebuilds affected artifacts.
- SEA release tests repeatedly alternate native worker teardown and
  child-process spawn. The old ARM64 build fails this regression; corrected
  addons must also advertise `NODELETE` in their ELF dynamic flags during
  platform qualification.

