# Authenticated field3 real-log batches

This campaign replaces the qualified 28-column prefix call with a bounded
`source_start, count` protocol. It does not change the logarithm arithmetic,
precision corridor, embedding association, source owner, or PARI 2.17.4
oracle. The source interval is the only new degree of freedom.

## Frozen authority

- Run identity:
  `pari-2.17.4:nfinit192->nfnewprec153088:field3`
- Relation authority:
  `246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c`
- Initial collector fixtures:
  `81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe`
- Qualified legacy 0:28 owner:
  `09b0a20f1f059757ee3ed347f693fed92fb6749c2d46aac872abcffdd244fde8`
- Target precision: 153,088 bits
- Source order: 301 authentic principal generators; columns 0 through 25
  are scalar and columns 26 through 300 are integral-basis coordinates.

Each execution authenticates the complete authority and prepared owner before
calling the native graph. The capsule records hashes of the three large source
arrays separately so the merge step can reject a batch from a different
relation run even if its shape happens to agree.

## Native transaction

`pari_field3_real_log_columns_batch` admits exactly
`0 <= source_start < 301`, `1 <= count <= 28`, and
`source_start + count <= 301`. Its output is local-column-major:

```text
column 0: real place 0 (m,p,e), real place 1 (m,p,e)
column 1: real place 0 (m,p,e), real place 1 (m,p,e)
...
```

The output therefore has exactly `6 * count` integer cells. The function first
validates the full source owner and rebuilds the exact prepared embeddings. It
uses private scratch for all logarithms and publishes `output` and `state` only
after every selected column succeeds. The committed state is:

```text
[status, target, source_start, count,
 scalar_count, nonscalar_count, 2*count,
 agm_count, series_count, total_columns]
```

The runner tests invalid ranges, invalid target precision, wrong source order,
and short output storage against sentinel-filled public buffers before the
positive call.

## Capsules and deterministic partition

Each successful run is compared cell-for-cell with a pristine PARI 2.17.4
process and publishes a mode-0444 capsule named
`real-log-batch-START-COUNT-SHA256.json`. The intended partition is:

```text
0:28, 28:28, 56:28, 84:28, 112:28, 140:28,
168:28, 196:28, 224:28, 252:28, 280:21
```

The generalized 0:28 run additionally reconstructs the old capsule with the
old schema and property order and requires byte-for-byte equality with the
qualified immutable artifact. This is stronger than merely comparing parsed
integer cells.

Every run is killed above 3.5 GiB aggregate RSS, has a 4 GiB address-space
limit, and is killed after 600 seconds. The parent process publishes a
hash-named mode-0444 raw receipt containing native time, wall time, peak RSS,
oracle hashes, output hash, cache identity, and capsule identity.

## Merge contract

`merge_field3_real_log_batches.cjs` never sorts its inputs. It requires the
caller to supply batches in exact source order, authenticates file bytes
against the hash in each filename, requires mode 0444, and rejects overlap,
gaps, reversed batches, wrong ranges, noncanonical integer strings, wrong
payload lengths, or any disagreement in authority, prepared owner, source
digests, precision, layout, or run identity. Only exact coverage `[0, 301)`
can publish the complete 1,806-cell two-real-place owner. Publication uses a
same-directory temporary file, atomic rename, and final mode 0444.

The source-only merge test assembled an 11-batch synthetic partition and
verified all 301 columns, 602 triples, and 1,806 cells. It also rejected a
reordered pair, a missing final batch, and a final batch with a mismatched
authority. No native logarithm execution was started while the global heavy
job slots were occupied.

## Deliberate exclusions

This owner contains only the two real logarithm places. It does not contain the
weighted complex place, the 301x13 retained transform, accepted columns,
fundamental units, regulator, class number, or any answer-derived data.
