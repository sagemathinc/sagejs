# Row-19 first authentic HNF

Status: bounded executable development evidence for the first HNF only.

`row19_first_hnf_host.cjs` runs the prepared-only row-19 prefix through the
existing native relation collector and passes its live 423-column relation and
log owners directly to `pari_hnfspec_complete`.  No W0 relation or HNF answer
is a runtime input.

The immutable `/scratch` owner retains:

- the exact active relation matrix, pre-unit-removal `H`, and active HNF
  transform;
- the complete 423-by-423 sparse-cleanup transform;
- the published exact `W`, `dep`, `B`, and `C` blocks and final permutation;
- sparse, cleanup, rank, assembly, HNF, CUP, and final state vectors.

The checker reads the answer-bearing first-HNF W0 event only after the capped
worker exits, then compares exact SHA-256 projections for `W`, `dep`, `B`, `C`,
and the permutation.  The 423-to-430 continuation is deliberately left for a
subsequent cut so the first HNF and its full ancestry stay independently
bounded and replayable.

Reproduce with:

```sh
node bench/pari-class-group-port/check_row19_first_hnf.cjs
```

## Rejected diagnostic artifacts

Two structurally complete but unauthenticated attempts were deleted after the
post-exit W0 comparison rejected their `W`, `B`, `C`, and final permutation:

```text
/scratch/sagejs-row19-first-hnf/row19-first-hnf-cf79cf7f30eb823b96db387f4a8874403600b09ce7b4b63af04f741c0a754573.json.gz
/scratch/sagejs-row19-first-hnf/row19-first-hnf-4fe150d240a5b6440039a4785509808bfe7f574827dde39023873c9d4f05bda3.json.gz
```

The first used the prepared factor permutation; the second used the
collector-retained `outer_perm`, which was unchanged.  Both produced state
`[9,15,408,7,6,65,0,423,0]`; the exact `dep` block agreed with W0, but the
other result blocks did not.  They are not qualification evidence.

Diagnosis found that both rejected attempts had incorrectly reused collector
`Nrelid=4` as `hnfspec`'s dense prefix.  PARI's actual `k0` is the live
subfactor count, which is three for `[12,14,16]`.  The host now binds and
checks that derived value explicitly.

## Authenticated receipt

The corrected run completed in 33,773,912,645 ns with 586,788 KiB maximum RSS
and a 496,085,404-byte explicit owner upper bound.  Its content-addressed,
read-only artifact is:

```text
/scratch/sagejs-row19-first-hnf/row19-first-hnf-076d334e302d880b2a7da80366fe492d62b118e2a495f15c422908137aa66258.json.gz
compressed sha256 5145db1a710eb5e08618a73c741f3218a37c5b7c93d2cd2b94a8c19a4fd601e5
```

The exact final state is `[9,15,408,7,6,69,0,423,0]`.  The active ancestry
has 78 rows and 84 columns.  Exact post-exit W0 projection hashes are:

```text
W     15857d404eb8451df20be27069418d43a2cf995258bb74484ccb68ff14e2d8f8
dep   d84a2df7d1d3e6f1d94ca8c75131b4cd46d758ae1740baf089d883bbdbe93f58
B     8517d8d8e9a2a0fe2688713d074f78f03e8e4ecde271311595d3bdb3289319fc
C     69c2bd7b1c324cce73a7423d1cab3985fb6134045f27946eaf19793e0d117a79
perm  22b2c7b81bc7897e7cdf9166c1abd26b40273778726ba2da8fc4fc92bf9a36bf
```
