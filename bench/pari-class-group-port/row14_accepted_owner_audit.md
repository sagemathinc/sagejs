# Row 14 accepted relation owner

This cut starts from the authenticated initial capsule and computes the live
relation/HNF schedule `42 -> 802 -> 804 -> 805 -> 806`.  Seven continuation
passes follow the initial pass.  Four consecutive empty passes at 805 are
retained rather than collapsed, so the source schedule has eight collection
passes in total.

The four HNF states are:

```text
802: [3,10,792,4,7,105,0,802,0]
804: [4,11,793,2,7,1,0,804,0]
805: [2,9,796,1,7,3,0,805,0]
806: [3,10,796,0,7,0,0,806,0]
```

Only after the live computation completes, the checker authenticates the
frozen W0 SHA-256 and compares every logical relation, logarithm, H, dep, B,
C, and permutation prefix at all four HNF boundaries.  Capacity tails and all
terminal class, Smith, regulator, and unit data are excluded.

The qualified replay runs under 600-second CPU/wall and 4 GiB RSS/address
limits.  Declared simultaneously retained owners are bounded by
1,633,313,800 bytes.  The final owner preserves the zero previous-acceptance
cache marker (`cacheChanged=true`) required by the later terminal acceptance
edge; this cut does not claim the class group `[24,8]`.

Publication is content-addressed, gzip-compressed, atomic through a hard-link,
and read-only (`0444`).
