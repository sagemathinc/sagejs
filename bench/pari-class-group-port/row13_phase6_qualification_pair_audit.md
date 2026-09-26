# Row 13 symmetric prepared qualification pair

`row13_phase6_sage_prepared_adapter.cjs` projects the committed resident
row-13 class-and-unit computation onto the same neutral result shape emitted by
the pristine PARI 2.17.4 helper. The timed Sage.js region remains the resident
mathematical graph in `row13_phase6_resident_kernel_host.cjs`; input parsing,
prepared-state authentication, compilation, projection and replay remain
outside it.

`generic_phase6_pari_prepared_adapter.cjs` now admits the exact frozen row-13
polynomial and discriminant. Its helper completes `nfinit` before `READY`, then
clocks exactly `bnfinit0(nf, 0)` with the requested seed. Archive, `buch2.c`,
shared-library, adapter-source and executable hashes authenticate the PARI arm.

`row13_phase6_fresh_adapter.cjs` gives both arms the qualification worker's
same prepared-kernel protocol. The deliberately lean common projection is the
class group `Z/2Z`, one class-generator count, unit rank two, regulator
presence, and torsion order two. It does **not** compare generator ideal
values, fundamental units, or the regulator value. Both arms bind seed 1. PARI
additionally retains and checks its 66-word terminal RNG state; the translated
row-13 graph exposes no corresponding RNG owner, so the common RNG record is
explicitly limited to matched input-seed authority.

The bounded checker is development-only. The successful run used the pinned
Node 22.22.2 executable with `--single-threaded --max-old-space-size=512
--expose-gc`, a 600-second wall timeout, a 600-second CPU limit, and an
external half-second descendant-RSS watchdog enforcing 4 GiB of physical
memory. It deliberately did not use `RLIMIT_AS`: Tree-sitter's WebAssembly
frontend reserves a large virtual guard range despite modest resident memory.
The underlying checker invocation was:

```bash
SAGEJS_PHASE6_NATIVE_CACHE_ROOT=/scratch/row13-phase6-native-cache-20260918-v2 \
  timeout 600s /usr/bin/prlimit --cpu=600 -- \
  "$NODE22" --single-threaded --max-old-space-size=512 --expose-gc \
    bench/pari-class-group-port/check_row13_phase6_qualification_pair.cjs \
    /scratch/row13-phase6-unqualified-fresh-protocol-node22-final6.json
```

It requests two fresh observations per arm and requires exact output, replay,
matched-seed, and work digests. It also requires deterministic same-seed PARI
terminal RNG and stable Sage.js semantic projections. It neither registers the
pair nor enables qualification, timing promotion, or reserve opening.

## Historical diagnostic smoke (superseded evidence protocol)

The warmed bounded run on 2026-09-18 completed successfully and wrote
`/scratch/row13-phase6-unqualified-fresh-protocol-node22-final6.json` with
SHA-256 `733bf421ca27e90eb1f26948172a0abb1e642d554c29d124e9f2a5bcec895918`.
Both arms completed two fresh observations. Independent review subsequently
found that replay was a cloned output, Sage's mathematical-call count was a
handle count, PARI CPU was the waiting Node thread, and provenance did not bind
the whole graph or completed watchdog sidecar. This receipt is therefore only
an unqualified lean-projection diagnostic, not qualification evidence. Its
historical output, replay, RNG and work digests were respectively
`9be2a7c500c9850fc700cf4ed119c6cb6f7f6d57a4c3b59f62d9258c92db1eed`,
`4f2b3f8ad8df07608cfaa62dea1f9d3b6adf6c65836f7b1a0d6d72ea5286def7`,
`001b4fc51152814125679cc4241f6a34f5fc81e6896a72c6f00133d2af738673`,
and `48d2c0dfd428e28f0d49f551e93b6b5addfb2a94053e51cf8efcb11871e5e22c`.

The two Sage.js resident calls took 433.640 seconds in aggregate; the two PARI
`bnfinit0(nf, 0)` calls took 6.001 seconds. These are diagnostic development-host
clocks, not qualification timings. Total protocol wall time was 577.089 seconds.
The external watchdog observed peak aggregate descendant RSS of 1,278,368 KiB
and peak aggregate VSZ of 14,064,272 KiB, with no physical-memory violation.

The repaired live ancestry derives unit and presentation coordinates from the
actual terminal HNF state, authenticates every live H column after each append,
and rejects a swapped terminal coordinate. A final host-side defect exposed by
that validation was not mathematical: `rank_state` is a packed
`IntegerBuffer`, so `Array.from(rank_state)` projects undefined JavaScript
properties. The host now uses its exact `toArray()` projection and retains the
source invariant `rank_state[8] == lig`; generated C confirms the kernel writes
that slot. The validated gate and focused-regression hashes are
`3f64ebfdc20533d6dcd1d320feaf1b7fff16481053f1a591c7bc931c2fd6595d`
and `6638e87e47216de36a5cb63e60da00a7006344d54f26a2a88764332e02cd9d78`.

This receipt remains explicitly unqualified: it does not register row 13,
enable campaign execution, promote timings, or open reserves.

## Hardened protocol pending bounded rerun

Current source reconstructs replay independently from retained live Sage
owners and separately re-read PARI BNF getters. The common replay digest covers
only the reconstructed lean semantics, while per-arm observations retain the
honest reconstruction method. It counts the reviewed 43 Sage top-level native
invocations (separately from 18 resident handles) and one PARI `bnfinit0` call.
It reports helper-process CPU for
PARI; labels process RSS as a lifetime high-water mark; binds source/native
artifact provenance; and uses a post-process finalizer to parse and bind the
completed external resource sidecar. The checker and sidecar must share a
run identity, and the finalizer rejects failure, RSS-limit violation, junk,
truncation, inconsistent peaks/times, foreign-run sidecars, non-recursive
process accounting, any observed build process, and failed postflight. The
finalizer revalidates the entire report before sealing it. Source authority
contains the thirteen mathematical Python roots, the compiler's explicit
backend-fingerprint inputs, the transitive compiler/frontend and execution
graph, and FFI declarations. Each resident native manifest is reconciled with
that authority, and every published native file hash is re-read. Mutation
checks run as part of the checker and cover prepared input, result, replay,
counters, source provenance, a real native artifact hash in the report,
both-arm digest substitution, artifact deletion, report schema and safety
flags, sidecar, and swapped terminal coordinates. The validator admits only
the reviewed report schema, two repetitions per arm, all execution and reserve
flags false, and fixed independently reconstructed output, replay, matched-seed
RNG and work digests; cross-arm self-consistency alone is insufficient. No
bounded pair has yet been run from this hardened source, so it makes no
performance or qualification claim.

Timing and resource records are also structural evidence rather than trusted
free-form metadata. Each arm, batch, and observation has an exact key set;
integer strings are canonical; stage totals conserve the inclusive wall clock;
Sage thread CPU is present; PARI's batch thread CPU is explicitly unavailable
while both helper-process CPU observations are positive; RSS maxima agree with
the observation high-water marks; and the PARI terminal RNG digest is fixed.
The finalizer additionally re-hashes the exact helper executable named by PARI
provenance. Focused finalizer mutations cover wall/stage time, RSS, helper CPU,
observation deletion, the helper executable hash, and the resolved dynamically
loaded PARI object authority. The helper's ELF dynamic section must name
exactly `libpari-gmp-tls.so.9`, and its sole runtime search path must be the
pinned PARI 2.17.4 object tree. Authority is attached to the canonical real
path reached through that `DT_NEEDED` SONAME—not the link-time `libpari.so`
alias—and is independently re-derived and re-hashed during pair loading and
finalization. A same-byte negative fixture in which `libpari.so` and the
SONAME resolve to different real paths is rejected.

PARI helper compilation is outside the pair. The separately bounded prewarm
at `/scratch/row13-phase6-pari-prewarm-4535b7a23` completed in 0.537188295
seconds with peak aggregate descendant RSS 127,520 KiB and no cap violation.
It produced executable SHA-256
`ba10c50d307c775c054c21d87de66cde9db0995f421d0ab6f388b85a95f5133b`
and the original link-time-only v1 manifest SHA-256
`a09cbab6eb05c7bfbd3be98d85acd3fdc6a7737391c1f7ce2302b5d16c2bba21`.
Without rebuilding the already authenticated executable, the runtime identity
was re-derived from its ELF dynamic section and sealed in the accepted v2
manifest at
`/scratch/row13-phase6-pari-prewarm-4535b7a23/prepared-adapter.manifest-v2.json`,
SHA-256
`1746982e0f70c61c930d447527ab25d41d35b3e492896651e5a6174aedf43758`.
The v1 manifest is retained as historical evidence but is no longer admitted.
The pair requires both exact paths through `ROW13_PHASE6_PARI_HELPER` and
`ROW13_PHASE6_PARI_HELPER_MANIFEST`, authenticates them before the expensive
Sage arm, and has no compile fallback. The recursive watchdog must therefore
observe `build_process_count == 0` for every pair sample.

## Hardened bounded attempt 1: timeout before PARI

The single authorized hardened attempt used run identity
`row13-hardened-20260918-run1`, Node 22.22.2, the warmed v2 native cache, a
600-second wall/CPU cap, and the external 4 GiB aggregate-RSS watchdog. It
terminated with timeout status 124 after 600.364949626 seconds. The watchdog
did not fire: its process-group samples peaked at 733,528 KiB RSS and
12,096,760 KiB VSZ. Native compilation uses detached node-gyp process groups,
so those figures are not a valid aggregate-descendant measurement for this
compile-bound attempt. All 1,164 group samples contained two processes; the
PARI helper was never spawned. Stdout and stderr were empty, no core receipt was
published, and consequently no finalized evidence bundle exists. The preserved
resource sidecar is
`/scratch/row13-phase6-hardened-node22-run1.resource.txt`, SHA-256
`df29420fe4183a1e642d25110ea960cefad62af2198e4f5864a265b2ef5b2b66`.
This is an incomplete diagnostic, not a mathematical divergence, and it makes
no timing, qualification, execution, or reserve-opening claim.

Cache mtimes prove the timeout was entirely compilation: twelve current-key
native graphs completed sequentially, while generation of the thirteenth
(`getfu_mixed_quartic.py`) began at the timeout and never produced a manifest
or addon. No Sage resident computation, PARI helper, provenance closure,
mutation validation, or finalization was reached.

## Frozen-cache preflight after compiler commit 4535b7a23

The missing `getfu_mixed_quartic.py` graph and all twelve other graphs were
prewarmed against compiler commit `4535b7a23`. A subsequent exact-path
prepare-only verifier authenticated all thirteen current cache keys and every
published file artifact without spawning node-gyp, a compiler, or a PARI
helper. It exited zero in 134.651943946 seconds with peak aggregate descendant
RSS 751,124 KiB. Whole-cache snapshots covered 821 files. The sole metadata
change was the discovery `index.json` mtime; its bytes remained identical with
SHA-256 `57b19de8405000891790ac96f6051535742e3312495a667b091d70ac43afb342`,
and its schema and exact thirteen-source-to-key map were revalidated. No build
directory, manifest, addon, generated source, or other cache path changed.
The preflight evidence is under
`/scratch/row13-prepare-cache-hit3-4535b7a23.*`. This proves a warm immutable
mathematical cache; it is not a class-group computation or qualification run.
