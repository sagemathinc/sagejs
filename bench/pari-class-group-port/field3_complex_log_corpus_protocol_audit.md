# Field-3 complex-log full-corpus protocol audit

## Scope and stopping boundary

This checkpoint turns the already qualified `start,count <= 4` complex-log
kernel into a resumable full-corpus protocol. It does not execute any of the 76
expensive batches. The only executed workload is a lightweight synthetic
protocol test using the qualified 32-column prefix as immutable compatibility
data.

The schedule is fixed, not discovered from directory contents:

- batches 0 through 74 cover `0:4, 4:4, ..., 296:4`;
- batch 75 covers `300:1`; and
- no other range is admissible to the worker, capsule constructor, reader, or
  merger.

## Shared identity

Every capsule, per-batch receipt, merged owner, and merge receipt repeats and
validates the same identities:

- authority SHA-256
  `246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c`;
- initial exact owner SHA-256
  `81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe`;
- prepared embedding owner SHA-256
  `bc0dfbca45a575a381ba87371fb27906f68b34cedd025435986fad4c7c6287cf`;
- complex kernel source SHA-256
  `87d2b07569daa31ebf62ce88c971dd0fbdf4e87e898509b9fe9d59d4da1e2007`;
- exact norm-consequence SHA-256
  `65e1bbd5c05b89b63d08d91e137c2ac68116db3df66073080d89ca4a55275f53`;
  and
- separate packed digests for principal generators, relation metadata, and
  relation records.

The future worker authenticates the exact authority and initial owners,
recomputes all 301 norm consequences, obtains the same prepared embedding
owner through the qualified PARI 2.17.4 preparation path, and checks the
kernel source before entering the native call.

## Immutable transaction protocol

Each successful native call first constructs a canonical capsule containing
exactly `7*count` decimal integer strings in source-column order:

`[kind, 2*log|z| mantissa, precision, exponent,
  2*arg(z) mantissa, precision, exponent]`.

Capsules and receipts are named by SHA-256 of their exact bytes. Publication
uses an exclusive temporary file, `fsync`, mode `0444`, a no-overwrite hard
link into the durable namespace, temporary unlink, and directory `fsync`.
Existing content-addressed paths must have both identical bytes and mode 0444.

The resume planner independently validates all present capsules and receipts.
A range is complete only when its unique capsule and unique receipt agree on
the capsule path and digest. Capsule-only interrupted publications are exposed
explicitly; gaps, duplicate alternatives, receipt-only ranges, or mismatched
receipt/capsule pairs are rejected rather than guessed around.

## Ordered merge and prefix compatibility

The merger accepts exactly 76 paths in schedule order. It rejects a gap,
overlap, duplicate, permutation, noncanonical range, changed common identity,
changed filename hash, writable capsule, wrong raw kind, or malformed integer
cell. The complete owner contains exactly 2,107 cells (`301*7`) and records all
76 capsule digests in order.

Before publication, all 32 columns in the already-qualified prefix are
compared as byte-identical JSON arrays. This covers all 26 scalar/axis columns,
four nonscalar quadrants, cancellation column 184, and terminal column 300.
The compatibility cells have digest
`f4899c83bfb797e61a3fbfc539c107db57eb0ea78e20b9ab1697167d75c3b1cd`.
Neither the batch protocol nor merger multiplies by retained `T`, consumes
expected units, or uses regulator/class-number answers.

## Lightweight evidence and cost estimate

The self-test built all 76 synthetic capsules, retained the authentic selected
prefix cells, merged exactly 2,107 cells, and published immutable synthetic
owner/receipt artifacts in a temporary directory. Seven negative controls
covered missing coverage, overlap/order corruption, writable capsule,
selected-prefix mutation, prepared-owner mutation, filename-hash mutation,
and writable receipt.

The prior qualified focused run spent 303.108 seconds on six nonscalar columns
plus the inexpensive scalar prefix, with 1,489,284 KiB peak aggregate RSS and
about 17 seconds of surrounding setup. This implies approximately 190--230
seconds for a warm four-nonscalar batch, 210--260 seconds for a cold first
batch, and roughly 1.45--1.60 million KiB peak aggregate RSS. The complete
serial corpus is expected to take 3.8--4.8 hours. These are scheduling
estimates, not new measurements or a performance claim.

## First authentic batch checkpoint

The first and only authorized heavy batch, source range `0:4`, completed under
the protocol's 4 GiB hard address-space limit, 3.5 GiB aggregate-RSS abort, and
600-second timeout. Native execution took 176,388.715505 ms; monitored wall
time was 213,171 ms; peak aggregate RSS was 1,422,968 KiB. The terminal state
was `[0,153088,0,4,4,0,0,4,297]`, proving that exactly four scalar columns were
published and that the next source column is four.

The 28-cell output digest is
`18eb8edf0301fee15c7d189ef67d62dd909fecbc0ea3c8d7f991d8889bf29f74`.
The immutable capsule is mode 0444, 185,588 bytes, and has SHA-256
`c461673e730ff53f81cb1e2cccad7cddfb2a22fd5442534e9c8bc3dc16eebb11`.
Its mode-0444, 1,977-byte receipt has SHA-256
`036f120432b3643764b15338ab7fdb3dbd29290a42da1115f6d5df3d9fd831f0`.
Independent resume planning reports one complete range, 75 missing ranges, and
zero capsule-only interruptions. No later batch or complete owner was started.
