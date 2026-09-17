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

## Serial campaign checkpoint and timeout diagnosis

The fixed serial campaign subsequently qualified every deterministic range
from `4:4` through `84:4`. Resume planning now reports 22 complete ranges, 54
missing ranges, and zero capsule-only interruptions. Each successful range has
an independently validated mode-0444 capsule and matching receipt. No complete
owner has been published.

The next range, `88:4`, started at `2026-09-17T13:42:25.566Z` and was killed by
the protocol supervisor at `2026-09-17T13:52:25.734Z`: 600.167 seconds of wall
time against the fixed 600-second limit. Its last sampled aggregate RSS was
443,944 KiB, so this was a timeout rather than memory pressure. Fail-atomicity
held: the range published neither capsule nor receipt, the corrected outer
controller exited nonzero, and no later range started. The preserved failure
log has SHA-256
`c94b95c443f70a4a32f9468b5f1bf20543c9404bc6d6d113fafc760daa81049a`.

The v1 worker timed only the native call and emitted that timing after return,
so a killed call cannot expose an exact native duration. For the immediately
preceding ranges `68:4` through `84:4`, total pre/post-native overhead was
7.96--8.35 seconds and native time was 87.80--96.79 seconds. Thus the evidence
strongly localizes more than 591 seconds of the failed attempt inside the
native call, but that lower bound is an attribution rather than a completed
native timing.

## Authenticated one-column recovery protocol

Columns 88--91 have independent principal generators
`[1273,5,0,0]`, `[-230,13,0,0]`, `[65,2,0,0]`, and `[-707,3,0,0]` once the
authenticated embedding owner is fixed. The mathematical native kernel
already accepts `count=1`; only the corpus scheduler prohibited nonterminal
one-column ranges. The recovery layer therefore changes no Python source,
kernel hash, authority, prepared embedding, source digest, target precision,
or final batch schema.

Each internal column invocation publishes a hash-named mode-0444 fragment and
an independent resource receipt carrying the unchanged common identity. A
fragment is associated with one canonical parent schedule entry but cannot
publish that parent batch. The fragment resume planner authenticates unique
fragment/receipt pairs and reports complete, missing, and fragment-only
columns without treating a fragment as a completed ordinary batch. The
assembler requires exactly the parent's columns
in increasing source order, rejects a missing column, overlap, duplicate,
permutation, writable artifact, filename/content mutation, or common-identity
change, and only then constructs the ordinary v1 batch capsule and receipt.
Consequently successful fragments for columns 88, 89, 90, and 91 assemble to
the same canonical `88:4` payload and content hash that the existing v1 reader
validates; downstream resume planning and complete-owner merge remain
unchanged.

The lightweight self-test publishes four fragments in an isolated temporary
directory, proves that zero ordinary batch capsules exist before assembly,
assembles exactly one v1 capsule, and compares its digest byte-for-byte with a
direct v1 constructor. The full protocol test now exercises 13 negative
controls, including fragment count/order/duplicate/mode/hash failures. No
heavy one-column fragment has been executed at this checkpoint.

The authenticated recovery commands are:

```bash
node bench/pari-class-group-port/field3_complex_log_corpus_protocol.cjs \
  --fragment-parent-start 88 --fragment-parent-count 4 --fragment-plan
node bench/pari-class-group-port/field3_complex_log_corpus_protocol.cjs \
  --fragment-parent-start 88 --fragment-parent-count 4 --column COLUMN
node bench/pari-class-group-port/field3_complex_log_corpus_protocol.cjs \
  --fragment-parent-start 88 --fragment-parent-count 4 \
  --assemble-fragments RECEIPT_88 RECEIPT_89 RECEIPT_90 RECEIPT_91
```

The assembler requires the receipt paths after `--assemble-fragments` in exact
source-column order.

## Authentic column 88 and deterministic receipt repair

The first authentic one-column invocation, column 88 of parent range `88:4`,
completed successfully. Native execution took 94,019.560459 ms, monitored wall
time was 102,620 ms, and peak aggregate RSS was 1,354,600 KiB. Its seven packed
cells have digest
`ecd1113dea6bbaea032af2b8754aa2ee793880a3b576849d3f4f336c88b3500d`.
The 93,422-byte mode-0444 fragment has SHA-256
`da8c242a3453e4d5c38e262ad5ee91669fa8a8aad6003c89619814d56f2a67a8`.

The first receipt publisher mistakenly deleted `sourceDigests` after spreading
the common identity. The strict fragment planner rejected that receipt, so the
column was not initially treated as complete. The erroneous 2,058-byte receipt
remains immutable at SHA-256
`90b179d79f297aa76c9b174ca1eb85cf9c928df7ff1273c35af155b0ac838986`.
No arithmetic was rerun.

The repair accepts an old receipt only when every mathematical, resource, and
provenance field validates and `sourceDigests` is the sole absent common field.
It adds exactly the authenticated common source digests, proves that deleting
the added field reproduces the old parsed object, and publishes a new
content-addressed receipt. The corrected 2,379-byte mode-0444 receipt has
SHA-256
`1171272bda08e8654ae21bfd308e8823be80d96b632b8c294ef20116f6b5621d`.
A separate 1,992-byte mode-0444 supersession record permanently binds the bad
and corrected hashes and has SHA-256
`b6d671e883357f17599fe602a921c32638565a5b1fcbc25553f52b6dddbfb3d0`.

The resume planner excludes the bad receipt only after independently replaying
that exact supersession chain. It now reports column 88 complete, columns
89--91 missing, and zero fragment-only entries. The self-test has 14 negative
controls, including rejection of the missing field and proof that repair
preserves all old mathematical and resource values. No ordinary `88:4`
capsule or receipt has been published.

## Completed fragment recovery and ordinary batch 88:4

The remaining independently supervised fragments all qualified under the same
600-second/4-GiB policy:

- column 89: native 94,057.186630 ms, wall 102,485 ms, peak 1,363,784 KiB,
  fragment SHA-256
  `924eb7d7d2d8a53b898b937b15a9f7e24db5f2944bb778d4e17e4fd3bef47c7d`,
  receipt SHA-256
  `4e7bdb3ff1b67d96bc071e1ce09e643825c0c582e9816b639b8bf7a1b1d40c37`;
- column 90: native 99,294.597872 ms, wall 108,177 ms, peak 1,355,276 KiB,
  fragment SHA-256
  `919cd50796b70b3930a9ba516503a28d4774a3ca421203ef824016c95a994ac8`,
  receipt SHA-256
  `834a7f48dfc92660daeceda19d084b4d6d28a8b43df82af8e04137f2fe630444`;
  and
- column 91: native 92,307.696794 ms, wall 101,191 ms, peak 1,380,024 KiB,
  fragment SHA-256
  `801a596d3cf2cd54ef5aff70af152b9afb2d4530bfcc12e9ce7167f85081b30e`,
  receipt SHA-256
  `19c41e907c8ec7ff69d9354166d7227a6baa826de8c3c76c298260d66ce491e7`.

After the fragment planner reported exactly four complete columns, zero missing,
and zero fragment-only entries, the ordered assembler ran exactly once. It
published the ordinary v1 `88:4` capsule with output digest
`933708bb761b8794ca81dec4a249cd0ba1df16c1b4d29ee74ba3e14d463a6cf5`
and state `[0,153088,88,4,0,0,4,92,209]`. The 370,098-byte mode-0444
capsule has SHA-256
`5e45a9eb95dad85c59a3a10e51baf3699092c714d2a67942d83946a5ba27208c`;
its 5,345-byte mode-0444 receipt has SHA-256
`88352efde1026b470e20728dabf9f36370571fe5a4f7cecf12d0f5fec18eb5c7`.

Independent replay through the unchanged v1 readers proved that all 28 cells
are byte-identical to the four fragment payloads in source order and that all
authority, prepared-owner, kernel, norm, and source hashes remain unchanged.
Aggregate fragment-native time was 379,679.041755 ms, aggregate monitored wall
time was 414,473 ms, and maximum peak RSS was 1,380,024 KiB. Global resume
planning at that checkpoint reported 23 complete ranges, 53 missing ranges,
and zero capsule-only ranges.

## Completed fragment recovery and ordinary batch 124:4

Ordinary ranges `92:4` through `120:4` subsequently qualified sequentially.
The next range, `124:4`, reached the same fixed 600-second timeout without
publishing a capsule or receipt. Its four independent column runs initially
qualified, but the first assembly attempt failed closed: columns 124--126 had
cache key `0373a098aba3964394366c13eea899bf1c927c97123d150bd568a9b679492c0a`,
whereas column 127 had cache key
`3e7e26feddd8d2d9cef851b9a626b018e28aa5cfddb137d6237ba18e454c6643`.
The transition was caused by an integration update to the cache-fingerprinted
native C backend between columns 126 and 127, not by a change to the Python
kernel, authority, prepared embedding, or source owners.

The fail-closed receipt supersession protocol now also supports authentic
recomputation under a frozen cache identity. It preserves the old receipt,
requires the replacement's fragment, output, state, source identities,
resource policy, core size, and addon size to be identical, and permits only
the measured execution-resource fields and cache key to differ. Each
replacement is additionally bound to the immutable qualified column-127
receipt as its cache authority. The lightweight self-test exercises accepted
replacement and rejects a changed core size; it now has 15 negative controls.

Columns 124--126 were recomputed one at a time under the frozen current backend
fingerprint. Their mathematical fragment hashes remained respectively
`bbba752860669eeeb731e60563e8736b84d989c8fa01d18f093c3afef360a379`,
`4bc4c18127a4c6562a2e44346e9c2bbfb3694d2552561359cc417237e6b26117`,
and `c93c8bcb9bd813dbd06df0b4ad730acfeca35b15a36b741852ffc227c837559d`.
Their replacement receipt hashes are respectively
`193eb9e5ae8b7ec2d5092374793397c5bbe7339b96c1254ebfca785c4780d07e`,
`076b05912417b5652721df899976c94f4d8c7056bb8fd74d4a8f00367d13d89d`,
and `235b0c41b6f357a7f387b0acb1a6a027f2e925b9af772768ecf4e56b3cd330d9`.
All excluded receipts remain immutable and are named by three independently
validated supersession records.

After the planner selected four receipts with the common current cache key,
the ordered assembler ran exactly once. Independent reconstruction proved its
28 cells equal the four fragment payloads in source order. The output digest is
`5dfd354ecc7fdfe9c9946317d9d9720954df591f518783488050ae1700c1877b`;
the 370,101-byte mode-0444 capsule has SHA-256
`97da3a236c082af7609b5b882109cfe08656a8871078fd3f5b7c8b0da79d678e`,
and the 5,374-byte mode-0444 receipt has SHA-256
`ac2f619c13fdf4b9e0499a727c27cd6e598a1dc44efbb6c85df9ebe02e991865`.
Global resume planning now reports 32 complete ranges, 44 missing ranges, and
zero capsule-only ranges. No ordinary range beginning at 128 has started.
