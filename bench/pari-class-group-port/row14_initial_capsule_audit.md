# Row-14 initial capsule audit

This cut turns the authenticated 96,797,505-byte row-14 W0 into a small,
immutable input capsule for the live relation/HNF driver. The coordinator feeds
the source once through a SHA-256 digest and `jq --stream`; the bytes being
selected are therefore the bytes being authenticated. The streaming selector
reconstructs only `prepared` and source events 2, 3, and 6. It never constructs
the whole W0 object and must run before, not beside, a native driver root.

The capsule contains the prepared degree-4 field, all 799 source `LP` factor
base descriptors, the 42 initial relations in sparse form, and the factor-base,
initialization, and first-search schedule metadata (including pristine RNG
states). The dense 799-by-799 initialization basis is omitted at the stream
path filter because it is reconstructed by inserting those same 42 relations.
No later relation candidate or snapshot is selected. HNF matrices,
class invariants, class number, regulator, fundamental units, acceptance, and
terminal events are explicitly outside this authority.

Every exact integer leaf in the descriptors, sparse relations, rational-prime
catalog, permutation, subfactor, and initial search fits a signed 64-bit word;
the RNG states fit unsigned 64-bit words. The already qualified row-14 capacity
report has 7,207,387 scalar cells, or 57,659,096 bytes in packed signed-word
storage. Even the deliberately conservative source-file-plus-packed-root sum is
well below 4 GiB, while the actual contract forbids their coexistence.

Publication is deterministic gzip, content addressed, atomic, idempotent, and
mode 0444. The focused checker authenticates the source, verifies the storage
contract and absence of terminal authority, rejects six source-boundary
mutations, and does not launch the expensive 806-relation/four-HNF run.
