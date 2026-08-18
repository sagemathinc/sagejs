# Degree-90 Buchmann--Lenstra table receipt

Source baseline: `ac3f18eb`; fixture: `hecke-degree-90`.

The former multiplication-table wrapper attempted a 51,222,456,000-byte
allocation and aborted V8 with `change_in_bytes < kMaxReasonableBytes`.  On
the exact 1277-bit composite child, the same formula requests 41,972,904,000
bytes.  The replacement proves independent fixed-width bounds, uses a
3,245,368-byte workspace, emits no cubic table during replay, and streams at
most one bounded group of rows when callers actually need structure
constants.

The certified child completed in 6.718 seconds.  Both the check-only ring
kernel and rational generator-membership kernel reported `native-capable`.
The focused degree-90 test also corrupts the generator and a same-determinant
basis entry; both are rejected.  Ordinary Python retains the exact
shifted-generator and generator-square fallback on packed overflow.

The exact public trace no longer crashes but exceeded the enforced 120-second
bound (120.248 seconds; 124.190 user seconds).  Instrumentation completed the
BL split in 373 ms and the accepted composite child in 6.839 seconds before
entering downstream `native_order_from_polynomial`; observed RSS was 621,596
KiB.  That downstream terminal work is transferred to
`nf_opt_round2_degree90`.

Validation: focused degree-90 corruption test passed; the three BL focused
suites passed; strict baselib and architecture checks passed.
