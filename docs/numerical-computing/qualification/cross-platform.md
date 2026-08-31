# Cross-platform collection and reporting

Use the same checked-in Node command on every persistent release host. Native
Windows means a native Windows checkout and Node process, not WSL, MSYS2, or
MinGW. Shell glob expansion is unnecessary; all paths are explicit and the
implementation uses Node filesystem/process APIs.

## Collect one measured receipt

Prepare the exact candidate on the host, build its artifacts, author the
host/runtime-specific capability draft, and bind it. Then run one cold
collector process:

```sh
node scripts/numerical-computing/qualify.cjs run --corpus bench/DOMAIN/domain.corpus.json --adapter bench/DOMAIN/domain-adapter.cjs --capabilities build/domain/capabilities.json --artifact solver=build/domain/solver.wasm --artifact solver-gzip=build/domain/solver.wasm.gz --output build/numerical-receipts/DOMAIN-HOST.receipt.json
```

The command exits zero only when every required capability is both manifest-
available and adapter-observed, every warmup and measured sample has passing
failure/correctness/validation evidence, and repeated outcomes/values are
deterministic. It still writes a failed receipt when case-level evidence is
missing or wrong. Binding or adapter-initialization failures stop before a
receipt because there was no valid run identity to record.

Immediately verify the receipt against the host which measured it:

```sh
node scripts/numerical-computing/qualify.cjs verify build/numerical-receipts/DOMAIN-HOST.receipt.json --require-clean
```

There is no `--platform` flag. The collector maps only the supported native
host pairs:

| Host | Derived receipt platform |
|---|---|
| Linux x64 | `linux-x64` |
| Linux ARM64 | `linux-arm64` |
| macOS ARM64 | `macos-arm64` |
| native Windows x64 | `windows-x64` |

Use distinct output filenames and preserve receipts immutably. An unreachable
host has no receipt. Record the infrastructure failure separately and rerun
that host; never copy or relabel another host's receipt.

## Browser, SEA, and worker subjects

The physical platform is always the collector host. The matrix also matches an
observed subject runtime. For example, browser rows distinguish Chromium,
Firefox, and WebKit with:

```json
{
  "subject_kind": "browser",
  "subject_name": "playwright-browser",
  "subject_engine": "chromium"
}
```

The adapter must exercise that browser and return its actual version. Create a
separate capability manifest and receipt for each engine. SEA and worker
adapters likewise return the executable or worker runtime actually invoked.
A Node-only adapter cannot produce browser, SEA, or worker evidence.

## Define the required matrix

The release policy is explicit rather than inferred from whatever files happen
to be present. Each row pins corpus and mathematical source digests, backend,
physical platform, subject runtime, required capability IDs, and required
artifact names:

```json
{
  "schema": "sagejs.numerical-qualification-matrix-policy/v1",
  "id": "root-finding-release-candidate",
  "description": "Four native Node hosts plus separately collected browser rows.",
  "require_clean": true,
  "rows": [
    {
      "id": "linux-x64-node",
      "match": {
        "corpus_id": "root-finding-v1",
        "corpus_sha256": "REPLACE_WITH_64_HEX_DIGEST",
        "source_bundle_sha256": "REPLACE_WITH_64_HEX_DIGEST",
        "capability_manifest_id": "sha256:REPLACE_WITH_64_HEX_DIGEST",
        "backend_id": "dynamic-root-finding",
        "backend_version": "CANDIDATE-BACKEND-VERSION",
        "platform": "linux-x64",
        "subject_kind": "node",
        "subject_name": "node",
        "subject_version": "ACTUAL-NODE-VERSION",
        "subject_engine": null
      },
      "required_program_phases": ["P1", "P8"],
      "required_case_layers": [
        "definition-identity", "independent-residual", "differential-oracle",
        "conditioned-stress", "failure-semantics", "fuzz", "metamorphic"
      ],
      "required_capabilities": ["root.bisection", "root.brent", "root.secant", "root.newton"],
      "required_artifacts": [
        { "name": "sagejs-package", "sha256": "REPLACE_WITH_64_HEX_DIGEST" }
      ]
    }
  ]
}
```

Add rows for Linux ARM64, macOS ARM64, Windows x64, SEA, and each required
browser engine. Duplicate match envelopes are rejected even if their row IDs
differ. `required_program_phases` and `required_case_layers` are checked only
against passing cases in that exact receipt. Listing a phase on the corpus or a
capability in a draft does not satisfy the row by itself.

## Verify transferred receipts and generate the report

On the integration host, historical verification checks immutable content and
all recomputable semantics without pretending to remeasure the remote machine:

```sh
node scripts/numerical-computing/qualify.cjs verify incoming/linux-arm64.receipt.json --historical --require-clean
```

Generate JSON and Markdown from explicit receipts:

```sh
node scripts/numerical-computing/qualify.cjs report --policy build/root-finding-matrix.json --receipt incoming/linux-x64.receipt.json --receipt incoming/linux-arm64.receipt.json --receipt incoming/macos-arm64.receipt.json --receipt incoming/windows-x64.receipt.json --json build/root-finding-report.json --markdown build/root-finding-report.md
```

Or recursively load only files ending `.receipt.json`:

```sh
node scripts/numerical-computing/qualify.cjs report --policy build/root-finding-matrix.json --receipt-dir incoming --json build/root-finding-report.json --markdown build/root-finding-report.md
```

The report fails when a row is absent, duplicated, dirty when cleanliness is
required, backed by a failed receipt, missing a required capability, or missing
a required artifact. A missing row contains `null` receipt, bindings, and
metrics. It is never populated from another platform or from an average. Extra
receipts are listed as unmatched and do not satisfy a required row.

Historical validation is not a host signature. The release coordinator must
obtain each file through the trusted persistent-host job (and may externally
sign it). The final report records exact receipt IDs, commits, machine content
IDs, runtime versions, corpus/source/adapter/capability/artifact hashes, startup
measurements, per-case timing/memory summaries, and payload bytes so reviewers
can trace every accepted row back to its collected evidence.
