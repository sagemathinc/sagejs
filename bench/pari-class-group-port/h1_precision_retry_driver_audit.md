# H1 precision retry driver audit

## Boundary

`h1_precision_retry_driver.cjs` is an answer-independent host owner for the
precision-dependent suffix of the authentic
`x^3 - 20018*x + 20034`, `h = 1` computation. It accepts live resident roots,
the 73 retained exact principal generators and their two unit combinations,
and the exact multiplication table. It does not read a fixture, class answer,
successful precision, or retry count.

Each attempt does exactly three things:

1. rebuild the embedding from the resident p192 algebraic roots;
2. rebuild all retained S-unit logarithms from exact generators; and
3. execute the translated real-cubic `getfu` reconstruction.

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
| 192 | `PRECI` | 1916 |
| 384 | `PRECI` | 1724 |
| 768 | `PRECI` | 1340 |
| 1536 | `PRECI` | 572 |
| 2176 | `PRECI` | -2 |

The final row is an important negative result. The currently translated cubic
embedding/logarithm corridor has a reviewed ceiling of 2176 bits, and the
actual unit reconstruction is still two bits short there. The driver therefore
returns `resource-cap` and publishes no units. It does not reinterpret the
previously convenient p2176 fixture boundary as a successful retry.

The next PARI transition would request 3264 bits. Reaching live success now
requires extending the reviewed precision corridors in
`cubic_embedding_precision_rebuild.py` and its wide logarithm dependencies;
the retry orchestration itself is complete.

## Focused checks

`check_h1_precision_retry_driver.cjs` derives compact unit provenance through
the existing live owner bridge, composes it with the resident HNF transforms,
and passes the resulting exact owners to the new driver. It checks:

- the live transition schedule above;
- a lower caller resource cap at 2048 bits;
- absence of public result buffers on every precision failure; and
- rejection of an injected mutation to a retained principal generator after
  the first attempt.

The resident JSON is test input to the checker only. The driver contains no
filesystem access and receives all owners directly from its caller.
