# Numerical soak and reliability qualification

The numerical release gate distinguishes a bounded repeated-work corpus case
from a genuine soak campaign. The corpus case executes 64 deterministic cycles
inside each ordinary product row; it is useful correctness evidence, but it is
not described as “long-duration.”

The release soak is collected separately on Linux x64, Linux ARM64, macOS
ARM64, and native Windows x64. On each platform it starts at least twelve fresh
Node/Sage.js processes and performs at least three aggregate minutes and 5,376
operations. Every process exercises root finding, quadrature, dense linear
solve, scalar optimization, an explicit ODE, FFT, and descriptive statistics.
It also forces an evaluation-budget stop, explicit cancellation, and callback
exception, then proves the same runtime can recover and compute a validated
root.

The collector uses garbage-collected memory samples from each child and its own
cross-session samples. A child does not stop merely because its time and work
floors are met: its final six samples must also satisfy the checked-in robust
heap and RSS slopes, or it continues until the profile's hard block and process
limits. This separates one-time lazy allocator growth from an unbounded tail.
The collector also enforces total-growth and peak-RSS ceilings. The evidence
retains the raw samples and reproducible analyses along with the exact clean
commit, built `dist` closure, harness, collector, Node executable, profile,
thresholds, every session summary, and aggregate work. Release-gate assembly
requires one unambiguous record from every supported platform.

There are three bounded profiles:

- `development`: one bounded session for focused plumbing and threshold checks;
- `release`: twelve 15-second-or-longer sessions, at least three total minutes,
  and at least 5,376 operations per platform;
- `scheduled`: twenty-four 60-second-or-longer sessions, at least 24 total
  minutes, and at least 10,752 operations per platform.

Run the development profile after a build with:

```sh
node scripts/numerical-computing/qualification/run-soak.cjs \
  --candidate "$(git rev-parse HEAD)" \
  --artifact dist \
  --profile development \
  --output build/numerical-soak.development.json
```

Routine push CI does not run this campaign. The platform release collector runs
the `release` profile, stops at the first bad process or violated criterion, and
includes its record in the final source-bound gate. A scheduled workflow may
invoke the same collector with `--profile scheduled`; there is no unbounded or
silent “run forever” mode.
