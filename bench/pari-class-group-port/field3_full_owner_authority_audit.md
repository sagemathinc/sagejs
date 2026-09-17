# Field-3 full-owner authority audit

## Scope

This audit covers the accepted post-`rnd_rel`/LIE state for
`x^4 - 2000022*x - 2000042` at the boundary immediately before terminal HNF
reduction. It asks whether the exact same-run resources needed for later replay
still exist, rather than whether the reduced two-dimensional presentation can
be used to reconstruct them.

## Retention result

There is no retention obstruction at this boundary. The live producer still
owns all of the following logical prefixes:

- the 288-by-301 relation matrix, 288-by-288 cache basis, 301 relation hashes,
  and 301 provenance triples;
- 301 degree-four principal generators and 301 sets of 21 weighted-log words;
- 288 packet identifiers, 288 degree-four ideal HNFs, norms, rational primes,
  degree-four descriptor generators, inert flags, relation primes, and
  ramification indices;
- both 288-entry permutations;
- the 66-word RNG state, the 12-word random scheduler, four retained random
  subfactor identifiers, the four-word small-prime schedule, and the outer,
  driver, HNF, and control states.

The authenticated terminal shape is 288 rows and 301 columns. The HNF suffix
has two rows and 286 `B` columns, the driver is on pass four, and the post-LIE
odd-prime counter is 292. The value 291 belongs to the state immediately before
the LIE step and must not be used as the terminal guard.

## Bridge design

`field3_full_owner_authority.py` is a narrow source-transparent native leaf.
It accepts the original owners directly, checks every required capacity and
terminal-state invariant before publication, and streams two bounded integrity
latches for each of 24 logical owner prefixes. It publishes only 48 exact latch
words and 24 machine state words. It does not copy the roughly 186,000 retained
cells, reconstruct anything from terminal HNF, or accept an answer fixture.

The latches are generation/integrity checks, not collision-free equality and
not mathematical authority. The caller must retain the original owners. The
focused checker therefore writes the exact decimal representation of every
logical prefix from the same CPython caller to a read-only capture, reads that
capture during cold replay, validates its shapes/provenance/permutations
independently, and only then compares the streaming latches across backends.

Three rejection probes alter a provenance token, duplicate a permutation
entry, or reactivate the random scheduler. Each must reject without publishing
any latch or state word.

## Resource correction

An earlier experimental checker asked the compiler to publish 24 additional
large buffers containing every retained cell. Lowering that graph exceeded
21 GiB RSS before producing C and was terminated. That design was not needed
for authority: it duplicated the owners instead of retaining them.

The replacement has three functions, seven dynamic `while` loop sites, 24
small helper calls, and no large output copy. The focused validation is run one
backend at a time with explicit garbage collection between backends. Its
generated core is guarded at eight MiB, and the external run is monitored with
a hard 3.5 GiB process-tree RSS cutoff.

## Dependency provenance

The focused Linux validation reuses the ignored native dependency directory
from the integration worktree at
`/home/user/sagejs-worktrees/pari-class-group-e2e-integration/packages/flint/.native`.
The checker records its resolved path. No dependency link or generated native
artifact is committed by this lane.

## Validation status

Python formatting and parsing and JavaScript syntax checking pass. A synthetic
CPython call also checks successful publication and transactional rejection.

The focused authentic differential run passed CPython, JavaScript, GMP, and
tagged backends. Every backend produced the same 48 latch words and 24 state
words, and every backend rejected all three mutation probes without partial
publication. The immutable same-run capture contains 186,560 exact cells,
occupies 2,165,948 bytes, and has SHA-256
`246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c`.
This digest is an artifact-integrity identifier, not a replacement for those
exact cells.

The generated core is 1,438,087 bytes. Aggregate RSS for the complete monitored
process group peaked at 1,748,008 KiB, below both the normal four-GiB budget and
the explicit 3.5-GiB abort threshold. The resolved native dependency path was
the integration-worktree path recorded above.
