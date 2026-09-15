# Deferred post-HNF class factor

Implementation commit: `243655ffa`. PARI 2.17.4 `buch2.c:4106–4129`
computes the regulator multiple, applies the lambda/R and unchanged-cache
gates, updates `old_cache`, and only then evaluates the triangular determinant
and `h*invhr`. The connected post-HNF helper now follows this arithmetic
ordering. The separate eager prepared-input helper remains diagnostic.

The acceptance numerical body was split, not duplicated. Early actions 1–4
and negative multiple-stage statuses do not inspect H or inverse-hR and leave
class-number/zeta outputs untouched. `post_hnf_state[2]` now means logs ready,
not determinant ready.

## Qualification

Frozen fixture: `/tmp/sagejs-post-hnf-acceptance-RTV8EQ/fixtures.json`, SHA256
`10c599073686f4582a94f35551494e257de304c358637596212b7cb80b9f62b9`.

From the worktree root, the metered commands were:

```sh
env SAGEJS_DIAGNOSTIC_LEDGER="$PWD/bench/pari-class-group-port/continuation-24h-cpu.jsonl" python3 bench/pari-class-group-port/meter_command.py prlimit --as=4294967296 timeout 60 python3 bench/pari-class-group-port/check_post_hnf_schedule.py /tmp/sagejs-post-hnf-acceptance-RTV8EQ/fixtures.json
env NODE_OPTIONS=--max-old-space-size=1536 SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix SAGEJS_DIAGNOSTIC_LEDGER="$PWD/bench/pari-class-group-port/continuation-24h-cpu.jsonl" python3 bench/pari-class-group-port/meter_command.py prlimit --as=4294967296 timeout 115 node bench/pari-class-group-port/check_post_hnf_schedule.cjs /tmp/sagejs-post-hnf-acceptance-RTV8EQ/fixtures.json --native
```

CPython passed 152 cases covering actions 0–6 plus five mocked early gates.
The native command passed the same 152 cases on generated JavaScript, GMP,
and tagged backends, plus 126 poisoned-owner replays per backend (378 total).
Exact multiple, coordinate, regulator, relation and state outputs match the
frozen oracles. Artifact directory: `/tmp/sagejs-post-hnf-schedule-WxHN69`.
The native qualification used 74.478 wall seconds, 81.013 CPU seconds and
591756 KiB peak child RSS, including compilation; these are resource receipts,
not performance comparisons. Python formatting, syntax/diff checks and
`pnpm parallel:check` passed.

Source SHA256 values at qualification:

| File | SHA256 |
| --- | --- |
| `post_hnf_acceptance.py` | `c959a4d0c534e87ad4e0da9772cf1fde6a706e55fbac0e7a66594735caf74eea` |
| `post_hnf_regulator_inputs.py` | `cbca1c1cd1ac5269944bebb901b858cff1ed78702d7a4e87aec87f8ade3473f1` |
| `regulator_acceptance.py` | `e1a576d1197229b807107c6fa00f207f5a45b074aa9e36f6aa6c9e20a786c7cd` |

## Remaining boundary

No full prepared class-attempt graph was rebuilt or rerun. Historical timing
artifacts retain their original source meaning and are not retroactively
qualified against this change. The outer driver updates its cache marker
after a stage-two return: successful/RELAT/PRECI returns retain the logical
update, but exceptions during determinant/reconstruction can still precede
that publication, unlike PARI's earlier `old_cache` write. Correcting that
outer scheduler exception ordering is outside this refactor. No new
completeness, certification or timing claim follows from these tests.
