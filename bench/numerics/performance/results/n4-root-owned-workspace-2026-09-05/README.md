# Owned root workspace: browser source witness

The source change at `7ad42f014` passes all 12 public evaluator/root browser
configurations: Chromium, Firefox and WebKit with enabled, disabled, stale and
missing optional packs. The fixtures include an incomplete backend success
after a real success, callable replacement, changed parameters, independent
validation and release of the retained workspace on close.

`browsers.json` retains source and generated-resource hashes, actual execution
targets and seven timing samples after three warmup batches. Each batch has
20 complete roots; preparation is separate, and independent validation and
result construction remain included. Wasm medians are approximately 3.50 ms
in Chromium, 5.36 ms in Firefox and 5.58 ms in WebKit. These local development
samples are not a paired performance qualification or a 1 ms target pass.

The source-browser witness rebuilds the floating pack and compiler frontend
against the current lazy bundle but uses existing exact-math assets. It is
not a product release, npm/SEA qualification, cold-start or peak-memory test.
Reproduce using the command in the preceding
[browser report](../n4-prepared-browser-development-2026-09-05/README.md).
