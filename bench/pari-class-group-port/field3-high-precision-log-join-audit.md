# Field 3 high-precision logarithm join audit

## Result

`field3_high_precision_log_join.py` defines the source-transparent C1 boundary
between the independently produced real and complex logarithm owners and the
raw `3 x 301` logarithm matrix.  The coordinator performs no logarithmic
arithmetic, weighting, rounding, or reassociation.  It copies authenticated
packed cells in source-column order:

1. real place 0 (one synthesized seven-cell record containing the producer's
   three-cell real value and exact zero imaginary part),
2. real place 1 (the same representation), and
3. complex place 2 (the producer's seven cells verbatim, already weighted by
   two).

The complete input/output shapes are fixed:

- real owner: 602 triples, or 1,806 integer-string cells;
- complex owner: 301 seven-cell records, or 2,107 integer-string cells;
- joined owner: 903 seven-cell records, or 6,321 integer-string cells.

## Authentication boundary

Both complete owners must be immutable mode-`0444` files whose filename and an
independently supplied expected digest bind their exact bytes.  The coordinator
then checks exact schemas, layouts, precision, field/run identity, authority,
initial/prepared owner identities, source digests, coverage, source ordering,
and batch schedules.  It rejects unknown or missing JSON keys and duplicate
JSON keys.

The complex owner is consumed exactly as published under
`sagejs.pari-class-group/field3-complex-log-column-owner-v1`: its flat
`packedWeightedComplex` array consists of fixed seven-cell source records.  No
redundant principal record is required or inferred.

The logarithm owners are not trusted to establish the exact algebraic inputs.
The coordinator reopens the frozen authority and initial owners at the fixed
byte hashes, reconstructs the 301 principal-generator determinant norms from
their exact coordinates, checks every factorization consequence, and checks
the resulting norm-consequence digest.  It also authenticates all three exact
source-array digests.  For scalar columns 0 through 25 it additionally checks
the equality of the two real-place triples, the complex real-axis marker and
zero argument, and the exact packed doubling relation between the real and
weighted-complex values.

Publishing is fail-atomic.  The joined object is revalidated independently
before serialization; publication uses a temporary file, `fsync`, atomic
rename, a content-addressed filename, and final mode `0444`.

## Evidence available now

The qualified real `0:28` owner and the qualified 32-selected-column complex
prefix authenticate successfully against the frozen exact sources.  The
complex prefix is deliberately only a prefix protocol: its selected columns
are sparse, and it cannot publish a complete joined owner.

The focused checker also constructs structurally valid full owners in a
temporary directory, preserving every qualified selected complex record.  It
uses these only to exercise the complete schema, ordering, exact cell mapping,
publication, and fail-atomic rejection paths.  Synthetic missing cells are not
mathematical evidence and are never written to the durable corpus.  The check
rejects reordered batches, changed precision, changed norm identity, and both
scalar and nonscalar cell mutations while proving that no output appears on a
failed join.

Run the lightweight protocol check with:

```sh
node bench/pari-class-group-port/check_field3_high_precision_log_join.cjs
```

At the time of this audit, no complete real-data raw-log owner has been
published.  Once the authoritative complete real and complex owners exist,
the same coordinator can publish it with independently recorded owner hashes:

```sh
python3 bench/pari-class-group-port/field3_high_precision_log_join.py \
  --real-owner /path/real-log-columns-complete-REAL_SHA.json \
  --real-sha256 REAL_SHA \
  --complex-owner /path/complex-log-columns-complete-COMPLEX_SHA.json \
  --complex-sha256 COMPLEX_SHA \
  --authority /path/field3-authority.json \
  --initial /path/field3-initial-tensor.json \
  --output-directory /path/raw-log-owner
```

The future full run must use the exact authoritative files and their measured
digests; placeholders in this example are not accepted values.
