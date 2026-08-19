---
title: "Hyperelliptic curves and local Frobenius data"
---
# Hyperelliptic curves and local Frobenius data

Sage.js supports smooth genus-2 and genus-3 curves written

```text
y^2 + h(x)y = f(x)
```

over `QQ` and finite fields. The public results are exact. Sage, Magma, PARI,
smalljac command-line programs, and rforest executables are not runtime
dependencies.

## Local polynomials and point counts

For a curve over `GF(q)`, `frobenius_polynomial()` returns
`det(X - Frob_q)`. The point-count and zeta methods reuse that one cached
polynomial:

```python
R = PolynomialRing(GF(101), "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1)

C.frobenius_polynomial()
C.cardinality()
C.cardinality(extension_degree=5)
C.count_points(5)
C.zeta_function()
```

`algorithm="auto"` uses the native full-polynomial smalljac backend for its
validated genus-2 prime-field models. `algorithm="exhaustive"` counts over
the first `g` extensions and reconstructs the exact polynomial with Newton
identities. The exhaustive implementation is also the fallback for genus 3,
finite extension fields, and characteristic 2.

For a curve over `QQ`, `local_lpolynomial(p)` returns the good Euler numerator
`det(1 - T*Frob_p)`. The plural API traverses a closed prime interval in
deterministic order and omits bad or model-excluded primes:

```python
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**5 + x + 1)

C.local_lpolynomial(101)
C.local_lpolynomials(2, 10**6)
for chunk in C.local_lpolynomial_chunks(2, 10**6, chunk_size=4096):
    consume(chunk)
```

The chunk iterator bounds Python result storage while retaining one batched
smalljac workflow. A singular call at a bad prime raises `ArithmeticError`;
Sage.js never substitutes a good-reduction polynomial. These methods compute
local data only: global bad Euler factors, conductors, root numbers, and
complex L-series are outside this API.

## Research local-data streams

`local_data` is the bounded-memory interface for long scans. Unlike
`local_lpolynomials`, it yields one record for every prime in the closed
interval. A prime at which the supplied model cannot be reduced is retained as
an explicit `omitted` record instead of disappearing from the stream:

```python
R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**7 + x + 1)

for row in C.local_data(5, 10000, extension_degrees=2):
    if not row.available:
        print(row.prime, row.status, row.reason)
        continue
    print(
        row.prime,
        row.lpolynomial,
        row.jacobian_order,
        row.twist_order,
        row.curve_point_counts,
        row.p_rank,
    )
```

Every available record contains:

- the exact ascending coefficients and polynomial `det(1-T*Frob_p)`;
- `L_p(1)`, the Jacobian order, and `L_p(-1)`, the twist order;
- requested curve point counts over `GF(p^n)`;
- the p-rank, ordinary predicate, and normalized first-half coefficients;
- selected and actual backends, exact/fallback status, stage timings, and a
  compact certificate summary.

Use `include_certificates=True` to retain complete genus-3 order evidence in
memory. The default `cache_size=0` prevents a scan from growing the curve's
ordinary local-factor cache. A positive value retains at most that many
stream-produced factors, without evicting entries that existed before the
stream. `chunk_size` bounds the number of prime rows admitted to one native
window; it therefore bounds Python/native result storage as well as output
batching.

Progress and cancellation are checked at safe stage and prime boundaries:

```python
state = {"stop": False}

def progress(event, details):
    if event == "record":
        print("finished", details["prime"])

stream = C.local_data(
    5,
    10**6,
    progress=progress,
    cancel=lambda: state["stop"],
)
```

Direct iteration raises `LocalDataCancelled` after the last complete record.
JSONL export treats cancellation as a normal checkpoint and returns
`status="cancelled"`:

```python
summary = stream.export_jsonl("local-data.jsonl")

# Later, with the same curve and request:
summary = C.local_data(5, 10**6).export_jsonl(
    "local-data.jsonl", resume=True
)
```

The exporter flushes complete records independently. Resume validates the
schema, curve equation, interval, options, selected backend, every derived
invariant, and uninterrupted prime coverage before appending. A partial final
line is discarded; an inconsistent complete line fails closed. No prime is
silently duplicated or skipped.

The first JSONL line is a versioned provenance header containing the exact
rational model, request, normalization, and backend versions. Unbounded
integers use decimal strings, so JavaScript and database importers cannot lose
precision. Timings are excluded by default to make complete files byte-for-byte
deterministic across platforms. They may be included explicitly for profiling.

Files can be read lazily and independently verified:

```python
from sagejs.hyperelliptic_curves.local_data import (
    iter_local_data_jsonl,
    local_data_jsonl_header,
)

header = local_data_jsonl_header("local-data.jsonl")
for row in iter_local_data_jsonl("local-data.jsonl"):
    consume(row)
```

The iterator reconstructs the polynomial and recomputes the Jacobian order,
twist order, extension counts, p-rank, and ordinary predicate from its exact
coefficients. Full certificates use a versioned integer-safe representation;
Mumford divisors are serialized by their ascending `u` and `v` coefficients,
never as implementation pointers.

## Saving and indexing computed data

There are three useful persistence levels, depending on the intended lifetime
and size of a computation:

- `save`/`load` preserve a modest Sage.js object graph, including exact
  integers and polynomials, in a binary `.sobj` file.
- `dumps`/`loads` provide the same safe SagePack representation as bytes. This
  is convenient for a database BLOB or a message payload.
- The canonical JSONL exporter above is the preferred archival and interchange
  format for a long scan. It is streaming, independently verifiable,
  resumable, and readable without Sage.js.

For example, a small result can be materialized and saved without converting
its mathematical values to strings:

```python
stream = C.local_data(5, 1000, extension_degrees=2)
snapshot = {
    "provenance": stream.provenance(),
    "rows": [
        {
            "prime": row.prime,
            "status": row.status,
            "lpolynomial": row.lpolynomial,
            "jacobian_order": row.jacobian_order,
            "point_counts": row.curve_point_counts,
        }
        for row in stream
    ],
}

save(snapshot, "curve-local-data")       # writes curve-local-data.sobj
snapshot = load("curve-local-data")

packet = dumps(snapshot)                  # a bytes object
assert loads(packet) == snapshot
```

Materialize stable values such as those above, rather than attempting to save
the lazy stream, its progress/cancellation callbacks, or native implementation
objects. SagePack is a safe data-only Sage.js round-trip format: loading it does
not import constructors selected by the input or execute serialized code. For
long-running or cross-language work, retain the JSONL file as the source of
record and regard an `.sobj` file as a convenient Sage.js snapshot.

### SQLite

Sage.js includes Python's everyday `sqlite3` DB-API surface. SQLite is useful
when records must be indexed by curve and prime, queried incrementally, or
shared with other analysis programs. A practical design stores both
cross-language scalar columns and a SagePack BLOB for reconstructing the
polynomial immediately:

```python
import json
import sqlite3

scan_id = "x7+x+1:g3:v1"
first = 5
last = 10**6
options = {
    "algorithm": "rforest",
    "chunk_size": 4096,
    "extension_degrees": 2,
}

db = sqlite3.connect("hyperelliptic-local-data.sqlite3")
db.execute("PRAGMA journal_mode=WAL")
db.executescript("""
CREATE TABLE IF NOT EXISTS scans (
    scan_id TEXT PRIMARY KEY,
    provenance BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS local_factors (
    scan_id TEXT NOT NULL,
    prime INTEGER NOT NULL,
    status TEXT NOT NULL,
    backend TEXT NOT NULL,
    coefficients_json TEXT,
    lpolynomial BLOB,
    jacobian_order TEXT,
    twist_order TEXT,
    p_rank INTEGER,
    ordinary INTEGER,
    PRIMARY KEY (scan_id, prime),
    FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
);
""")

# Save and check the complete request before resuming any partial table.
request = C.local_data(first, last, **options)
provenance = request.provenance()
stored = db.execute(
    "SELECT provenance FROM scans WHERE scan_id=?", (scan_id,)
).fetchone()
if stored is None:
    db.execute(
        "INSERT INTO scans(scan_id, provenance) VALUES (?, ?)",
        (scan_id, memoryview(dumps(provenance))),
    )
    db.commit()
elif loads(stored[0]) != provenance:
    raise ValueError("scan_id already belongs to a different request")

row = db.execute(
    "SELECT max(prime) FROM local_factors WHERE scan_id=?", (scan_id,)
).fetchone()
resume_at = first if row[0] is None else int(row[0]) + 1

insert = """
INSERT INTO local_factors(
    scan_id, prime, status, backend, coefficients_json, lpolynomial,
    jacobian_order, twist_order, p_rank, ordinary
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(scan_id, prime) DO NOTHING
"""

def database_row(row):
    coefficients = None
    polynomial = None
    if row.available:
        coefficients = json.dumps(
            [str(value) for value in row.coefficients], separators=(",", ":")
        )
        polynomial = memoryview(dumps(row.lpolynomial))
    return (
        scan_id,
        int(row.prime),
        row.status,
        row.backend,
        coefficients,
        polynomial,
        None if row.jacobian_order is None else str(row.jacobian_order),
        None if row.twist_order is None else str(row.twist_order),
        row.p_rank,
        None if row.ordinary is None else int(row.ordinary),
    )

# A transaction per batch gives bounded memory and a useful crash checkpoint.
if resume_at <= last:
    pending = []
    for local_row in C.local_data(resume_at, last, **options):
        pending.append(database_row(local_row))
        if len(pending) == 1000:
            db.executemany(insert, pending)
            db.commit()
            pending = []
    if pending:
        db.executemany(insert, pending)
        db.commit()

db.close()
```

`memoryview(dumps(value))` binds SagePack bytes as a SQLite BLOB; a retrieved
BLOB can be passed directly to `loads`. The duplicated
`coefficients_json` column is intentional: it contains decimal strings and is
therefore exact and usable from Julia, PARI/GP, R, ordinary Python, or a web
application that does not understand SagePack.

SQLite `INTEGER` is a signed 64-bit type. The checked prime ranges fit in it,
but Jacobian orders and polynomial coefficients need not, so the example
stores those exact integers as decimal `TEXT`. Do not convert them to JSON
numbers or floating point. If SQL must sort or filter very large values by
magnitude, add an indexed sign and decimal-digit-count column alongside the
exact text. Keep `status` rows even when `lpolynomial` is `NULL`; otherwise a
failed or excluded model prime becomes indistinguishable from a scan that
never reached that prime.

The database example is restartable at transaction boundaries, while the
canonical JSONL exporter provides stronger validation of every derived field
and uninterrupted prime coverage. A robust research workflow often keeps the
JSONL file as the immutable computational record and builds one or more SQLite
databases from it as disposable query indexes.

## Jacobians

See [Jacobian arithmetic for genus-2 and genus-3 hyperelliptic
curves](hyperelliptic-jacobian-arithmetic.md) for the representation, Cantor
formulas, enumeration and structure algorithms, native certification kernel,
examples, and performance boundaries.

Odd-degree genus-2 and genus-3 models over odd-characteristic finite fields
have canonical reduced Mumford divisors `(u,v)`, generalized Cantor
arithmetic, exact scalar multiplication, element orders, bounded enumeration,
and basic group structure:

```python
J = C.change_ring(GF(101)).jacobian()
J.order()
J.zero()
D = J([u, v])
2 * D
J.group_structure()
```

`J.order()` is derived from the cached local polynomial. Exact invariant
factors are verified to divide successively and multiply to the Jacobian
order. The native smalljac group backend is available only for its documented
odd-degree genus-2 domain; bounded ordinary-Python structure computation is
the fallback for small groups. Sage.js does not return an embedded abelian
group until generators and relations are certified.

Even-degree models still have exact local polynomials and point counts, but
their two-points-at-infinity Jacobian representation is not yet implemented.
Characteristic-2 Jacobian arithmetic is also an explicit capability boundary.
Calls to `jacobian()` on those models fail clearly instead of constructing an
incomplete group.

## Genus 3

The explicit `algorithm="rforest"` backend combines exact Hasse--Witt
residues, exact Weil-constrained lift enumeration, and certified
Jacobian/twist order filters. A modular residue is never reported as a full
local polynomial: completion must leave exactly one exhaustive candidate or
use the exact reference fallback.

The pinned rforest backend accelerates dense Hasse--Witt batches for integral
curves, and one traversal serves a requested prime interval. Its timing
diagnostics keep the remainder forest, candidate enumeration, primary
Jacobian certification, twist certification, and fallback costs separate.
`algorithm="auto"` selects this path for supported odd-degree genus-3 models
when every native capability is present. One-off primes use it throughout the
checked native range; interval calls use it when the upper endpoint is at most
10000, the complete range measured by the acceptance benchmark. Larger
intervals remain on the exact reference path unless `algorithm="rforest"` is
requested explicitly.
