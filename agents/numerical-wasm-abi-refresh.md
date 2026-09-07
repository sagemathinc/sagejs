# Floating-FFI production Wasm ABI follow-up

Source base: `844e8667831e49252855a7cf9e09f7eab56cb726` (PR #199).
This is an integration repair, not a performance/default qualification.

## Cause and review

PR #179 added `Float64Buffer`, `double`, `double_ptr` and the transactional
`packed_float64_slice` shape to the shared ABI catalog. Declaration identities
include that catalog's hash, even for declarations not using the new types.
The FLINT declaration therefore changed from
`3e7ab905105e52dd90c3d88dfa34da9eb334d0c73d853b74f52a4b295b9ea5fb` to
`6b5e510dbe7f92a94696b5b063b5753c7aac514adc53e67ba25c745fdf752868`.
Generated production kernel identifiers correctly changed with their dependency
identities, but the pinned Wasm ABI inventory had not been refreshed.

The full-artifact Chromium jobs for #187 and #188 stopped at that inventory
check, after compiling 287 functions with zero unsupported functions. Their
passing narrow source-browser checks did not qualify the production artifact.

A fresh local FLINT pack was emitted and linked with the generated same-instance
ownership adapter, production export selection, and pinned prepared Wasm
dependencies. It has the same 372 exports and unchanged import records. Mapping
the 14 changed module identifiers to their predecessors produces exactly the
previous export records: no function/memory export is added or removed, and no
new host capability is admitted. The inventory update retains exact identifiers;
it does not normalize away hashes or relax the fail-closed checker.

Only `native-kernels/kernel-flint.wasm` changes in the reviewed inventory. No
FLINT declaration function, mathematical algorithm, release tag, default backend
or production deployment changes in this follow-up.

## Validation and integration

The complete local production link passes all 15 exact module ABI inventories.
Receipt generation initially rejected borrowed dependencies outside this owned
worktree. Local copies of the receipt-relevant dependencies resolve that setup
problem without changing the shared install or relaxing receipt validation.
Packaging then resumed using the freshly linked artifacts, with identity
`sha256:fadac70f3a3205703f1c7863676e660a59edd0ec5494e6069a307180dfdbbd0d`.
Its FLINT kernel pack SHA-256 is
`10fe15e249d0c28a652dbf21698a71d48b6d8317bb25a9c2c0e1d5aa63e9f78e`.

Validation on that artifact passes:

- 15 production tests: exact ABI/path checks, receipt integrity, all
  hyperelliptic source families, public Node-Wasm and actual browser
  hyperelliptic routes, and the public advanced-gap corpus;
- the separate public advanced-gap corpus in Chromium;
- five production export/closure/resource checks, including the real FLINT
  adoption/borrowing/memory-growth/close lifecycle and former-crash HNF matrix.

Persistent release hosts remain reserved by the release lane. Their qualification
must not be inferred from these local checks. This is not a product release.

The prerequisite #179 also needs the integer/resource admission-guard correction
already carried by #180; do not merge its isolated original head as if this ABI
inventory repair were its only missing fix. This repair is locally validated
and should be non-draft for the automatic merge manager. Propagate the fixes
through the prerequisite stack before calling those older heads ready; their
historical failed checks are not retroactively green.
