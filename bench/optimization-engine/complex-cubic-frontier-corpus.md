# Complex cubic frontier corpus

This developer tool freezes the discovery and holdout populations for the
complex-cubic class-group performance campaign. It does not benchmark a
mathematical implementation and it is never a runtime dependency.

The corpus has 1,412 records:

- 12 permanent, already exposed controls;
- 1,000 survey records, with 50 records in each of 20 cells; and
- 400 policy-held-out records, the next 20 records in every cell.

The cells cross four absolute-discriminant intervals,
$(10^4,10^5]$, $(10^5,10^6]$, $(10^6,10^7]$, and $(10^7,10^8]$, with five
class-group classes: trivial, cyclic of order 2--4, cyclic of order 5--16,
cyclic of order at least 17, and noncyclic. All records have degree 3,
signature $(1,1)$, non-null class and regulator data, and an LMFDB
`used_grh=false` source record.

Within a cell, PostgreSQL orders by
`md5(label || ':sagejs-complex-cubic-frontier-1412-v1'), label`. Ranks 1--50
are survey records and ranks 51--70 are held out. The selection excludes every
previously exposed label in a required input file. Its canonical sorted-label
digest is frozen as
`3aaa2fd01a009d87d40f9f21a83db42b00f3f578827e2ae36d3e0025bdf610d8`.
Controls remain controls even if that exposure list contains them.

## Generate and validate

Generation uses the public read-only LMFDB PostgreSQL mirror and must not run
on a benchmark host while timings are being collected:

```bash
node bench/optimization-engine/complex-cubic-frontier-corpus.cjs \
  --generate \
  --exclude-labels /path/to/prior-exposed-labels.json \
  --output-dir /tmp/complex-cubic-frontier-v1
```

The output is a canonical manifest and two deterministic gzip assets. The
survey asset contains controls plus survey records; the holdout asset contains
only held-out records. Asset names use the SHA-256 of decompressed canonical
JSONL, while the manifest separately binds compressed bytes. Upload the exact
files without renaming them:

```bash
gh release upload optimization-corpus-complex-cubic-v1 \
  /tmp/complex-cubic-frontier-v1/*.jsonl.gz
```

The frozen 2026-09-02 snapshot is bound by
[`complex-cubic-frontier-manifest-sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json`](complex-cubic-frontier-manifest-sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json).
It contains only provenance, selection SQL, counts, and identities—not corpus
records. The two release assets it binds are named
`complex-cubic-frontier-survey-sha256-81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd.jsonl.gz`
and
`complex-cubic-frontier-holdout-sha256-bfc6f5dd69556014156cd75f13890a9bd6de5608546109b363472c7b72e1d4fa.jsonl.gz`.

Offline validation requires no database connection:

```bash
node bench/optimization-engine/complex-cubic-frontier-corpus.cjs \
  --check \
  --manifest /tmp/complex-cubic-frontier-v1/complex-cubic-frontier-manifest-sha256-HASH.json \
  --exclude-labels /path/to/prior-exposed-labels.json
```

Replay first performs the complete offline check. It then asks LMFDB only for
the pinned labels and compares the canonical source-record digest. It never
reruns the hash selection or silently replaces a changed record:

```bash
node bench/optimization-engine/complex-cubic-frontier-corpus.cjs \
  --replay \
  --manifest /tmp/complex-cubic-frontier-v1/complex-cubic-frontier-manifest-sha256-HASH.json \
  --exclude-labels /path/to/prior-exposed-labels.json
```

Connection overrides are `LMFDB_PGHOST`, `LMFDB_PGPORT`,
`LMFDB_PGDATABASE`, `LMFDB_PGUSER`, and `LMFDB_PGPASSWORD`.

## Identities

Object keys in canonical JSON are ASCII-sorted recursively. Arrays preserve
their mathematical order, unbounded integers are decimal strings, and each
canonical JSONL record occupies one UTF-8 line terminated by LF. Records are
ordered by degree, numeric absolute discriminant, and ASCII label.

The manifest independently binds:

- all labels;
- source records with only selection metadata removed;
- complete records;
- normalized selection SQL;
- the ordered LMFDB source-column projection;
- decompressed canonical JSONL bytes; and
- compressed gzip bytes.

The manifest ID is the canonical SHA-256 of the manifest with its `id` field
removed. Consequently gzip implementation changes cannot alter the logical
corpus identity.

## Provenance and interpretation

The source is the [LMFDB Number Fields database](https://www.lmfdb.org/NumberField/),
provided by The LMFDB Collaboration under CC-BY-SA-4.0. Preserve the
attribution, [license](https://creativecommons.org/licenses/by-sa/4.0/), and
[LMFDB citation guidance](https://www.lmfdb.org/citation) with redistributed
assets.

The frozen exposure exclusion contains 1,815 labels. It was derived by searching
`.agents/scratch`, `bench`, `test/fixtures/number-field-lmfdb-cubic-100.json`,
and `test/fixtures/number-field-lmfdb-cubic-class-numbers.json` recursively for
substrings matching `3\.(1|3)\.[0-9]+\.[0-9]+`, discarding filename prefixes,
sorting bytewise unique with `LC_ALL=C`, and serializing one label followed by
LF. The resulting file has SHA-256
`3aaa2fd01a009d87d40f9f21a83db42b00f3f578827e2ae36d3e0025bdf610d8`.
Both the rule and digest are recorded in the manifest so the anti-leakage set is
auditable rather than an unexplained external input.

This is an equal-cell coverage corpus, not a sample from the natural or LMFDB
population distribution. Report each cell separately before computing an
equal-cell macro summary. LMFDB agreement is an external oracle, not a
portable proof; Sage.js results count as correct only after their authenticated
receipt and independent exact replay pass. Holdout records must not be executed
until the candidate and intervention are frozen.
