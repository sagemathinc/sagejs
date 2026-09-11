# Bounded persistent reference screening

This supervisor removes per-field process startup without claiming competitive
qualification or independent replay. It reuses the existing PARI and Hecke
mathematical workers and imports `runner/screen-batch.py` for exact input,
terminal, ledger and controlled-host policies. It does not add a new backend.

The controlled CLI requires affinity exactly `{2}`, cgroup memory maximum
4 GiB and zero swap, enforced by the shared `require_controls`. Every worker
inherits those controls, single-thread environment settings, and its own process
group. The coordinator holds `/tmp/sagejs-opt-timing.lock` for the entire run;
there is no CLI control bypass or alternate lock. Provision the containing
systemd user service with `KillMode=control-group` so an uncatchable coordinator
death also stops descendants. SIGINT/SIGTERM are handled directly; SIGKILL and
power loss cannot execute Python cleanup.

## Controlled invocation (coordinator only)

Run inside the already provisioned controlled service, with a new output directory
and the **existing shared M0 ledger**, never a newly invented empty budget:

```sh
python reference/persistent/supervisor.py \
  --engine pari --executable /path/to/gp --worker reference/pari-screen.gp \
  --input candidates.json --output evidence/new-pari-session --ledger m0-ledger.json \
  --bits 200 --seconds 60 --startup-seconds 60

python reference/persistent/supervisor.py \
  --engine hecke --executable /path/to/julia --worker reference/hecke/screen.jl \
  --project /path/to/Hecke --depot /path/to/provisioned-depot \
  --input candidates.json --output evidence/new-hecke-session --ledger m0-ledger.json \
  --bits 200 --seconds 60 --startup-seconds 60
```

Paths above are relative to `bench/class-unit-groups/general-frontier`.
Input is the existing screening array of unique `label` and ascending exact
integer-string `coefficients` records (monic degree 2–10, at most 200 records).
Input hashing and parsing use the same byte snapshot. Executable, worker,
supervisor, shared validators, and relevant Julia project/manifest/transport
files are hashed; artifacts are checked again immediately before each spawn.

Current shared terminal validators support **200 bits only**. `--bits 100`
fails explicitly before launching; adding it later requires matching validator
support, not rewriting labels, rounding a 200-bit answer, or dropping outputs.
Requests use `frontier_case(...,200,1,1)` for PARI and the existing `FRONTIER1`
protocol for Hecke. Every request creates fresh field/order/context state even
when the process is retained. PARI pins `nbthreads=1`, `parisizemax=2 GiB`, and
`threadsizemax=2 GiB`; Hecke uses strict existing package caches and a clean
`@:@stdlib` load path. No package download or precompilation is performed.

## Measured boundaries and JIT

Each session has its own startup-ready receipt, then six fixed fresh-field
warmup receipts: imaginary class-three quadratic, real quadratic, rank-one
cubic, mixed quartic, rank-three biquadratic, and torsion-eight cyclotomic.
These fields are literal frozen fixtures in `WARMUPS`, not selected using
candidate success. Warmup is repeated after any failed sample forces a restart.
Startup or warmup failure stops the batch; it never permits unwarmed samples.
Sample failure is retained and the *next* candidate gets a new process; there
is no hidden retry of the failed sample or unbounded restart loop.

Startup, warmup, samples and shutdown are charged separately. Finite warmups do
not prove that all later methods are compiled. The Hecke bootstrap records
Julia `@timed` compile/recompile seconds as exact diagnostic strings alongside
the unchanged mathematical result. Their scope is `frontier_case`, not final
envelope serialization. On-demand JIT may still be included in a sample's
reported worker time. PARI has no corresponding Julia JIT field. All receipts
remain `qualification_evidence=false` and `independent_replay=false`.

Full compact stdout and stderr are retained. PARI's regulator is an approximation,
not an enclosure. Hecke's exact rational enclosure endpoints are checked for
positive order and radius below `2^-200`; required map/unit/probe shapes are
also checked. Those are screening sanity checks, **not** independent checks of
unit membership, complete groups, ideal identities, maps or fundamental units.
The PARI compact payload remains explicitly its native opaque text format.

## Accounting and failure behavior

Before dispatch, the existing ledger validator admits a durable reservation of
the deadline plus ten seconds for publication/cleanup. Non-shutdown admissions
also preserve fifteen unspent seconds for a charged shutdown if the next request
cannot be admitted. Successful accounting charges elapsed wall time through
publication plus one second, a conservative single-CPU charge. Pending
reservations, exhausted/invalid ledgers and missing ledgers fail closed.

Receipts are fsynced and atomically linked under exclusive new names, never
replaced. An immutable `run.json` prevents accidental reuse of an output directory.
SIGINT/SIGTERM kill the worker group, retain partial output in an interruption
receipt, and leave the entire pending reservation for explicit reconciliation.
Publication/accounting failures also leave pending state. No automatic refund,
reset, overwrite or restart can erase that condition.

Each exchange has an external wall deadline and combined 32 MiB pipe-output cap
(capture retains at most one additional byte to identify overflow). Timeout,
crash, output overflow, invalid framing or terminal failure kills/reaps the process
group. Unique PARI completion markers and strict Hecke terminal IDs prevent
misattributing ordinary stale/duplicate responses. Cleanup blocks repeated
interrupts while killing/reaping. A process that deliberately escapes its group
is outside the trusted-worker model; the enclosing service cgroup is the final
containment boundary.

## Offline and optional local validation

```sh
python reference/persistent/test_supervisor.py

# Optional local-only, uncontrolled protocol checks; do not run on opt:
python reference/persistent/local-smoke.py --local-uncontrolled \
  --engine pari --executable /local/gp --worker reference/pari-screen.gp
python reference/persistent/local-smoke.py --local-uncontrolled \
  --engine hecke --executable /local/julia --worker reference/hecke/screen.jl \
  --project /local/Hecke-environment --depot /local/depot
```

Offline fake workers cover same-process reuse, charged startup/warmup/shutdown,
timeout/restart and descendant cleanup, output limits, duplicate responses and
labels, immutable output, lock contention, exhausted/pending/missing budgets,
near-exhaustion cleanup, startup/warmup failure, interrupted reservations and
compact-output sanity. Live local checks use two small fresh fields in one
process and are explicitly uncontrolled diagnostics, not cost measurements for
the competitive panel.
