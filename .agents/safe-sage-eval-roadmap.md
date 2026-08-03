# Safe Sage Evaluation Roadmap

Status: proposed design; no implementation has been started.

## Purpose

Add a small, reusable primitive for evaluating untrusted or semi-trusted
Sage.js source under explicit resource and capability limits. Build a static
browser SageCell and an optional HTTP/WebSocket computation service on top of
that primitive.

The desired input is source in Sage, Python, Wolfram/Mathematica, Magma,
Maple, or Matlab syntax plus limits and capabilities. The output is a stream
of textual, diagnostic, display, and final-result events.

This proposal distinguishes three guarantees:

1. **Restricted**: protects a host application from accidental runaway code.
2. **Process isolated**: suitable for semi-trusted classroom deployments.
3. **Hardened**: suitable for adversarial public-internet input when paired
   with an operating-system isolation provider.

Only the third level should make a strong hostile-input security claim.

## Executive decision

The public evaluator should use a fresh Node.js **child process**, not merely
a `worker_threads` worker, as its killable resource and authority boundary.
A worker remains useful inside trusted applications and browsers, but a Node
worker shares the containing process's authority and cannot impose complete
memory limits on FLINT, GMP, `ArrayBuffer`, or other native/external memory.

The implementation should combine:

- a deny-by-default Sage.js host-capability adapter;
- an in-memory, byte-capped user filesystem;
- compiler and runtime attack-surface reduction;
- Node process permissions;
- parent-enforced wall/output limits; and
- pluggable OS-level CPU, memory, process, filesystem, and network isolation.

Parser restrictions, `node:vm`, and the Node permission model are useful
defense-in-depth layers, but are not independently security boundaries.

## Existing Sage.js building blocks

Much of the non-security machinery already exists:

- `tools/kernel.ts` owns a worker lifecycle, interrupts, timeout replacement,
  streamed output, structured results, completion, and inspection.
- `tools/kernel-evaluator.ts` compiles Sage/Python and returns clone-safe text
  and rich display records.
- The polyglot frontends lower Wolfram, Magma, Maple, Matlab, and other source
  to Sage.js.
- `tools/host.ts` centralizes the CPython-compatible standard library's host
  access behind `__sagejs_host__`.
- `packages/flint-wasm` already has an outer evaluator Web Worker, a nested
  compiler worker, streamed output, timeout-by-replacement, rich graphics,
  and a CoWasm/WASI in-memory filesystem.

The server and wire protocol are therefore relatively small projects. The
main work is defining and enforcing the security boundary and quotas.

## Security findings that shape the design

### Parser filtering is insufficient

Disabling Sage.js's raw `%js` literal is necessary, but ordinary Python syntax
can currently reach JavaScript constructors. For example, array properties can
lead to the JavaScript `Function` constructor and then to the Node `process`
object. Removing a global `require` binding does not close this route.

Safe mode should reject raw JavaScript and dangerous interop properties such
as `constructor`, `prototype`, `__proto__`, `caller`, and `callee`. It should
also remove unnecessary globals and freeze appropriate runtime objects. These
changes reduce attack surface; the process/OS boundary must remain safe even
when compiler hardening is bypassed.

### The normal Node host is intentionally powerful

`tools/host.ts` exposes real filesystem access, subprocesses, HTTP, DNS, TCP,
environment state, and multiprocessing. The safe evaluator must not install
this adapter. It needs a separate `SafeHostAdapter` with an explicit allowlist.

### Compilation is part of the untrusted workload

Source parsing, Sage/Python compilation, and foreign-language lowering can
consume CPU and memory. They must run inside the constrained child, not in the
HTTP server or other trusted parent process. A maximum source byte count and
maximum diagnostic count must be enforced before and during compilation.

### Output is a resource

The current Node kernel accumulates all stdout while streaming it. Hostile code
can print indefinitely or construct a huge rich display. Safe evaluation must
enforce limits on:

- total stdout and stderr bytes;
- number of events;
- final representation bytes;
- structured display bytes and nesting;
- number and size of virtual files; and
- serialization depth and size.

The wire protocol must support backpressure. Crossing the limit terminates the
evaluation rather than merely discarding output while computation continues.

## Threat model

### In scope

- Infinite loops and excessive recursion.
- CPU-intensive compilation, JavaScript, and native mathematics.
- V8 heap, `ArrayBuffer`, WASM, FLINT, GMP, MPFR, and native allocation growth.
- Attempts to read or modify host files.
- Attempts to read environment variables or service credentials.
- Attempts to create subprocesses, worker threads, sockets, or HTTP requests.
- JavaScript escape through `%js`, reflection, constructors, prototypes,
  dynamic evaluation, imports, or serialization hooks.
- Output flooding, large graphics, decompression bombs, and oversized IPC.
- Crashes, explicit `process.exit()`, and native-addon failures.
- Cross-request state leakage.

### Out of scope for the first hardened version

- Microarchitectural side channels.
- Kernel or hypervisor vulnerabilities.
- Running arbitrary user-provided native addons or WASM modules.
- Compatibility with arbitrary npm or Python packages.
- Durable user storage.
- A claim that portable worker-only mode is safe for malicious internet input.

## Proposed public API

The core API should be transport-neutral and stream events:

```ts
type SafeSageLanguage =
  | "sage"
  | "python"
  | "wolfram"
  | "magma"
  | "maple"
  | "matlab";

interface SafeSageLimits {
  sourceBytes: number;
  wallMs: number;
  cpuMs: number;
  memoryMb: number;
  outputBytes: number;
  displayBytes: number;
  filesystemBytes: number;
  filesystemFiles: number;
}

interface SafeSageRequest {
  source: string;
  language: SafeSageLanguage;
  limits: SafeSageLimits;
  files?: ReadonlyArray<{ path: string; data: Uint8Array }>;
  isolation?: "restricted" | "process" | "hardened";
}

type SafeSageEvent =
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "display"; mime: string; data: unknown }
  | { type: "result"; repr: string }
  | { type: "diagnostic"; name: string; message: string; stack?: string }
  | { type: "limit"; resource: string; limit: number }
  | { type: "stats"; wallMs: number; cpuMs?: number; peakMemoryBytes?: number }
  | { type: "done"; status: "ok" | "error" | "limited" | "killed" };

function safeSageEval(request: SafeSageRequest): AsyncIterable<SafeSageEvent>;
```

The result should report the isolation guarantees actually in force. A caller
must not be allowed to request `hardened` and silently receive worker-only
enforcement.

## Evaluation architecture

```text
HTTP/WebSocket/static UI
          |
          v
trusted admission controller
  - validates request/source size
  - applies authentication/rate/concurrency limits
  - selects an isolation provider
          |
          v
fresh evaluator child process
  - stripped environment and empty working directory
  - all parsing/lowering/compilation inside child
  - safe compiler mode and restricted globals
  - SafeHostAdapter + capped memfs
  - vetted Sage.js/FLINT assets only
          |
          v
length-delimited event channel with byte quotas/backpressure
          |
          v
parent supervisor
  - wall timer
  - CPU/RSS enforcement or monitoring
  - output/display quotas
  - unconditional process-tree cleanup
```

Each evaluation should be stateless by default. Persistent worksheets can be
added later as a child process per session with idle TTL and cumulative limits.
They should not weaken the one-shot evaluator.

## Safe host capabilities

`SafeHostAdapter` should be a separate implementation, not a mode switch
scattered throughout `NodeHostAdapter`.

Initially allowed:

- capped cryptographic randomness;
- bounded hashing and compression;
- serialization that returns data-only SagePack records;
- read/write/list/stat operations inside a private memfs;
- a small synthetic environment and platform description; and
- vetted FLINT and symbolic backends.

Initially denied:

- host filesystem paths and file descriptors;
- symlinks or links outside memfs;
- subprocesses and shells;
- HTTP, DNS, TCP, UDP, and other network access;
- arbitrary environment access or mutation;
- multiprocessing and worker creation;
- inspector/debug APIs;
- arbitrary `require`, dynamic import, native addons, WASI modules, or FFI;
- graphics saves to host paths; and
- user-selected native libraries.

Memfs paths must be normalized against a virtual root, with no host symlinks,
device nodes, or path traversal. Quotas must be checked before allocation and
on every growth operation. A virtual file manifest may be returned as an
explicit result rather than being copied automatically to the host.

## Process and OS isolation

### Node process layer

The evaluator child should start with:

- a minimal immutable entrypoint;
- a blank/minimal environment with no credentials;
- no inherited listening sockets or sensitive file descriptors;
- `--permission` with network, child-process, worker, inspector, FFI, WASI,
  and filesystem writes denied;
- filesystem reads limited to exact immutable runtime assets;
- native addons limited to the vetted Sage.js FLINT addon when required; and
- a conservative V8 heap limit.

The child should evaluate directly when Node permissions are the primary
portable defense. Node documents that permission settings do not inherit into
worker threads, so an allowed child-created worker must not accidentally regain
authority.

Node also documents that its permission model is not a malicious-code sandbox.
In particular, same-user cross-process debugging/signaling remains an OS
concern. Hardened children must therefore run under an isolated/different OS
identity from the trusted service.

### Isolation provider interface

The supervisor should support providers rather than baking one container tool
into the API:

```ts
interface IsolationProvider {
  readonly guarantee: "restricted" | "process" | "hardened";
  spawn(request: NormalizedSafeSageRequest): EvaluationProcess;
}
```

Suggested providers:

- **Portable process**: Node permissions, V8 limit, wall timer, RSS monitoring.
- **Linux hardened**: cgroup v2, private PID/mount/network namespaces,
  dedicated/dynamic user, seccomp and/or AppArmor, read-only runtime assets,
  hard memory/CPU/PID limits, and process-tree kill.
- **Windows hardened**: Job Object plus restricted/AppContainer token,
  memory/CPU/process limits, and network/filesystem capabilities removed.
- **macOS hardened**: separate low-authority process with platform resource and
  filesystem controls; do not claim equivalence until independently audited.
- **External**: container, microVM, cluster job, or hosted sandbox service.

The process protocol must work unchanged across providers.

## Resource enforcement

| Resource | Restricted worker | Process isolated | Hardened |
| --- | --- | --- | --- |
| Wall time | timer + terminate | parent kills child | parent/OS kills process tree |
| CPU time | cooperative checks or `worker.cpuUsage()` polling | measured/soft process limit | hard OS accounting/limit |
| V8 heap | worker `resourceLimits` | V8 CLI heap limit | V8 plus OS memory limit |
| Native/external memory | not complete | RSS monitor with overshoot | hard cgroup/Job Object limit |
| Filesystem | safe host adapter | memfs + Node permissions | memfs + OS-denied host writes |
| Network/process creation | hidden APIs only | Node permissions | OS namespace/token/seccomp |
| Output/display | parent byte counters | parent byte counters | parent byte counters |

CPU and memory statistics are useful output, but a reported measurement must
not be confused with enforcement. Native synchronous code can bypass compiler
interrupt checks, so wall-time and hard resource violations ultimately require
terminating the process.

## Compiler/runtime hardening

Add an explicit safe compilation mode with focused adversarial tests. It
should at minimum:

- reject `%js` and any equivalent raw-JavaScript syntax;
- reject or mediate dangerous JavaScript property names;
- prevent access to `eval`, `Function`, `process`, `require`, module loaders,
  inspector facilities, and host globals;
- avoid exposing compiler/runtime objects to evaluated code;
- freeze or copy capability objects passed to user code;
- ensure Python `eval` and `exec` re-enter the safe compiler path;
- enforce source/AST/generated-code size limits;
- keep completion and inspection inside the same boundary; and
- ensure Wolfram/Magma/Maple/Matlab lowering cannot generate privileged forms.

This mode is valuable defense in depth and will make accidental capability
leaks easier to detect. It must not be presented as an alternative to process
and OS containment.

## Streaming protocol and service

The first server should favor a simple HTTP streaming endpoint:

- `POST /v1/evaluate` with a JSON or multipart request;
- streamed length-prefixed JSON or NDJSON events;
- a separate cancellation endpoint keyed by an unguessable evaluation ID;
- strict request, header, source, upload, and concurrency limits; and
- no persistent session state.

Server-Sent Events are also viable for one-way results. WebSockets should be
reserved for persistent sessions, stdin, bidirectional interrupts, or richer
notebook interaction. A raw TCP protocol is unnecessary initially.

A SageCell-style UI should be a thin client of the same event protocol. It
must render rich data through a MIME allowlist, escape text, reject active
HTML/JavaScript by default, and apply its own display-size limits.

## Browser-only SageCell option

The browser/WASM kernel is a distinct, especially attractive deployment:

- it can be served as static files;
- computation consumes the student's machine rather than server capacity;
- worker replacement already interrupts infinite synchronous loops;
- stdout and rich graphics already stream across a structured boundary; and
- CoWasm/WASI already gives FLINT a memfs.

This route needs a restrictive Content Security Policy, especially
`connect-src`, and preferably an isolated origin or sandboxed iframe so escaped
worker code cannot access valuable origin storage or credentials. The current
runtime requires dynamic code generation in the evaluator worker. Browser
sandboxing and CSP are defenses; compiler hardening should still be shared with
the server evaluator.

The main limitation is native/WASM feature parity. A static SageCell can ship
before full parity if unsupported operations fail clearly and its advertised
surface is tested against the intended teaching material.

## Delivery phases

### Phase 0: threat model and adversarial corpus

- Adopt this threat model and name the guarantees precisely.
- Add non-destructive escape tests for constructors, prototypes, imports,
  dynamic code, host calls, environment, filesystem, sockets, and processes.
- Add output, compiler, memory, recursion, and native-long-call stress cases.
- Decide default limits and supported languages.

Exit criterion: tests demonstrate current escapes and define what every later
phase must deny or contain.

### Phase 1: restricted evaluator

- Add safe compiler mode.
- Add `SafeHostAdapter` and capped memfs.
- Add source/output/display/file quotas and backpressure.
- Add worker V8 limits and CPU accounting where available.
- Expose the `AsyncIterable<SafeSageEvent>` API.

Exit criterion: robust against accidental classroom mistakes, explicitly
labeled non-adversarial.

### Phase 2: process-isolated evaluator

- Move compilation and evaluation into a fresh child process.
- Add Node permissions, stripped environment, immutable runtime asset layout,
  process kill, protocol framing, and crash handling.
- Guarantee cleanup after success, error, timeout, disconnect, or parent
  shutdown.

Exit criterion: useful default for controlled classroom deployments, with a
documented Node/OS residual-risk statement.

### Phase 3: hardened Linux provider and service

- Add cgroup, namespace, identity, syscall, network, and process-tree controls.
- Add admission control, authentication hooks, rate limits, audit records, and
  operational metrics.
- Build the HTTP streaming service and SageCell UI.
- Run fuzzing and an independent security review before a public deployment.

Exit criterion: explicit adversarial public-input support on the audited Linux
configuration.

### Phase 4: browser SageCell and additional platforms

- Package a static browser UI around the WASM kernel.
- Add CSP/origin deployment guidance and feature-coverage reporting.
- Implement and audit Windows and macOS hardened providers, or clearly report
  a lower guarantee on those platforms.
- Consider persistent WebSocket sessions with cumulative quotas and TTL.

## Testing requirements

- Every denied capability needs a direct regression test and at least one
  alternate escape-path test.
- Test both plain Sage/Python and every foreign frontend.
- Fuzz source parsing, generated JavaScript size, IPC decoding, SagePack,
  display records, and memfs paths.
- Test output backpressure with a deliberately slow consumer.
- Test child crashes, `process.exit`, OOM, native aborts, timeout during
  compilation, timeout during FLINT work, parent disconnect, and server exit.
- Confirm no child survives a completed or cancelled evaluation.
- Verify that requests cannot observe prior globals, files, environment, RNG
  state when deterministic mode is requested, or native handles.
- Run the adversarial suite under every claimed isolation provider in CI.
- Treat sandbox escapes as security issues with a documented disclosure and
  patch process.

## Open design questions

- Should the package be named `safe-eval`, or should `safe` be reserved for the
  hardened provider while portable modes use `restricted-eval`?
- What native FLINT surface is acceptable under Node's required
  `--allow-addons` permission?
- Should plotting return only structured Plotly data, or also allow bounded
  raster/vector export inside memfs?
- Which parts of the Python standard library belong in the initial safe
  capability allowlist?
- Is deterministic randomness desirable for assignments and grading?
- What limits should be hard defaults versus deployment policy?
- Is stateless execution sufficient for the first SageCell, or is a
  process-per-session worksheet required?
- Can the browser SageCell cover the target books before full native parity?

## References

- Node.js VM warning: <https://nodejs.org/api/vm.html>
- Node.js worker resource limits and CPU usage:
  <https://nodejs.org/api/worker_threads.html>
- Node.js process permission model and its documented limitations:
  <https://nodejs.org/api/permissions.html>
- Existing Node kernel: `tools/kernel.ts`
- Existing evaluator: `tools/kernel-evaluator.ts`
- Existing broad Node host: `tools/host.ts`
- Existing browser/WASM kernel: `packages/flint-wasm/kernel.mjs`
- Existing browser/WASM architecture notes: `packages/flint-wasm/README.md`
