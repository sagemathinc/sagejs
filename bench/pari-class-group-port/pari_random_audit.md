# Resident PARI random generator checkpoint

This is a bounded translation of PARI 2.17.4 `src/basemath/random.c`:
`block`, `init_xor4096i`, `rand64`/64-bit `pari_rand`, and `random_Fl`.
PARI credits Richard P. Brent's GPL xorgens 3.04 (20060628), with the
initial PARI adaptation by Randall Rathbun. The translated source retains
PARI's GPL-2.0-or-later attribution and no-warranty notice.

## ABI and correspondence

`pari_random_seed(state, seed)` initializes a positive unsigned 64-bit seed.
`pari_random_word(state)` advances one real resident draw; it does not replay
oracle words. `pari_random_fl(state, n)` accepts `1 <= n < 2**64`, consumes no
draw for 1, uses the high-bit power-of-two shortcut, and otherwise repeats
the exact source high-bit rejection sampler. No retry cap was added.

State is a borrowed `IntegerBuffer` with at least 66 entries:

- 0–63: XORGEN's circular array of unsigned 64-bit words;
- 64: Weyl accumulator;
- 65: circular index, 0–63.

This corresponds to PARI `getrand()`'s low 66 limbs, except its top-limb
encoding 64 denotes circular index zero. Extra entries remain untouched.
The seed path performs the source's 64 mixing rounds, 64 word initializations,
and 256 discarded **blocks**, without advancing Weyl during those discards.
Calls can resume using the same owners or an exact copy of their contents.
There is no hidden process-global random state.

The caller must supply initialized unsigned words. Public entries check
buffer length; seed and bound validation happens before writes. Word draws
also reject invalid circular indices before writes. Arbitrarily corrupted
word contents are outside the initialized-state contract, and no atomic
rejection promise is made for them.

## Representation and performance boundary

XOR and shifts operate on checked `uint64` locals. Left shifts mask their
input **before** shifting, preserving modulo-`2**64` C semantics without
overflowing checked machine operations or changing CPython semantics.
Addition is expressed by a nonoverflowing conditional wrap helper; unlike
C unsigned addition this requires an explicit branch in the source.

The borrowed buffer is exact-integer storage to interoperate with the current
factorization context. Loads/stores therefore convert between exact owners
and machine words, circular-index arithmetic is exact, and `random_Fl`'s
bit-length/returned shifts are exact integer operations. This is not a claim
that storage or primitive costs match PARI. A packed-word-state migration
and matched timing are deferred; the actual random stream and rejection
schedule now provide a reliable comparison boundary.

No arbitrary-precision seeding, `getrand` integer serialization API,
`random_bits`, arbitrary-size `randomi`, or general PARI random object API is
provided. The stream follows 64-bit PARI word semantics, not native 32-bit
`pari_rand` truncation semantics. No new handwritten runtime primitive was
introduced.

## Differential evidence

The checker pins the PARI archive and compares `random.c` byte-for-byte with
the archive before compiling a temporary UBSan oracle linked to PARI.
For seeds 1, 2, `2**64-1`, and `2**63+1`, it compares 144 mixed calls per seed
against actual `pari_rand`, `random_Fl`, and **every complete getrand state**.
The schedule includes bound 1, small odd bounds, powers of two, near-half-word
and maximum-word bounds, and raw draws. State is copied between calls to
exercise explicit resumption.

All 576 outputs and complete resident states match in CPython, generated
JavaScript, GMP native, and tagged native. There are 97 rejection-bearing
calls (up to 9 consumed draws), 48 no-draw calls, and 11 index-zero snapshots.
Zero/negative/overflowing seeds and bounds, short storage, invalid indices,
and untouched tails are checked. These tests establish stream fidelity, not
statistical randomness or end-to-end class-group qualification.

Final receipt: `/tmp/sagejs-pari-random-qBg9ET/fixtures.json`.

- PARI random source SHA-256:
  `dd3e0e61c6d6d9576ff07ec5490aeb82838a3d77ae947c503f5600e34e6aaa6a`.
- Python source SHA-256:
  `fdb0afa55ac272efad59a2ce5aef87c89e834ae6cbe479dd46ce2fd484e2f680`.
- Isolated core SHA-256:
  `e758f63537aa72bc15052ad2391daf1dac15e461a1ccd34848dfeb50b1a41306`.
- Final cached qualification: 1.315052 CPU seconds, 164352 KiB peak child RSS;
  compilation-capable command, one thread, 4 GiB address limit. Initial
  compilation and the failed oracle quoting attempt are also in the shared
  CPU ledger. These are validation resources, not benchmark timings.

Reproduce from the worktree with the pinned PARI directory/archive:

```sh
node bench/pari-class-group-port/check_pari_random.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz --native
```

The Python formatter and parallel claim check pass. Integration owns the
whole-branch architecture/strict/changed-file gates and final receipts.
