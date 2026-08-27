# LMFDB catalogs

Sage.js provides a typed interface to selected records from the
[L-functions and Modular Forms Database](https://www.lmfdb.org/). The initial
slice covers genus-2 curves over `QQ` and number fields.

The default is a tiny offline sample:

```python
from sage.databases.lmfdb import LMFDB, between

db = LMFDB()                         # identical to source="bundled"
record = db.genus2_curves["277.a.277.1"]
C = record.curve()

for record in db.number_fields.search(
    degree=3,
    discriminant_abs=between(1, 1000),
    sort=("discriminant_abs", "label"),
    limit=100,
):
    K = record.field("a")
```

Bundled coverage is explicitly a correctness and demonstration sample, not a
census. Inspect it with `collection.coverage()`.

## Explicit online queries

Network access is never implicit. Select it explicitly:

```python
online = LMFDB(source="online")
query = online.genus2_curves.search(
    conductor=between(1, 10**4),
    analytic_rank=0,
    sort=("conductor", "label"),
    limit=100,
)
print(query.explain())              # no request yet
records = list(query)               # bounded HTTPS request here
```

Online queries require a finite limit, use only schema-declared fields, and
follow pagination only on the configured API origin. The first query language
supports exact equality and inclusive `between` predicates. Normal tests use a
local fixture server; set `SAGEJS_LMFDB_LIVE=1` only to run the optional live
compatibility canary.

## Reproducible extracts

Any nonempty bounded result can be written as an atomic SQLite snapshot:

```python
path = query.snapshot("rank-zero-genus2.sqlite3")
frozen = LMFDB.open(path)
```

Opening performs SQLite integrity, adapter-version, row-count, and logical
record-digest checks and never accesses the network. User snapshots are
reported as local provenance; they are not release-signed datasets.

Records are immutable and preserve exact coefficients, normalized metadata,
the original source row, citations, proof-status flags, and a canonical record
digest. `.curve()` and `.field()` construct mathematical objects explicitly;
constructors themselves never query a database or network.

The larger installed-snapshot and R2 release architecture is specified in
[`agents/lmfdb-catalog-and-snapshots-plan.md`](../agents/lmfdb-catalog-and-snapshots-plan.md).
