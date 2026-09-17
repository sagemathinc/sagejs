# H1 private IntegerBuffer candidate audit

The pinned fused H1 graph contains 374 reachable functions and 348 root
`IntegerBuffer` parameters.  One multi-label authority analysis propagates each
root owner through aliases and renamed callee parameters.  It classifies:

- 328 written, nonescaping, canonicalizable private candidates;
- 20 read-only public buffers; and
- zero rejected buffers.

The exact candidate list is the sorted set of root `IntegerBuffer` parameters
minus the 20 public names frozen in
`h1_private_integer_buffer_candidates.json`.  Its canonical JSON SHA-256 is
`77c94baf6f8e63577a69ab2d8013b439c48c622b5faa5a41671796f60f64bcf3`.
The checker prints every name, so this compact complement representation does
not hide the inventory.  The complete root parameter inventory hash is
`bc2accc70a2dfb044b0a0a4a692972d9791550f1b71479da107f98bf57e4da2d`.

The named layout `pari-h1-matched-flag-zero-state-v1` selects candidates by
the general rule `written-proven-private`; it contains no hand-selected buffer
names.  Both inventory and derived candidate hashes, all three class counts,
the root, schema, and layout name are authenticated.  Any source, alias,
signature, raw access, FFI/fallback, return escape, count, or manifest mutation
fails closed to the ordinary canonical public setter.

Only five buffers have prior per-buffer cleared-word instrumentation.
`prep_kummer_catalog_tau` contributed 4,866,048 cleared words; the other four
tracked buffers contributed zero.  The remaining 323 candidates were not
individually measured, so this audit makes no estimate for them.  Hypothesis 2
therefore has a known floor equal to hypothesis 1 and potentially substantial
additional benefit, but a bounded fused qualification is required to measure
it.

The generated runtime uses a 1024-entry root-local pointer hash table for the
328 registered owners.  Stores retain constant expected-time lookup instead of
walking a 328-element TLS list.  One TLS context supports nested compiled roots;
all dirty buffers canonicalize at success or failure, followed by one context
publication boundary.  Unregistered buffers take the unchanged fully clearing
path.

The full generated target is 100,275,455 bytes with SHA-256
`c9f1eb55d7b7acc511308c0ec3a78eb409a690bdaf2c56cc0cd23e5675439749`.
Static inspection verifies the authenticated layout audit, 1024-entry pointer
table, constant-expected-time lookup, success/failure canonicalizers, and
unchanged public fallback.  No native compilation or fused execution was run
for hypothesis 2 at this stage.
