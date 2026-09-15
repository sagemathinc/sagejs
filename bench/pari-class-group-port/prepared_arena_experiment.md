# Prepared GMP arena experiment

The baseline allocation diagnostic records 1,006,129 malloc and 471,932 realloc
requests, with 26,156,536 total requested bytes, for one post-warmup prepared
GMP call. This motivates changing temporary allocation discipline while keeping
the GMP arithmetic and mathematical call graph intact.

`prepared_class_group_arena.py` is an ordinary Python wrapper around the existing
prepared attempt. Its explicit signature is checked against the original; every
argument is forwarded unchanged. Its only new operation is a lexical
`NativeExactArena(0, temporary_limit)`. The resident-child budget is zero because
no children are created. External packed owners retain the original policy.

The diagnostic probe opts in with `--arena-bytes`; default execution is
unchanged and only explicit GMP is accepted for this comparison. The diagnostic
ceiling is 128 MiB, under the unchanged 4 GiB process limit. As a provisional
capacity estimate, adding a conservative 64 bytes of header/alignment per
allocation or reallocation to the observed requested bytes gives 120,752,440
bytes, below 128 MiB. This is not a proven bound for other inputs, a higher
algorithmic limit, or permission to accept an exhausted arena. Verify the
allocator header/alignment assumption before execution.

The current compiler's speculative reservation multiplier makes this capacity
unsuitable under the process limit. A separately tested compiler correction is
required to reserve only effective capacity for nonretryable externally mutating
calls, while preserving replay-safe behavior. No arena performance result is
claimed until that correction and the complete prepared replay pass.

Failure must propagate before outputs are interpreted. An exhausted wrapper
may already have modified external buffers; the probe must terminate that run,
not reuse its apparently accepted output or retry it. Fresh runs restore all
owners from the original fixtures. Existing result, regulator and work-count
assertions remain outside measurement windows.

The CPython forwarding/exception test uses a stub callee and therefore proves
only wrapper mechanics. It is not an end-to-end mathematical replay. Native
lowering initially rejected an imported alias; the wrapper now uses a distinct
entry name and an ordinary unaliased import instead of expanding compiler scope.

Native IR lowering then passed for 243 functions (the prior 242-function graph
plus this wrapper). The wrapper has one native call, zero arithmetic operations,
one arena scope, and no owned children. Effects identify external writes and
`replaySafe: false`; the tagged entry is explicitly a GMP workspace bridge.
Lowering cost 34.095668 CPU seconds. This verifies admission and effects, not
compiled execution or allocator performance.
