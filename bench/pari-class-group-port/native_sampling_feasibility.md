# Native sampling feasibility: unsuccessful Node collector qualification

This is a diagnostic capability audit, not a performance result. No mathematical
source, compiler implementation, installed executable, or system setting changed.

GNU gprofng 2.46 is installed. `perf` and `valgrind` are not on PATH;
`perf_event_paranoid` is 4. Clock sampling with gprofng avoids hardware counters.
All collection targeted only the newly launched child with `-F off`; no unrelated
process was attached or recorded. Commands used `-a off -j off -S off`, a fresh
`-o` experiment, and bounded smoke workloads. Metered runs retained the 4 GiB
address-space cap and the Node 1536 MiB heap cap.

## Failed and partial smokes

The installed `/opt/cocalc/bin/node` has `cap_net_bind_service=ep`. Secure loading
prevented `libgp-collector.so` preload. Initial smoke variants exited zero but
had loader warnings or no samples; exit status alone was not qualification.
Artifacts are `/tmp/sagejs-gprofng-smoke-runtime-audit{,2,3,4,5}.er`.

A private byte-identical copy `/tmp/sagejs-gprofng-node-ruCKKhP5/node` has no file
capabilities. Its SHA256, equal to the installed executable, is
`19235a9b678f84729464c52623f92de130a165452747c6826d3fdc13df3abcc3`.
The first copy launch failed because `cp --no-preserve=all` omitted executable
mode; setting mode 0700 on that private copy fixed only this launch problem.

`/tmp/sagejs-gprofng-node-ruCKKhP5/smoke.er` recorded 12 native PC samples with
resolved V8/libc names, but reported only 0.120 sampled seconds for approximately
1.223 user CPU seconds. Its header warns that the interval timer changed from
10000 to 0 and the profile may be unreliable. These are **not usable hotspot
percentages**. The independently reviewed warning invalidates the apparent
success of obtaining a few resolved PCs.

Paused-start `-y SIGUSR2` experiments `paused.er` and `paused10.er` in the same
directory fail clock initialization and warn that the target installed a handler
for signal 12. The explicit `-p 10` retry does not fix this. No full class-group
capture was attempted after these failures. The drafted signal-gating hook was
removed rather than shipping a known unqualified profiling path.

A non-Node control running `/usr/bin/sha256sum` over the copied executable also
fails clock initialization (`native-smoke.er`). Thus a Node-specific explanation
is insufficient. One narrowly scoped `strace` of that child (`timer.strace`,
`timer.er`) observes successful `timer_create` with `SIGEV_THREAD_ID` and successful
10 ms `timer_settime`; the collector then disables the timer and reports failure.
No timer syscall permission error was demonstrated. Investigation stopped here:
gprofng clock collection is not qualified in this environment.

## Reusable symbol build

The probe now accepts `--profile-symbols`, using the compiler's existing option:
same `-O3`, plus `-g`, with linker stripping disabled and a distinct cache key.
Default behavior is unchanged. The report includes generated core/module paths.

Symbol cache key: `94caa19bfd769c40b10fe62ebb88460df41bcfae506ce9e2dedbc5bb55630828`.
Original key: `2999da8d2bd7c84a8e19e4d95fbbe580864ac5a59fa9bb382b3ebd376711c8c8`.
Both are below this directory's ignored `.sagejs-native-kernels/` directory.
Their generated `kernel_core.c` hashes are identical:
`1291731544988743817e203152756b746c20cb24c14589484dbb3695ec7dabda`.
Their generated N-API `kernel.c` hashes are also identical:
`0cb57f6c47b3fd603b39b5f746741d2bd4e62b7fe370a04b07313adb7b4188b6`.

The build and tagged replay passed in 311.60 CPU seconds, 300.18 wall seconds,
with peak child RSS 3,193,436 KiB. Output `symbol-build.json` in the smoke directory
has class number 3, the exact reference regulator, and work counters 491/54/12.
No performance inference is made from this single replay.

The compiled `build/Release/obj.target/sagejs_native_kernel/kernel.o` retains a
global public GMP entry `sagejs_kernel_m_94caa19bfd769c40_pari_prepared_class_group_attempt`
and a local/private tagged entry. `kernel_core.h` declares the public GMP ABI.
Function/data sections exist, making a standalone link with unused N-API sections
discarded a plausible next step, not a tested result.

Before constructing a standalone diagnostic runner, qualify some sampler on a
simple non-Node control; the current gprofng failure does not justify assuming
that removing Node fixes collection. A runner linked to this identical generated
core and using the same exported prepared inputs must retain fresh owner
restoration and all output/work-count
checks, first qualify a bounded collector smoke, and distinguish sampled PCs
from elapsed CPU time. This audit does not implement or authorize that runner.
