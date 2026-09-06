# Borrowed compact-presentation and dependency prefixes

This is a one-shot extraction prerequisite for staged exact certification. It
does **not** authorize a second proof attempt or claim a new timing result.

The production source remains ordinary Python. Six private helpers are inserted
immediately before the adjacent collector; all foreign owners remain in the
root's existing lexical arena. Collection, optional exact recovery, final unit
reconstruction/materialization, analytic certification and publication are not
changed by this extraction.

## Logical dimensions and allocation barriers

Let $m$ be the raw relation count, $n$ the established full relation rank and
factor count, $s$ the support count, $c$ the selected support-plus-tail count, and
$d=c-n$. The caller establishes $c\ge n$. Capacity is never substituted for a
logical count.

| Stage | Borrowed active data | Root allocation barrier |
| --- | --- | --- |
| Tail plan | support flags $m\times1$ | Determine $c$ before compact owners exist. |
| Compact HNF | relations/HNF $c\times n$, elements $c\times3$ | Allocate these three owners first. |
| Index equality | Smith $c\times n$ | Allocate only when no cheap exact unit was retained. |
| Dependency HNF | HNF $c\times n$, transform $c\times c$ | Allocate transform after compact index is accepted. |
| Dependency LLL and precision | relations/reduced $d\times c$, LLL transform $d\times d$ | Allocate after HNF-transform succeeds; reject $d=0$ without requesting LLL. |
| Witness logs | logs $c\times2$ | Allocate only after dependency reduction and coefficient bounds pass. |
| Unit discovery | combinations $2\times c$ | Allocate after all active witness logs are valid. |

The cheap-unit path copies the previously verified HNF, omits Smith allocation
and all HNF/LLL/log computation, and retains the existing $1\times1$ placeholders,
$1\times2$ log owner and $2\times1$ combination owner. The root still computes
the same scalar precision plan. No optional recovery owner is allocated early.

The logical-prefix replacements are
`fmpz_matrix_hnf_prefix_into`, `fmpz_matrix_snf_prefix_into`,
`fmpz_matrix_hnf_transform_prefix`, and
`fmpz_matrix_lll_transform_prefix`. The HNF-transform call stays directly in the
root at its allocation barrier. Other calls are inside borrowed helpers.

## Ownership and mathematical preconditions

The caller supplies independent, sufficiently large owners. The support flags
describe the actual support, and their nonzero count equals $s$. When the cheap
unit is retained, all raw relations are marked as support; the copied HNF is the
already authenticated raw HNF. Otherwise compaction verifies full rank, the
online HNF when applicable, and equality of the finite presentation index.

No helper allocates, clears, replaces, retains or returns a foreign owner.
Every active compact row, dependency entry and log entry is overwritten before
use. Discovery initializes both active combination rows on its first certified
candidate; a missing candidate does not authorize reading stale combinations.
Inactive entries are neither inputs nor outputs. The collector's raw matrices,
elements, HNF and support flags remain borrowed read-only.

An active discovery scan starts with `proof_unit_found=False`. A retained cheap
unit uses the inactive branch; its coordinates and regulator remain in the
caller. A combination from a different prefix must not be supplied as an
initial candidate for an active scan with different columns.

The mathematical argument is unchanged: the zero rows of the transformed
relation matrix yield exact ideal dependencies; integer combinations of these
remain dependencies. Rigorous signed logarithm intervals select and orient
non-torsion unit candidates. The Euclidean combination loop retains exact
integer combinations and valid enclosing intervals. A positive logarithmic
candidate is **not** yet the final certified unit or class group. Existing exact
reconstruction, norm/regulator checks and analytic index-one certification still
follow. See [the class-group proof](complex-cubic-native-class-group-proof.md).

## Failure contract

`_cubic_reduce_dependency_prefix` returns status, coefficient-bit count, log
scale and log precision:

- `1`: valid reduction and precision plan, including the inactive cheap-unit path.
- `0`: the established full-rank compact presentation has no dependency rows.
- `-1`: exact LLL or the existing 512-bit coefficient envelope failed.

The root maps only status `0` to the existing phase `43` insufficiency gate.
Other failed presentation/reduction/log checks use phase `44`, which the current
host effort gate does not retry. Rank loss, online-HNF disagreement, Smith-index
disagreement, invalid invariants, failed exact operations and invalid intervals
are not evidence that more relations will repair the computation. This is an
intentional correction of formerly ambiguous failure diagnostics; successful
one-shot results and allocation order are preserved.

Discovery returns `(found, lower, upper)`. `found=False` means no certified
nonzero logarithm was exposed, not a theorem that all candidates are torsion.
The existing optional recovery stage still follows in that case. An interval
overlapping zero is distinct from an invalid inverted interval.

## Qualification and limits

The focused test prepends the actual production mathematical module verbatim
and also compiles a frozen pre-extraction block from `a72f4150`. It compares the
same one-shot result, interval, precision and exact combination rows with the
borrowed implementation in dynamic JavaScript, GMP and fmpz execution.

The exact witness uses $\alpha^3-\alpha-1=0$ and principal relations for
$2,2\alpha,2\alpha^2,2\alpha^3$. Since $\alpha$ is a unit, these have the same
ideal exponent row. The resulting exact combination has exponent sum zero and
$\alpha$-exponent one. The tests repeat logical counts $2,4,2,4$ on the same
over-capacity owners, poisoning inactive input and scratch rows/columns and
checking preservation. Exact-sized owners provide the comparison.

A direct ASan/UBSan core harness fixes the checkpoint at 3 MiB and verifies
zero retry shift, zero soft-limit exhaustion and zero upstream allocation:
four-prefix high-water is 200,336 bytes for fmpz and 530,304 bytes for GMP.
A deliberately exhausted checkpoint fails closed, followed by a successful new
call. These bounds qualify only this small genuine witness, not the entire
repeated proof suffix. Clearing values is not a checkpoint rewind.

Separate CPython execution of the actual root/helper AST compares allocation
traces with the frozen one-shot block and injects presentation, reduction,
coefficient and interval faults. It also evaluates the actual host retry gate.
Those doubles test control flow, not mathematical arithmetic.

The source closure at this lane's base plus extraction has 92 functions,
including six private borrowed helpers, one exact arena, and the unchanged
22 host-callable entries. The helpers do not need decorators or public ABI
entries to participate in the closed native root. Integration owns combined
closure pins/provenance, the full production rebuild, public cubic regressions,
and non-Linux qualification. No production build, new corpus execution or
dedicated-VM benchmark is claimed here.
