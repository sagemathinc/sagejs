# Prepared public statistics: development opportunity evidence

These are **two working-source observations, not a frozen paired performance
claim or a completed N2 qualification**. Each record binds every statistics
source file, emitted core/addon, collector, workload, compiler artifact and host.
The unchanged built compiler is used with explicit fresh-source imports; this
is not a complete newly built product. The optional native modules are compiled
before the numerical process starts, not during the query.

Each process uses the original N0 offset-data workload, 20,000 observations,
three warmups, seven samples, and the full public `describe()` query. It includes
sorting, MAD, independent validation, structured results and traces, not just
the compiled arithmetic. Every returned value and validation record agrees
with CPython. Preparation/copying is reported separately, and no sorted order
or answer is precomputed during that preparation.

| Sage.js route | No-trace query | Summary query | Separate preparation |
| --- | ---: | ---: | ---: |
| Generic iterable | 1556 ms | 1556 ms | included in query |
| Prepared ordinary source | 1071 ms | 1058 ms | 500–508 ms |
| Prepared native arithmetic, stable packed ordering | 32.5 ms | 34.1 ms | 504–531 ms |

CPython's corresponding prepared query is 7.7–7.9 ms, with approximately 11 ms
preparation. The earlier `generic-ordering.json` measures 238–242 ms for the
native public query before the stable packed ordering helper. These separate
development runs motivate that helper; they are not an interleaved crossover
isolating its exact speedup.

The prepared native query is promising for repeated jobs, but adding preparation
back makes first use roughly 0.54–0.56 s. **The 10 ms public target does not pass.**
The baseline generic path remains correct and unchanged in selection. Missing,
stale or unavailable native artifacts use the ordinary fallback.

Still open: frozen paired runs, phase attribution, startup and peak/retained
memory, public Wasm/browser execution, full four-platform and minimum-Node
qualification, independently lazy production packaging, and npm/SEA witnesses.
No default or release threshold is promoted by these files.

```sh
node bench/numerics/performance/prepared-statistics.cjs --output build/new-observation.json
```
