# Measuring execution

Sage.js provides two interactive timing forms. They measure execution after
the submitted source has been parsed and compiled, so compiler latency is not
silently reported as mathematical execution.

Use `time` or `%time` for one execution:

```sage
time factor(2^127 - 1)
```

On Node.js this reports user, system, total CPU, and wall time. An embedded
host without a process CPU clock reports wall time only. Lazy imports, native
addons, and compiled-kernel loading that happen during the statement contribute
to the wall and CPU totals, and are also reported as an aggregate initialization
time. Compilation of the submitted statement itself remains outside the
measurement.

Ask for the observed initialization tree when investigating a cold timing:

```sage
%time --breakdown import my_package
time --breakdown first_native_call()
```

The long spelling is intentional: the normal timing display remains compact,
while `--breakdown` identifies Python modules, native addons, and compiled
native kernels separately. It only changes formatting. Sage.js records the
same spans for an ordinary `time` statement, and it neither imports anything
extra nor moves initialization outside the statement's elapsed time. A warm
repeat has no initialization line when it performs no lazy loading.

Use `%timeit` for a stable per-loop measurement:

```sage
%timeit gcd(123456789, 987654321)
%timeit -n1000 -r5 gcd(123456789, 987654321)
```

The statement is parsed and compiled once. Sage.js then executes one untimed
warmup, automatically calibrates a loop count when `-n` is absent, and reports
the mean and population standard deviation across seven runs by default.
`-n N` chooses the loops in each run and `-r R` chooses the number of runs;
the compact forms `-n1000` and `-r5` are also accepted.

The single warmup happens before calibration and all measured samples. If it
triggers lazy initialization, `%timeit` reports that initialization separately
and does not include it in the steady-state statistics. The timed statement
uses the current interactive namespace and the current Sage or Python language mode.
Assignments and imports therefore have their normal visible effects. Its
ordinary result is suppressed, just as in IPython.

Timing very fast expressions may take several seconds: automatic calibration
deliberately chooses enough loops to distinguish the work from clock noise.
Use explicit small `-n` and `-r` values while testing side effects rather than
performance.
