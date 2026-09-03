# Native sanitizers and browser memory

The product receipt matrix cannot by itself prove C memory safety, and a
JavaScript heap counter cannot prove the operating-system footprint of a real
browser. These supplemental gates close those two boundaries without relabeling
one kind of evidence as another.

## Native component sanitizers

Build the exact locked cminpack and NLopt Wasm backends first. Their generated
source-closure reports authenticate the extracted upstream source, selected
translation units, generated configuration, and source locks. On the clean
Linux x64 candidate, run:

```sh
node scripts/numerical-computing/qualification/run-native-sanitizers.cjs \
  --output build/numerical-qualification/native-sanitizers/evidence.json
```

The command compiles the selected upstream C translation units and the small
qualification harnesses independently under ASAN, UBSAN, and LSAN. It records
the repository commit/tree, platform, compiler path/version/digest, exact
flags, source lock and build-report digests, source-closure identity, harness
and executable digests, commands, logs, status, and scope in an immutable JSON
document. The default refuses a dirty repository. `--allow-dirty` exists only
to reproduce a development failure and is not release evidence.

This is deliberately a `native-source-component-sanitizer-evidence` claim. It
does **not** claim that Wasm itself ran under ASAN. A release satisfies the
boundary only by pairing this evidence with the exact-candidate Wasm suites:

```sh
node --test \
  test/numerical-p3-backends/abi-fuzz.test.mjs \
  test/numerical-p3-backends/lm-wasm.test.mjs
node --test \
  test/numerical-p3-nlopt/abi-fuzz.test.mjs \
  test/numerical-p3-nlopt/backend.test.mjs
```

Those suites own packed-region corruption, allocation failure, callback
exceptions, cancellation, reentrancy, cleanup, artifact authentication, and
post-failure recovery. Native sanitizer evidence and Wasm boundary evidence
are both required and neither substitutes for the other.

### COBYLA disposition

The pre-disposition harness found a reproducible GCC 15 object-size UBSAN
failure in locked NLopt revision
`6e6593f131ba3a38bc9edbed0a357bc01526e54b`, at `cobyla.c:542`. ASAN,
LSAN, and pointer-overflow-only UBSAN did not find an allocation-range access;
the failure arises from the old f2c one-based subarray-pointer shifts. This is
the same class tracked in [upstream NLopt issue 611](https://github.com/stevengj/nlopt/issues/611).
It remains formal C undefined behavior, so the campaign does not suppress the
object-size check or call that source sanitizer-clean. The final qualification
must cover only the NLopt algorithms actually retained in the artifact.
COBYLA/nonlinear constraints remain explicitly unsupported pending a separate,
reviewed replacement such as PRIMA.

## Real-browser process-tree memory

After building the browser artifact and installing real Playwright browser
executables, run each engine into a separate empty ignored directory:

```sh
node scripts/numerical-computing/qualification/run-browser-memory.cjs \
  --engine chromium --kind browser \
  --output build/numerical-qualification/browser-memory/chromium
node scripts/numerical-computing/qualification/run-browser-memory.cjs \
  --engine firefox --kind browser \
  --output build/numerical-qualification/browser-memory/firefox
node scripts/numerical-computing/qualification/run-browser-memory.cjs \
  --engine webkit --kind browser \
  --output build/numerical-qualification/browser-memory/webkit
node scripts/numerical-computing/qualification/run-browser-memory.cjs \
  --engine chromium --kind worker \
  --output build/numerical-qualification/browser-memory/worker
```

The focused corpus first runs a zero-byte baseline, then touches 64 MiB in the
Sage.js browser worker, and finally interrupts a nonterminating evaluation and
proves that the replacement worker executes a fresh program. The ordinary
qualification collector samples the collector plus its live descendants from
Linux `/proc`. The driver rejects a receipt unless all three cases pass with
authenticated `process_tree` measurements and the pressure peak exceeds the
baseline by at least 32 MiB. It writes the full source/artifact-bound receipt
and a smaller immutable summary that binds that receipt. A remote browser,
synchronous launch, missing descendant, JavaScript heap-only measurement,
failed worker replacement, or smaller delta fails closed.

These commands are ready for the final integrated candidate. Checked-in
templates remain `pending`; development runs are not copied into a release
matrix after source or artifact bytes change.

## Producer authentication and release aggregation

Supplemental jobs authenticate every external executable and every bound
source, harness, build report, module, and ignored candidate artifact before
execution and again after the last operation. Ordinary concurrent rebuilds or
tool replacement therefore invalidate collection. The immutable evidence
records the producer-local canonical path, version, byte count, and digest.

The later release-aggregation job must not reopen those producer-local compiler,
Node, Python, or browser paths: macOS and Windows paths do not exist on the Linux
aggregator. It validates their recorded identities structurally and cross-binds
them through uploaded receipts and binding documents. Repository inputs,
generated build reports, product artifacts, receipts, and manifests are a
different class: the workflow must upload them and restore their exact
repository-relative paths so aggregation can hash and authenticate them. This
division preserves producer-side byte authentication without making a
split-platform release gate depend on another host's filesystem.
