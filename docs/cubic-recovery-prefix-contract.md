# Reentrant exact cubic unit recovery

`_cubic_relation_prefix_has_archimedean_unit` borrows fixed-capacity scratch;
it neither owns an arena nor authorizes another relation-collection attempt.
Its ordinary Python body remains the dynamic implementation and compiled
mathematical source.

For $m$ active principal relations on $n$ factors, HNF uses precisely the
$m\times n$ prefix and an $m\times m$ transform. Only after exact full rank is
established, LLL uses the $(m-n)\times m$ dependency prefix and an
$(m-n)\times(m-n)$ transform. Extra physical rows and columns never become
relations or dependencies. Active scratch is assigned before it is read;
inactive entries may be poisoned or retain earlier attempts' values. Clearing
an owner does not rewind an allocation checkpoint.

## Status and publication contract

| Status | Meaning |
| --- | --- |
| `1` | An exact unit has been reconstructed, its norm checked by the existing reconstruction helper, and its independently computed regulator authenticated against the dependency enclosure. Only this status updates the five-entry result row. |
| `0` | Full relation rank, but no certified non-torsion dependency candidate. This includes zero dependency dimension and well-formed intervals that cannot distinguish a nonzero logarithm; it is not a proof that all dependencies are torsion. |
| `2` | The row count or exact HNF rank is below the factor count. |
| `-1` | Invalid exact computation, HNF row ordering/rank, logarithm interval, resource bound or exponent-size bound. Foreign status exceptions remain fatal as well. |
| `-2` | The existing reconstruction helper did not succeed, including failed exact norm authentication and numerical or exponent envelopes. |
| `-3` | Reconstructed regulator authentication failed: nonpositive, unordered or disjoint enclosures. |

No negative status authorizes collection or numerical retries. No failure
updates the result row. Rank deficiency depends on context: a standalone
prefix can genuinely lack rank; the present production recovery caller already
retains complete class-lattice support, so status `2` is an inconsistency there.

The production caller accepts only `1`. Status `0` retains missing-unit phase
`43`. Every other status records its value in diagnostic slot `62` and declines
with phase `44`, without copying stale unit coordinates. This is an intentional
failure-path correction: the existing host effort gate permits phase `43`,
whereas reconstruction or regulator failure does not mathematically justify
more relations. Public one-shot success/failure behavior is unchanged; unsafe
effort escalation on these failures is removed. This change does not introduce
staged certification or authorize resumable collection.

## Exact witness

The focused witness works in $K=\mathbf Q(\alpha)$ with
$\alpha^3-\alpha-1=0$ and power basis $(1,\alpha,\alpha^2)$.
The discriminant is $-23$, hence this power basis is maximal. The polynomial
is irreducible modulo $2$, and $N(\alpha)=1$, so $2\alpha^k$ for
$0\le k\le3$ all generate the same principal ideal $(2)$. Their exponent rows
are therefore all `[1]`; the first two rows already have the exact dependency
$[-1,1]$, whose product is $\alpha$.

The witness calls the actual multiplication/norm, logarithm, HNF, LLL,
reconstruction and regulator helpers. It compares exact-sized owners with
larger owners reused at active counts $2,4,2,4$, poisons inactive inputs and
scratch, checks those entries remain untouched, and checks the returned unit
and regulator against exact-sized executions. Fault injection separately tests
the status and caller/host-gate contracts; those control-flow tests are not
mathematical evidence for the injected data.

The Linux direct-core ASan/UBSan witness executes all four prefixes in one
invocation, with checkpoint capacity exactly 3 MiB, `retry_shift=0`, and no
upstream allocations or soft-limit exhaustion. Measured high-water is 206,448
bytes in fmpz and 1,995,008 bytes in GMP. It also forces a 16-byte checkpoint
failure and verifies successful subsequent invocations. These are observed
limits of this small witness, not bounds for the complete staged proof.

This is reentrancy qualification of one proof helper, not an end-to-end timing
claim, a full staged-checkpoint bound, or a new class-group correctness theorem.
