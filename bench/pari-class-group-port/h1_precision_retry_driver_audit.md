# H1 precision retry driver audit

## Boundary

`h1_precision_retry_driver.cjs` is an answer-independent host owner for the
precision-dependent suffix of the authentic
`x^3 - 20018*x + 20034`, `h = 1` computation. It accepts live resident roots,
the 73 retained exact principal generators and their two unit combinations,
the exact pre-`getfu` factor, and the exact multiplication table. It does not
read a fixture, class answer, successful precision, or retry count.

Each attempt does exactly three things:

1. rebuild the embedding from the resident p192 algebraic roots;
2. rebuild all retained S-unit logarithms from exact generators; and
3. execute the translated signed real-cubic `getfu` reconstruction, retaining
   the live characteristic-two phases and exact pre-`getfu` factor.

Only these numerical owners are rebuilt. A digest of every retained exact
owner is checked after every attempt. A failed unit reconstruction must also
leave sentinel-filled public unit and logarithm buffers unchanged.

On live status `fupb_PRECI = 3`, the next request is produced by the compiled
`pari_live_retry_transition`, which implements the pinned PARI 2.17.4
`myprecdbl` policy. When that request crosses a caller-declared resource cap,
the cap itself is attempted once. There is no fixed loop count.

## Focused result

Starting at p192, the real translated leaves produce this schedule:

| attempt precision | live `getfu` status | recorded precision deficit |
| ---: | ---: | ---: |
| 192 | `PRECI` | 1923 |
| 384 | `PRECI` | 1731 |
| 768 | `PRECI` | 1347 |
| 1536 | `PRECI` | 579 |
| 2304 | success | -178 |

The terminal row is a live success: both reconstructed candidates pass exact
unit authentication with norm `-1`. No p2304 constant occurs in the driver;
it is selected by applying the pinned PARI transition to the preceding live
p1536 `PRECI` result. The formerly fixed arithmetic guards were extended to a
reviewed p4096 public corridor with p4352 internal guard storage, so a later
policy transition remains executable if another input requires it.

An intermediate unsigned run remained `PRECI` even after numerical rounding
stabilized because one unit has nontrivial real sign phases. The authoritative
root must call `pari_getfu_signed_real_cubic`: discarding those live phase bits
converges to absolute values that need not be an algebraic unit.

## Focused checks

`check_h1_precision_retry_driver.cjs` derives compact unit provenance through
the existing live owner bridge, composes it with the resident HNF transforms,
and passes the resulting exact owners to the new driver. It checks:

- the live transition schedule and exact p2304 success above;
- a lower caller resource cap at 2048 bits;
- absence of public result buffers on every precision failure; and
- rejection of an injected mutation to a retained principal generator after
  the first attempt.

The resident JSON is test input to the checker only. The driver contains no
filesystem access and receives all owners directly from its caller.
