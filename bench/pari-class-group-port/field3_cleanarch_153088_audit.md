# Field 3 packed cleanarch 153088-bit capacity audit

## Change

`pari_field3_packed_class_cleanarch` now admits whole-word `PRECI` values
through 153088 bits, the precision of the authenticated field-3 `Ce` owner.
The arithmetic operation order is unchanged: validate packed entries, obtain
the resident π value, compute its inverse, form PARI's per-column real shift,
and reduce imaginary parts modulo `2*pi` or `4*pi`.

The prior 4352-bit check was the only arithmetic precision ceiling on this
path. Its dependencies already admitted 154112 bits, retaining one 1024-bit
construction guard where required.

## Proved workspace boundary

`pari_pi_workspace_capacity` is now the single source of the Ramanujan
coefficient and binary-splitting stack dimensions used by `pari_pi_constant`.
It follows the exact upstream term selection

```text
terms = int(1 + PRECI / 47.11041314)
```

and returns `terms + 1` coefficient cells because indices zero through
`terms` are populated. At 153088 bits this is 3251 cells in each of `a`, `b`,
`p`, and `q`, plus 91 stack cells. The C7 caller obtains these values rather
than retaining its former 512/1024 fixed allocation.

For a cold cache, cleanarch checks every required capacity before changing
state, scratch, or output. A resident cache at adequate precision does not
spuriously require coefficient workspaces, matching `pari_pi_constant`.
Invalid `PRECI` also fails before publication. PARI's accuracy gate remains a
status-one return after arithmetic begins and continues to leave output
unpublished.

## Evidence

The bounded focused checker provides:

- a generated 192-bit complex input compared cell-for-cell with pristine
  PARI 2.17.4 `cleanarch`, including its `PRECI` retry calculation;
- CPython cold-cache execution at 153088 bits on a neutral generated matrix,
  proving the 3251/91 capacity and actual π construction;
- a second generated, normalized 153088-bit matrix through the same CPython
  implementation using the resident cache;
- exact short-capacity and oversized-precision rejection with state/output
  atomicity;
- low-precision generated-JavaScript, GMP, and tagged differential replay and
  tiny-workspace native preflight rejection.

No authentic 153088-bit `Ce` value or expected `Ce` output is consumed.

## Resource incident and corrected test design

An initial focused checker completed the generated 153088-bit synthetic case
on JavaScript, GMP, and tagged backends with results identical to CPython.
However, its negative test allocated four 3250/3251-cell native buffers with
a 154112-bit per-cell capacity. Fixed-capacity backing pushed the process to
approximately 4.9 GiB RSS, above the campaign's 4 GiB process-tree ceiling.
The process was stopped by campaign supervision and that test design is
classified as a resource failure, not accepted validation.

The corrected checker never allocates high-precision native coefficient
arrays. It retains the successful high synthetic observation only as incident
evidence, uses CPython's sparse integer lists for the cold high-precision
capacity proof, and uses empty native arrays for the logically equivalent
preflight-negative branch. Subsequent focused validation must run under an
inherited address-space cap below 4 GiB. No 153088-bit native/GMP/tagged run
is repeated in this lane.

## Deferred

The authentic `Ce` replay, full native and architecture suites, and required
platform gates remain integration work. This lane changes no class-group
algorithm and makes no public-completeness claim.
