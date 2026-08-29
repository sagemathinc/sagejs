# LMFDB catalog and snapshot plan

## Status

**Architecture specification with the first vertical slice implemented,
2026-08-27.**

The implemented slice provides bundled and explicit-online providers for
genus-2 curves and number fields, typed immutable records, equality and
inclusive-range searches, exact object construction, provenance, and atomic
validated user-local SQLite snapshots. The release-signed installed provider,
R2 publication pipeline, larger datasets, and remaining collections are still
future phases of this plan.

This document specifies a research-facing Sage.js interface to records from the
[L-functions and Modular Forms Database](https://www.lmfdb.org/). It covers a
small bundled catalog, versioned downloadable SQLite snapshots, and explicit
live queries to the LMFDB HTTP API. All three modes expose the same typed
collections, records, queries, labels, and mathematical-object conversions.

The design follows:

- the implementation and provenance rules in [`ARCHITECTURE.md`](../ARCHITECTURE.md);
- Sage's useful mini/full
  [`CremonaDatabase`](https://doc.sagemath.org/html/en/reference/databases/sage/databases/cremona.html)
  precedent;
- the official [LMFDB access options](https://www.lmfdb.org/api/options),
  including search downloads, the HTTP API, `lmfdb-lite`, and the read-only SQL
  mirror;
- the current [LMFDB HTTP API contract](https://www.lmfdb.org/api/); and
- the existing Sage.js R2 content-addressed publication model documented in
  [`docs/webassembly-cloudflare-deployment.md`](../docs/webassembly-cloudflare-deployment.md).

The initial mathematical collections are elliptic curves over `QQ`, genus-2
curves over `QQ`, number fields, and higher-genus families with automorphisms.
The last collection is deliberately not called a general genus-3 curve
database: LMFDB currently catalogs special higher-genus families, not all
individual genus-3 curves over `QQ`.

## Executive decision

Implement one provider-independent catalog API with three data modes:

1. **bundled** -- a tiny, deterministic, cited sample shipped with Sage.js;
2. **installed** -- immutable, signed, indexed SQLite snapshots downloaded
   from a Sage.js Cloudflare R2 origin; and
3. **online** -- bounded, explicit queries to the LMFDB HTTP API.

The default `auto` mode searches installed data and then bundled data. It never
silently accesses the network. Network access requires an explicitly online
catalog or an explicit fetch/install command.

Large release snapshots are built from LMFDB's official read-only PostgreSQL
mirror by a pinned release workflow. End-user mathematical code never connects
directly to PostgreSQL. R2 stores immutable, content-addressed artifacts and
signed manifests; a failed or interrupted update cannot partially replace an
installed database.

Do not overload `HyperellipticCurve`, `NumberField`, or another mathematical
constructor with hidden database or network behavior. A database record is a
cheap immutable value; converting it to a mathematical object is an explicit
method such as `.curve()` or `.field()`.

## User experience

### One API, three providers

```python
from sage.databases.lmfdb import LMFDB, between

# Always available and offline.
db = LMFDB(source="bundled")

# A previously installed immutable snapshot.
db = LMFDB(source="installed", dataset="lmfdb-g2q", version="2026.08")

# Explicit bounded network access, with a local response cache when available.
db = LMFDB(source="online", cache=True)
```

The collection and record code is identical after provider selection:

```python
record = db.genus2_curves["277.a.277.1"]
C = record.curve()
J = C.jacobian()

for record in db.genus2_curves.search(
    conductor=between(1, 10**4),
    analytic_rank=0,
    sort=("conductor", "label"),
    limit=100,
):
    print(record.label, record.curve())
```

Number fields use their canonical LMFDB labels and defer construction until
requested:

```python
record = db.number_fields["3.1.23.1"]
K = record.field("a")

for record in db.number_fields.search(
    degree=3,
    discriminant_abs=between(1, 100000),
    class_number=1,
    sort=("discriminant_abs", "label"),
    limit=100,
):
    K = record.field()
```

Higher-genus LMFDB entries are exposed honestly as families or passports:

```python
families = db.higher_genus_families.search(
    genus=3,
    hyperelliptic=True,
    limit=100,
)
for record in families:
    print(record.label, record.signature, record.automorphism_group)
```

A family record may expose `.family()` and, when the source record contains a
validated equation, `.curve(parameters=...)`. It must not manufacture an
individual curve when parameters or an equation are absent.

### Installation and inspection

The initial CLI surface is:

```sh
sagejs database list
sagejs database info lmfdb-g2q
sagejs database install lmfdb-g2q
sagejs database install lmfdb-number-fields-d2-d6-disc1e8
sagejs database verify lmfdb-g2q
sagejs database remove lmfdb-g2q --version 2026.08
```

`install` displays the decoded size, record count, coverage statement,
license, and citations before downloading when attached to a terminal. A
noninteractive invocation requires an exact dataset identifier and accepts the
same fixed metadata without a prompt. It never chooses an unbounded number-field
snapshot from a vague name.

Installation is idempotent. Existing verified bytes are reused. `remove`
requires an exact dataset and version and never recursively targets a broad
workspace or home directory.

### Reproducible extracts

Any bounded result can become a small immutable local catalog:

```python
query = LMFDB(source="online").genus2_curves.search(
    conductor=between(1, 10000),
    analytic_rank=0,
    sort=("conductor", "label"),
    limit=500,
)
query.snapshot("rank-zero-genus2.sqlite3")

db = LMFDB.open("rank-zero-genus2.sqlite3")
```

The snapshot records the exact translated query, response identities,
retrieval time, schema adapter, logical record digest, and source URLs. Loading
it performs no network access.

## Public object model

### `LMFDB`

`LMFDB` is a factory for one catalog session. The accepted source modes are:

- `source="auto"`: installed snapshots in configured precedence, followed by
  bundled records; no network;
- `source="bundled"`: only shipped tiny data;
- `source="installed"`: one exact installed dataset/version or a deterministic
  configured set;
- `source="online"`: the official HTTP API, explicitly selected; and
- `LMFDB.open(path)`: one user-supplied Sage.js snapshot after complete
  validation.

Configuration includes request timeout, cache policy, maximum records and
bytes, accepted origin, and user data directory. A provider reports its exact
capabilities through `.capabilities()` rather than failing late with a host
module error.

### Collections

The first stable collection names are:

- `elliptic_curves`
- `genus2_curves`
- `number_fields`
- `higher_genus_families`

Collection names and Sage-facing field names are stable public API. Raw LMFDB
table and column names are adapter details. In particular, public callers use
`conductor` rather than the current `g2c_curves.cond` spelling and
`discriminant_abs` rather than relying on a backend-specific abbreviation.

Every collection supports:

- exact label lookup with `collection[label]` and `.get(label)`;
- `.search(...)` with validated collection-specific fields;
- deterministic `.sort(...)` or a `sort=` argument;
- bounded `.limit(...)` or a `limit=` argument;
- `.provider`, `.schema`, `.coverage()`, and `.citation()`; and
- query `.explain()` showing the provider, normalized predicate, ordering,
  limits, and translated backend request without executing it.

`search` returns a lazy, reiterable `LMFDBQuery`. Network activity can occur
only while iterating an explicitly online query or calling one of its fetch or
snapshot methods. The online provider requires a finite limit, defaults to
100, follows only LMFDB-provided next-page URLs on the configured origin, and
enforces LMFDB's current 100-row page and approximately 10,000-result total
limits. Installed queries may explicitly request `limit=None`.

### Predicates

The first query vocabulary is deliberately small:

- exact equality via a plain value;
- `between(lower, upper)` with inclusive endpoints;
- `one_of(values)`;
- `contains(value)` for schema-declared list fields;
- `is_null()` and `is_not_null()`; and
- booleans as exact booleans, never string truthiness.

Unsupported operators or fields raise before executing a query. Online
translation uses structured URL encoding and the LMFDB type prefixes; it never
concatenates caller text into a query expression. Installed translation uses
bound SQLite parameters and a fixed field/operator map. Provider-specific raw
queries are available only from an explicitly named low-level diagnostic API
and never masquerade as portable `search` results.

### Records

Records are immutable, typed, provider-independent values. Common fields are:

- `label`
- `kind`
- `source`
- `source_release`
- `source_url`
- `record_sha256`
- `retrieved_at`, when applicable
- `raw_data()`, a detached copy of the source record
- `provenance()`
- `citation()`
- `metadata_status(field)`

Collection-specific record classes expose normalized exact values and an
explicit constructor:

- `EllipticCurveRecord.curve()`
- `Genus2CurveRecord.curve()`
- `NumberFieldRecord.field(name="a")`
- `HigherGenusFamilyRecord.family()`

Record metadata is not automatically installed as a theorem in the resulting
mathematical object. For example, an LMFDB analytic rank remains record
metadata with its source proof flag; it does not silently populate a rigorous
Sage.js cache. Algorithms may accept a record explicitly as external evidence
only through a separately specified and validated interface.

Records survive canonical JSON serialization and equality compares the stable
normalized payload and source identity, not a live provider handle.

### Labels

LMFDB labels remain unchanged and are never conflated with Sage.js-internal
identifiers.

- An elliptic-curve record accepts an LMFDB label such as `11.a2`.
  `by_cremona_label("11a1")` is a distinct resolver because Cremona and LMFDB
  curve orderings can differ.
- A number-field label such as `3.1.23.1` follows LMFDB's
  degree/real-signature/absolute-discriminant/index convention.
- A genus-2 label such as `277.a.277.1` is preserved verbatim.
- Higher-genus refined-passport labels are preserved verbatim.

The existing local `EllipticCurve("37a")` constructor remains offline and
backed by the installed Cremona subset. Initial LMFDB work does not make any
mathematical constructor perform hidden network I/O. A future explicit
`lmfdb:` constructor syntax may be considered only after the catalog API is
stable, and even then it must resolve locally unless online behavior is
separately requested.

## Provider contract

All providers implement the same internal protocol:

```text
describe_collection(name)
lookup(collection, normalized_label)
execute(collection, normalized_query, projection, ordering, limit)
close()
```

The protocol returns source records to a collection-specific schema adapter.
The adapter validates and normalizes records before public construction. A
provider cannot return a public record directly and thereby bypass schema,
exactness, or provenance checks.

### Bundled provider

The bundled catalog is:

- generated, never hand-edited;
- small enough to have negligible compressed package impact;
- loaded lazily;
- deterministic and fully usable offline;
- explicitly described as a sample, never as a complete database; and
- accompanied by its selection algorithm, seed, source release, logical
  digest, license, and citations.

Selection is stratified for mathematical and implementation coverage rather
than merely taking the first labels. The initial genus-2 sample should cover
odd- and even-degree equations, nonzero `h`, split and nonsplit infinity,
several ranks and automorphism groups, locally insoluble examples, and records
with both proved and unproved metadata. The number-field sample should cover
degrees, signatures, discriminant sizes, monogenic and nonmonogenic examples,
class groups, unit ranks, and fields already used by Sage.js correctness
corpora.

The exact size is set by a measured package budget. A reasonable initial
target is hundreds, not tens of thousands, of records and at most a few
compressed MiB across all collections.

### Installed SQLite provider

Installed snapshots are the primary research-scale mode. SQLite is appropriate
because Sage.js already exposes a Python-compatible synchronous `sqlite3`
surface on Node, queries are local and deterministic, and an immutable file is
easy to hash, cache, copy, cite, and archive.

The initial installed provider is a Node capability. Browser and pure-Wasm
sessions report it unavailable rather than importing `node:sqlite` late.
Bundled and online providers remain portable. A future browser SQLite or
IndexedDB implementation may implement the same provider protocol without
changing mathematical code.

An installed database is opened read-only. The provider checks:

- the outer signed manifest;
- artifact SHA-256 and byte size;
- SQLite magic, page and schema versions;
- `PRAGMA quick_check` or the documented stronger verification mode;
- required metadata and indexes;
- collection adapter identity;
- logical record count and digest; and
- no writable path or attached database is needed for ordinary queries.

A user-supplied snapshot is not trusted merely because its tables have familiar
names. It passes the same validation except that an unsigned snapshot is
reported as `user-local` rather than `sagejs-release` provenance.

### Online provider

The online provider uses the official HTTPS API, not HTML scraping. It:

- allowlists the configured HTTPS origin and expected `/api/` path;
- emits `_format=json`, `_fields`, `_sort`, and typed query parameters;
- requests only fields needed by the adapter and caller projection;
- enforces time, response-byte, page, and total-record limits;
- accepts pagination only from a validated same-origin `next` URL;
- validates content type and complete JSON before record publication;
- rejects unknown or incompatible schema rather than guessing;
- identifies itself honestly as a live, mutable source; and
- optionally caches complete responses by canonical URL plus response digest.

Sage.js's synchronous `urllib.request` capability is sufficient on Node.
Browser use is capability-gated: direct LMFDB access may depend on CORS, and an
embedding may choose to install a network capability. If a Sage.js relay is
later required, it is a read-only allowlisted query relay with the same strict
limits, not a general proxy.

The online provider does not promise queries that the official API cannot
express. It explains the unsupported predicate and recommends a search-page
download, installed snapshot, or local filtered snapshot.

### Auto provider

`source="auto"` has deterministic precedence:

1. an exact explicitly configured installed dataset;
2. other compatible installed datasets ordered by configured priority and
   then version;
3. the bundled sample.

A miss reports every provider checked and suggests exact install or online
commands. Auto never falls through to the network. This property is tested as
a security, reproducibility, and user-expectation contract.

## Snapshot schema

### Logical representation

The stable public record schema is independent of SQLite and LMFDB's internal
PostgreSQL schema. Exact integers use canonical decimal strings in stored JSON;
coefficient arrays contain canonical decimal strings; rationals use normalized
numerator and positive denominator strings. No JSON number is trusted for an
unbounded exact value.

Each record contains:

- a stable schema and adapter version;
- collection and label;
- normalized public payload;
- canonical source payload sufficient for audit and future migration;
- per-field proof/conditional status where LMFDB supplies it;
- source table, release, object URL, and retrieval/build identity; and
- SHA-256 of the framed canonical record.

LMFDB fields that currently contain stringified Python literals are parsed by
a small schema-specific exact parser. They are never passed to `eval`, the
Sage preparser, JavaScript evaluation, or a symbolic parser with names or
function calls.

### SQLite layout

Every artifact contains:

- `sagejs_dataset_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
- one collection-specific table with normalized indexed columns;
- `normalized_json TEXT NOT NULL`;
- `source_json TEXT NOT NULL`;
- `record_sha256 TEXT NOT NULL`; and
- fixed indexes declared by the dataset schema.

The database `application_id`, `user_version`, page size, journal mode, and
creation procedure are fixed. The release builder inserts rows in canonical
label order and uses a pinned SQLite version and deterministic finalization so
two clean builds produce byte-identical artifacts. A separate logical digest
over framed canonical records remains authoritative for data identity and is
checked even when inspecting a development artifact made by another SQLite
version.

Indexed exact integers that may exceed signed 64-bit SQLite range are stored as
decimal text plus a private canonical sort key. This supports exact equality
and ordering without coercion to floating point. The sort key is an internal
database representation and never appears in a public record.

### Dataset identities and coverage

Dataset identifiers describe mathematical coverage rather than storage
implementation. Initial candidates are:

- `lmfdb-g2q` -- the complete published genus-2-over-`QQ` collection for one
  source release;
- `lmfdb-ecq-conductor-<bound>` -- an elliptic-curve slice when useful beyond
  the existing Cremona data;
- `lmfdb-number-fields-d<range>-disc<bound>` -- an explicit bounded
  number-field slice;
- `lmfdb-higher-genus-automorphisms` -- higher-genus families/passports with
  their precise source coverage; and
- `sagejs-genus3-curated` -- a separate, cited corpus of individual genus-3
  curves from literature and Sage.js oracle fixtures, never represented as
  LMFDB data.

The manifest contains a human- and machine-readable coverage predicate. The
provider rejects a query as outside coverage or returns an explicitly partial
result; it never silently interprets absence from a slice as mathematical
nonexistence.

## R2 distribution contract

### Object layout

The recommended public data origin is a dedicated credential-free hostname,
for example `https://data.sagejs.org`, backed by a private R2 bucket and a
minimal Cloudflare Worker. The final hostname is a deployment decision; clients
use a configurable origin with a pinned production default.

Conceptual immutable keys are:

```text
lmfdb/v1/catalog/<catalog-sha256>.json
lmfdb/v1/manifests/<dataset>/<version>/<manifest-sha256>.json
lmfdb/v1/artifacts/<dataset>/<version>/<artifact-sha256>.sqlite3
lmfdb/v1/artifacts/<dataset>/<version>/<artifact-sha256>.sqlite3.br
```

One small revalidating `latest` document may point to an immutable signed
catalog. Installed versions themselves never move. Identity and deterministic
Brotli representations are stored and checked separately, following the
existing Sage.js R2 release pattern.

Every response uses a fixed content type, immutable cache headers for
content-addressed objects, no cookies, no credential reflection, and no
third-party scripts. The data origin exposes only `GET` and `HEAD` for known
artifact paths. It has no account-bearing routes.

### Signed manifest

Each release manifest contains at least:

```text
schema
dataset_id
dataset_version
adapter_id
source_name
source_release
source_tables
source_query_sha256
generated_at
record_count
coverage
sqlite_application_id
sqlite_user_version
artifact_identity_bytes
artifact_identity_sha256
artifact_brotli_bytes
artifact_brotli_sha256
logical_records_sha256
license
citations
builder_commit
builder_toolchain
signing_key_id
signature
```

The canonical manifest body is signed with an offline or protected-environment
Ed25519 release key. Sage.js ships the corresponding public key and supports
key rotation through a versioned trust set. A hash without an authenticated
manifest protects against accidental corruption but not a compromised mutable
catalog; both signature and content hash are required for `sagejs-release`
provenance.

The installer validates the catalog signature, manifest signature, allowed
origin and key path, declared maximum byte size, compressed digest, decoded
digest, and SQLite contents. It downloads into a uniquely named temporary
file, fsyncs where supported, and atomically renames only after all checks pass.
Interruption leaves the prior installed version untouched.

### Release builder

The release workflow:

1. checks out an exact protected Sage.js commit;
2. uses a pinned PostgreSQL client, SQLite version, adapter, and compression
   toolchain;
3. connects read-only to the official LMFDB mirror;
4. verifies expected source tables and column types;
5. executes reviewed bounded projections with explicit `ORDER BY label`;
6. normalizes and validates every row;
7. constructs indexes and immutable SQLite output;
8. runs mathematical and schema audits;
9. rebuilds independently and requires byte and logical-digest agreement;
10. signs manifests in a protected GitHub environment;
11. uploads identity and compressed objects before the immutable manifest; and
12. updates the small catalog pointer only after remote read-back verification.

The mirror query and adapter are checked into the repository. SQL is a release
ingestion detail, not a public query API. No PostgreSQL password or R2 write
credential is shipped to Sage.js clients. The public mirror credentials may be
used by developers, but production publication still occurs only through the
reviewed release workflow.

R2 is well suited to this workload: artifacts are immutable and cacheable,
updates are infrequent, and reads dominate writes. The manifest records sizes
so cost and accidental dataset growth can be reviewed before publication.

## Collection adapters

### Elliptic curves over `QQ`

The adapter reads exact `a`-invariants and preserves both LMFDB and Cremona
labels when present. `.curve()` constructs the existing Sage.js elliptic curve
from exact coefficients. It does not assume the curve number within an isogeny
class is identical in the two labeling systems.

The current bundled Cremona API remains supported. The new catalog may reuse
its records internally only after normalizing provenance; it does not change
the semantics of `CremonaDatabase` or `EllipticCurve("37a")`.

### Genus-2 curves over `QQ`

The adapter parses LMFDB's exact `[f, h]` coefficient arrays and constructs:

```python
R.<x> = QQ[]
f = sum(coeff * x**i for i, coeff in enumerate(f_coefficients))
h = sum(coeff * x**i for i, coeff in enumerate(h_coefficients))
C = HyperellipticCurve(f, h)
```

It supports odd- and even-degree models and nonzero `h` exactly when the public
Sage.js constructor supports them. It validates coefficient types, smoothness,
genus, and the source equation before returning a curve. A valid database
record remains inspectable even if `.curve()` raises a precise
`UnsupportedModelError` on an older or capability-limited runtime.

Normalized metadata initially includes label, isogeny class, conductor,
absolute discriminant, ranks with proof flags, local/global solubility,
torsion, automorphism and endomorphism labels, Sato--Tate label, and the exact
source equation. Additional joined LMFDB tables are added only through an
adapter version and explicit snapshot schema change.

### Number fields

The adapter uses the exact defining-polynomial coefficients, validates the
label against degree, real signature, and absolute discriminant metadata, and
constructs `NumberField(polynomial, name)`. It does not claim that the chosen
polynomial or generator is canonical outside the source record.

Normalized metadata initially includes label, degree, signature, discriminant,
defining polynomial, Galois label and flags, index/monogenic data, class number
and class group, narrow class data, regulator, roots of unity, and proof or
conditional status where supplied.

The complete LMFDB number-field collection is too large to be the default
download. Published snapshots therefore use explicit, nonoverlapping or
clearly overlapping coverage predicates. A future complete snapshot is allowed
but must advertise its multi-GiB decoded size and is never selected by a vague
automatic install request.

### Higher-genus families and curated genus 3

The LMFDB higher-genus-with-automorphisms adapter exposes groups, signatures,
dimensions, hyperelliptic/cyclic-trigonal flags, generating vectors, equations,
and parameter data when present. These are family/passport records.

Sage.js should separately publish a small `sagejs-genus3-curated` catalog of
individual curves used in documentation, correctness oracles, and performance
receipts. Each record carries its original literature or database citation.
Both catalogs implement the same collection protocol, but provider and kind
remain visible so a user cannot mistake a selected special family for a census
of genus-3 curves over `QQ`.

## Provenance, licensing, and mathematical trust

LMFDB states that its main data is licensed under CC-BY-SA. Every bundled or
downloadable dataset therefore includes:

- the exact LMFDB citation requested for the collection;
- CC-BY-SA license text or an approved reference to the installed license;
- LMFDB release and retrieval/build identity;
- source table names and transformation code identity; and
- citations for underlying authors or papers supplied by the collection.

The CLI prints citations through `sagejs database cite DATASET`; records expose
`.citation()`; exported snapshots retain them.

Database metadata is evidence, not an automatically trusted proof. Proof flags
are retained field by field. Exact constructors validate equations and
polynomials independently. Sage.js computations continue to produce their own
certificates and do not mark a result rigorous merely because a database field
has the desired value.

## Security and failure behavior

- Mathematical constructors never initiate network access.
- `auto` never initiates network access.
- Online queries are GET-only, bounded, origin-checked, and structurally URL
  encoded.
- SQLite queries use fixed templates and bound parameters.
- Source strings are never evaluated as code.
- Download sizes are checked before and during transfer.
- Redirects are accepted only under an explicit same-origin policy.
- A partial page, malformed record, schema mismatch, digest mismatch,
  signature failure, timeout, or cancellation publishes no partial record as a
  successful complete result.
- Query and install exceptions retain provider, dataset, safe URL, limit, and
  recovery guidance without leaking credentials.
- Installed databases open read-only and cannot attach arbitrary databases or
  load SQLite extensions.
- Cache eviction targets only a resolved validated cache root and exact
  content-addressed entries.

Live LMFDB changes are expected. A schema mismatch fails closed and links to an
adapter-update diagnostic; it is not converted into missing data or a false
mathematical answer.

## Platform contract

- **Node Linux x64/arm64, macOS arm64, and Windows x64:** bundled, installed
  SQLite, and online providers, subject to network policy.
- **Browser and pure Wasm:** bundled provider always; online provider only when
  the embedding supplies the reviewed network capability and the origin/CORS
  contract succeeds; installed SQLite initially reports unavailable.
- **CPython:** adapters, record types, bundled data checks, and snapshot
  generation remain ordinary CPython-parseable where practical. Host-specific
  I/O is behind the provider boundary.

Records and mathematical objects produced from the same source payload have
the same canonical exact digest on all supported targets.

## Testing and release gates

### Unit and adversarial tests

- label parsing and normalization for every collection;
- exact large integers, rationals, coefficient ordering, and generalized
  hyperelliptic equations;
- every supported predicate and rejected operator;
- malicious labels, fields, delimiters, redirects, next URLs, and source
  literal strings;
- schema additions, removals, type changes, and nullability changes;
- truncated JSON, oversized bodies, pagination loops, timeouts, and
  cancellation;
- corrupt SQLite headers, altered records, missing indexes, false counts, and
  unsigned or wrongly signed manifests;
- auto-mode proof that no network capability is invoked;
- mutation attempts against records and returned raw payloads; and
- atomic install interruption and rollback.

Normal unit tests use pinned local fixtures and a local HTTP server. They never
depend on current LMFDB availability.

### Mathematical differential tests

- every bundled elliptic record constructs and matches exact `a`-invariants;
- every bundled genus-2 record reconstructs the exact source equation and
  passes smoothness/genus checks;
- every bundled number field reconstructs the defining polynomial, degree,
  signature, and discriminant;
- selected genus-2 curves reproduce stored local factors, torsion, or other
  independently computable invariants without treating them as input proofs;
- selected number fields reproduce class-number and class-group fixtures where
  Sage.js already has complete certificates; and
- bundled, installed, and mocked-online providers yield identical normalized
  records and mathematical objects for the same source rows.

### Snapshot release gates

- source schema and row counts match the reviewed extraction contract;
- two clean builds have identical SQLite bytes and logical record digest;
- every label is unique and sorted canonically;
- every record passes adapter validation;
- a deterministic sample and all boundary records construct successfully or
  carry an expected explicit unsupported status;
- SQLite integrity, indexes, manifests, signatures, identity bytes, and Brotli
  bytes verify;
- installation and representative queries pass on Linux x64/arm64, macOS
  arm64, and Windows x64; and
- remote R2 read-back matches the published manifest before a catalog pointer
  is advanced.

An opt-in live canary checks a handful of labels and one paginated query against
the official API. Its failure blocks a claim of current online compatibility,
but ordinary offline tests remain reproducible and diagnose the distinction.

## Implementation phases

### Phase 1: provider-independent core and bundled sample

- Add `sage.databases.lmfdb` with catalog, collection, query, predicate, record,
  and adapter types.
- Generate small cited elliptic, genus-2, number-field, and higher-genus-family
  fixtures.
- Implement exact `.curve()` and `.field()` conversion.
- Add offline query, provenance, serialization, and adversarial tests.
- Keep all mathematical constructors network-free.

**Exit:** the documented examples run offline, equivalent records agree across
providers using test doubles, and package-size growth is within an explicit
budget.

### Phase 2: bounded online provider

- Implement official HTTP API translation and pagination.
- Add response caching, `.explain()`, and `.snapshot(path)`.
- Add local-server adversarial tests and an opt-in LMFDB canary.
- Document Node and browser capability behavior.

**Exit:** exact label lookup and representative bounded searches work against
the live API without HTML scraping, and all failure modes are fail-atomic.

### Phase 3: deterministic SQLite builder and R2 installer

- Implement the mirror-to-normalized-SQLite release builder.
- Add signed manifest and catalog verification.
- Add `sagejs database` list/info/install/verify/remove/cite commands.
- Provision the private R2 bucket, credential-free data Worker/origin, and
  protected publication workflow.
- Publish a preview genus-2 snapshot before production activation.

**Exit:** the complete published genus-2 snapshot installs atomically, answers
indexed queries locally, constructs a representative corpus, and passes the
four-platform release gates.

### Phase 4: number-field slices and remaining collections

- Publish explicit number-field degree/discriminant slices.
- Add elliptic data beyond the bundled Cremona coverage when justified.
- Publish the higher-genus-family snapshot.
- Publish the separately identified curated Sage.js genus-3 catalog.

**Exit:** each dataset has honest coverage semantics, stable citations,
bounded download size, indexed representative queries, and cross-provider
record equality.

### Phase 5: research ergonomics

- Add query-to-dataframe/table adapters when the relevant table API is stable.
- Add notebook-friendly summaries and links.
- Add resumable downloads and optional delta updates only if full immutable
  snapshots become operationally expensive.
- Evaluate a browser-installed backend without changing the public catalog
  API.

## Acceptance criteria for the complete feature

1. A user can look up an LMFDB label and construct an exact supported curve or
   number field without copying coefficients.
2. A user can iterate a bounded, deterministically ordered property search.
3. The same program works against bundled, installed, and online providers.
4. Default and auto behavior is completely offline.
5. Complete genus-2 and bounded number-field snapshots are immutable,
   content-addressed, signed, attributable, and atomically installable from R2.
6. A snapshot states coverage precisely; absence is never silently promoted to
   mathematical nonexistence.
7. Exact values survive JSON, SQLite, download, and object construction without
   binary64 coercion or executable parsing.
8. Database proof/conditional flags remain visible and cannot poison rigorous
   Sage.js caches.
9. Supported records and digests agree on all four native platforms; portable
   modes fail explicitly when a provider capability is absent.
10. Live schema drift, network failure, corrupt artifacts, and signature
    failure all fail closed with actionable diagnostics.

## Explicit non-goals

- Reimplementing the LMFDB website or its complete search UI.
- Treating the HTTP API's internal table schema as Sage.js public API.
- Connecting ordinary Sage.js user sessions directly to PostgreSQL.
- Bundling the complete number-field or elliptic-curve databases in the npm
  package.
- Hidden network access from mathematical constructors or automatic
  algorithms.
- Claiming LMFDB has a general database of individual genus-3 curves.
- Treating database metadata as a substitute for Sage.js proof certificates.
- Building a generic ORM, arbitrary SQL interface, or general network proxy.
- Preserving accidental pre-release API choices when the first implementation
  reveals a clearer catalog model.

## Recommended first implementation slice

Start with Phase 1 and enough of Phase 2 to prove that the abstraction is real:

1. `LMFDB(source="bundled")` and `LMFDB(source="online")`;
2. `genus2_curves` and `number_fields` only;
3. exact label lookup;
4. equality, `between`, stable sorting, and a mandatory finite online limit;
5. typed records with `.curve()` and `.field()`;
6. canonical provenance and `.snapshot(path)`;
7. fixture-only unit tests plus one opt-in live canary.

Then build and publish `lmfdb-g2q` as the first R2 SQLite vertical slice. It is
large enough to validate indexes, manifests, installation, citations, and real
research iteration, but small enough to rebuild and verify exhaustively. Only
after that vertical slice is stable should the project publish the much larger
number-field subsets.
