# PR 279 source inventory reconciliation

The routine gate on `72abdc6a1` rejected the old modular q-expansion inventory:
`src/baselib/modular.py` and `architecture/package-graph.json` changed. Refresh
the inventory with the existing generator; no production source, required
check, timeout or budget changes in this follow-up. The inventory's assertion
is source identity, not a receipt claiming that all historical platform tests
ran on this source.

The exact performance receipts under `decomposition-prime-coordinate-*` bind
their own source hashes and retain their original revision metadata. They are
not regenerated or relabelled. The native, Node/Wasm and Chromium comparisons
described in `decomposition-performance.md` tested those source hashes.

The focused source-freeze test passes locally. The failed routine CI remains
historical evidence; the new push requests fresh routine and Chromium CI for
this inventory-only follow-up. No release or four-platform qualification is
claimed here.
