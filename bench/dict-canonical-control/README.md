# Unmodified dictionary resource control

This developer build keeps runtime and compiler source at
`0c2945e1de400b0ee66150ae523491f7c712ce0a`, the common parent of the guarded
dictionary experiment. It is not a second implementation lane or an M0 field
measurement. No mathematical requests are dispatched to opt.

The worktree was created through `pnpm parallel:new`, installed with the frozen
lockfile, and restored native dependencies through the ordinary worktree cache
workflow. It must build its own compiler/runtime/module artifacts; a copied
candidate runtime is not a control.

The coordinator's `bench/dict-canonical-domain/measure.py` wrapper only launches
`pnpm build` in this directory and records developer elapsed/child CPU/maximum
child RSS. Its code hash is recorded with the resulting evidence. It supplies
no compiler, mathematical source, or generated runtime to this control.

Baseline and candidate developer resource runs are serialized on the same host
and existing settings. These are not controlled class/unit timing samples.
Maximum child RSS is not concurrent process-tree memory; managed-heap retained
memory and startup/algebra controls require their own observations. Preserve
failed attempts and all unchanged resource/timeout limits.

## Recorded control, 2026-09-12

The unmodified source built successfully in 800.208 seconds, with child CPU
1,155.476 user / 38.683 system seconds and maximum child RSS 1,835,597,824 bytes.
Four adapters and all 41 native kernel families were rebuilt; the optional
numerical Wasm toolchain was unprepared and its reactors were skipped.

Source SHA-256 values remained unchanged through the observations:

- Containers: `4735cf4b99d4580fee8541fb8f7015eb8ff5b7a5258b2057a9f3dd8588d5d502`.
- Residues: `e5735f6c1c043bc1c3ef53eb4bdb72283cb9a5b822096b1ad7ebcdf894a316aa`.
- Built compiler: `752c25a5ca302d1377df106b4a7b5f140e5a32767b76507d2232691a2c3477e3`.
- Successful build receipt: `8c886cf677d4f0697ff57ff45d9e324d8fce65b2a6ca976a845ab429054cfc63`.
- Developer observation driver: `2ccf388707ab4762fb44b63e949f37cdabc851442388c9c80617e82998c72a7d`.

The private task contract is conservatively a build input on this base. The
parallel runner appended its build run after the successful build, invalidating
the whole-tree receipt. Before/after task copies were compared: only that run
was added. No tracked runtime/compiler source changed. Both observation records
explicitly retain `build_inspection.current = false`; they are developer controls,
not a substitute for final exact-tree/platform qualification. This later handoff
document is also not relabeled as the earlier build input.

The unchanged algebra fixture hit its 60-second child deadline; the harness
reported ETIMEDOUT after 61.916 seconds including teardown. Startup's 11-sample
median was 407.7 ms against the unchanged 400 ms limit, with 28.6 ms bare Node
and 182.6 ms empty Sage.js. This is a failed startup gate, not a candidate-caused
regression established by this control.

Three developer evaluation samples at each size gave residue-work medians
419.3, 1,684.7 and 6,512.1 ms for 256, 512 and 1,024 keys. Primitive-work medians
were approximately 10.9, 10.6 and 14.9 ms. These include small call-compilation
overhead and are not controlled class/unit timings.

After two explicit garbage collections per observation, retaining 10,000
two-entry dictionaries increased managed heap by 4,362,848 bytes; releasing them
returned close to the earlier heap. Making 24,576 distinct misses into an empty
residue-key dictionary increased retained managed heap by 5,475,864 bytes.
This is an observed cache-lifetime cost, not exact per-object allocation counts.

Raw logs, resource JSON, task-boundary copies and the build receipt are preserved
in the coordinator's backed-up `build/general-frontier/dict-canonical-control-v1/`.
The generated control compiles both named source revisions with one frontend;
both are identical at this base, and their emitted hashes agree. Final candidate
comparison and resource acceptance remain with the integration lane.
