# Checked-private status unlikely hint

## Result

Compiler commit `59927bb2f85354068dd86ad739506b5ffd6b62f4` is a positive
diagnostic result for the frozen Stage G prime-degree catalog. All 14 paired
measurements favored the candidate. The pooled geometric mean fell from
`2.1602315189613446 ms` to `2.1129387448809474 ms` per catalog, a candidate to
baseline ratio of `0.9781075437214545` (a `2.1892456278545525%` improvement).
Object text decreased by 473 bytes and linked ELF text decreased by 424 bytes.

This is shared-host diagnostic evidence, not release qualification. The
permanent machine-readable record is
[`private_status_unlikely_evidence.json`](./private_status_unlikely_evidence.json).

## Provenance and frozen replay

The workload and driver came from source commit
`696c0bb472ec7e2aaf63ead93951f7eedcb32be7` (tree
`d23ccac09c3edb39e897956daceca1bf4670931e`). The compiler candidate is commit
`59927bb2f85354068dd86ad739506b5ffd6b62f4` (tree
`dc4418f38f0d79444b4633137c049d885731bb8b`), based on
`f690969b9744e14b72145c4f14898ed095305b77`. Because the benchmark ran before
the candidate was committed, both raw records report that base commit and a
dirty compiler worktree; `59927bb` is the subsequent commit that records the
candidate source.

The fixture SHA-256 is
`f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312`.
The replay passed all four frozen valid packets, including all 7,081 active
outputs in timed packet zero, plus all nine malformed cases with exact result,
exception, and post-call buffer agreement. The candidate retained 37 private
variants, five local interval proofs, three unconditional direct-result call
sites, and no fallible direct-result call sites.

The authoritative raw records are:

| run | raw SHA-256 | generated directory |
|---|---|---|
| 1 | `ba6b483cb51f3fdc90fc901a1dc0749e2aa1ea0f08c24d0be7b687915e8d2d88` | `/tmp/sagejs-stage-a-catalog-GZXmyu` |
| 2 | `b756d43563310e93b380f3622373d786d4be037ef812e699d07ed182ad4589d3` | `/tmp/sagejs-stage-a-catalog-fqbpBy` |

From a checkout of source commit `696c0bb`, with
`/home/user/sagejs-worktrees/private-status-unlikely` checked out at compiler
commit `59927bb`, the two-process replay commands are:

```bash
node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-XFCs0p \
  /home/user/sagejs-worktrees/private-status-unlikely stage-g \
  > /tmp/status-unlikely-integrated-2.json

node bench/pari-class-group-port/check_stage_a_catalog_region.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json \
  /tmp/sagejs-stage-a-catalog-XFCs0p \
  /home/user/sagejs-worktrees/private-status-unlikely stage-g \
  > /tmp/status-unlikely-integrated-3.json
```

Each command creates a fresh Node process and candidate build, calibrates each
arm to approximately one second per batch, warms each arm twice, then measures
seven pairs. Even-numbered zero-based pairs run baseline first; odd-numbered
pairs run candidate first.

The raw records did **not** capture hostname, OS release, CPU model/topology,
Node.js version, C compiler identity/version, or linker/binutils versions. No
current-machine reconstruction is substituted for those missing fields. The
recorded hashes authenticate the retained JSON and binaries, but the original
host and toolchain environment cannot be reconstructed from them; this is an
additional reason the result remains diagnostic only.

The two generated directories are byte-identical for the recorded source,
header, adapter, manifest, index, object, and linked addon. The generated core
SHA-256 is `7c4f789106c56c4e62ef46534892a92ef3a4f382cadb47c1f9910c46d6726bfe`;
the object SHA-256 is
`12ae2f7d2a10107c5905d40faa2eb4f4547fe7735bb48b0f004d0822f4339045`;
and the addon SHA-256 is
`bfe1cafe0877dfae61262f22f6c16b3ef86478bd7393a57c9576d2af5ffe7eb3`.

## Exact timings

The timed boundary is tagged packet zero; packing, building, and assertions
are excluded. Each fresh process used seven alternating baseline/candidate
pairs after calibration and warmup. Ratios below are candidate divided by the
paired baseline.

| process | pair | baseline ms | candidate ms | ratio |
|---:|---:|---:|---:|---:|
| 1 | 1 | 2.1600194350797266 | 2.105468135667396 | 0.974744996028095 |
| 1 | 2 | 2.1605563599088837 | 2.1103109803063456 | 0.97674424026381 |
| 1 | 3 | 2.1617931708428246 | 2.1117553785557988 | 0.9768535709327283 |
| 1 | 4 | 2.157963854214123 | 2.1091464726477023 | 0.9773780355629734 |
| 1 | 5 | 2.1613202072892936 | 2.108111135667396 | 0.9753812177194087 |
| 1 | 6 | 2.1603609817767655 | 2.1089424026258206 | 0.9761990798830961 |
| 1 | 7 | 2.158123307517084 | 2.109633934354486 | 0.9775316947860662 |
| 2 | 1 | 2.1675364545454547 | 2.1167202876106193 | 0.9765557959460055 |
| 2 | 2 | 2.1545947545454545 | 2.117674157079646 | 0.9828642498140688 |
| 2 | 3 | 2.157040959090909 | 2.1133235619469026 | 0.9797326995763532 |
| 2 | 4 | 2.164020797727273 | 2.1179011703539823 | 0.9786879925452995 |
| 2 | 5 | 2.160288209090909 | 2.1156833163716815 | 0.979352341723886 |
| 2 | 6 | 2.1574277295454545 | 2.1181855088495576 | 0.981810644148824 |
| 2 | 7 | 2.162226252272727 | 2.1183462168141594 | 0.979706085146064 |

Run 1's geometric means are `2.1600191845841428 ms` baseline and
`2.1090518556413826 ms` candidate (ratio `0.976404223950181`). Run 2's are
`2.160443874211458 ms` and `2.116832797485377 ms` (ratio
`0.9798138349037192`). The pooled values are computed across all 14 samples,
not by rounding or averaging the displayed run ratios.

## Code size

| measure | baseline | candidate | delta |
|---|---:|---:|---:|
| generated core bytes | 6,322,765 | 6,326,308 | +3,543 |
| object bytes | 347,176 | 347,264 | +88 |
| object text bytes | 212,843 | 212,370 | -473 |
| addon bytes | 354,880 | 354,880 | 0 |
| linked ELF text bytes | 347,455 | 347,031 | -424 |

The baseline generated-core SHA-256 is
`1db8d76a096ff7076f1811f0beb0ccdf4064685e280f6a35cb09cd7026213252`;
its object SHA-256 is
`016ce9fce6fa46fc140da4b145932d61b13695d38617d92ff9f1b153a9a8f73e`;
and its addon SHA-256 is
`ccb5adfd23d2652b401b23608a48a0c86dc79fa7c8bd8fedfb5fd8c806bf6bbf`.
