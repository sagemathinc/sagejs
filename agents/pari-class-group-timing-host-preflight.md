# PARI class-group timing-host preflight

Date: 2026-09-18 (UTC)

This is a read-only preflight of the existing SSH targets `opt` and `bench-1`
for the corrected row-14 eleven-pair campaign.  It did not install software,
create a worktree, build anything, change either host, or run any class-group
workload.  The observations below are a point-in-time inventory, not a timing
receipt.

## Verdict

Use **`opt`** as the prospective timing authority, but do not run the promotion
campaign there yet.

`opt` is quiet, has enough RAM and backed-up disk, has Node and pnpm directly on
the non-login `PATH`, has the existing project-native FLINT/GMP prefix, and—at a
nondefault path—already has a pristine PARI 2.17.4 source/archive/build whose
two source authorities match the row-14 adapter.  It is therefore substantially
closer to ready than `bench-1`.

Neither host currently meets the Phase-6 timing contract.  On both hosts:

- `taskset` can restrict the campaign process to one physical vCPU and thereby
  satisfy the runner's one-CPU *process-affinity* check;
- no CPU is kernel-isolated, the user cannot create or administer a shielding
  cpuset, and other host processes remain schedulable on the selected CPU;
- the virtual machine exposes neither a cpufreq governor nor turbo/frequency
  policy controls, so the required fixed-frequency policy cannot presently be
  demonstrated;
- `/scratch` does not exist and `/` is not writable by the user, while the
  campaign runner deliberately refuses to write anywhere outside `/scratch`;
- the target integration worktree and row-14 runner are absent; and
- the checked-out `/home/user/sagejs` tree is unrelated and tracked-dirty.

The corrected integration workspace on the project host also had an uncommitted
tracked edit to
`bench/pari-class-group-port/row14_prepared_gate_c_host.cjs` during this
preflight.  The public branch pointed at
`f5cead6b957ce1b6749eb3d7ad29babbda915838`, but that commit does not contain
the in-progress edit.  Consequently there is not yet an immutable corrected
candidate that can be named and staged on either timing host.  The already
committed eleven-pair coordinator exists at that public commit, but staging it
now would omit the current correction.

## Host inventory

### `opt`

| Item | Observation |
|---|---|
| Hostname | `cocalc-vm-8d993f531c1249b28aff31a2` |
| OS | Ubuntu 24.04.4 LTS, kernel `7.0.0-1011-gcp`, KVM x86-64 |
| CPU | AMD EPYC 7B13; 4 vCPUs, 4 cores, 1 socket, 1 thread/core; one NUMA node; 32 MiB shared L3 |
| CPU topology | CPUs `0-3`; each thread-sibling set is a singleton, so there is no SMT sibling to reserve |
| RAM | 15 GiB total, about 14 GiB available; no swap |
| Storage | `/home/user`: 98 GiB total, 42 GiB available; `/scratch` absent |
| Node/pnpm | Node `v26.7.0`, pnpm `11.9.0`; available in both login and non-login shells |
| Compiler | GCC/`cc` 13.3.0; compiler executable SHA-256 `1b99826121ae6682a634e5efe09bd3e3df58ce58e0b28f849114ab5b89139c26` |
| System GP | PARI/GP 2.15.4; forbidden for new receipts |
| Project FLINT | 3.6.0 under `/home/user/sagejs/packages/flint/.native/prefix`; static library SHA-256 `2831a285cc9181566c2cab15abd6b4ed01bfd3fefc41b606e812f46e24f03615` |
| Project GMP | 6.3.0 in the same prefix; static library SHA-256 `5a25f78019799eacb6b925d78a69bcb9fd77230f22f60f908c6e5a4cf972f959` |
| System FLINT | No development headers/library discoverable through `pkg-config`; not needed if the authenticated project prefix is retained |
| Repository | `/home/user/sagejs` at `7176039c5ce2b2d6ed7557066ba919e26602d0ae`, branch `integrate/compiler-development-engine-campaign1`, with four tracked mathematical files modified |
| Target worktree | Absent; target remote-tracking ref absent locally; row-14 runner absent |
| Existing dependencies | `node_modules` about 469 MiB and project native prefix about 155 MiB |

The five-second `vmstat` sample was 99–100% idle, load averages were all zero,
and no persistent user computation was present.  This is good evidence that the
host was quiet during inspection, but it is not a reservation for a later
multi-hour run.

#### Private PARI 2.17.4 on `opt`

The adapter's default `/home/user/upstream/pari-2.17.4` tree is absent, but an
acceptable pristine candidate is already present:

- archive:
  `/home/user/pari-frontier/src/pari-2.17.4.tar.gz`
- source/build root:
  `/home/user/pari-frontier/src/pari-2.17.4`
- archive SHA-256:
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`
- `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`
- `Olinux-x86_64/libpari.so` SHA-256:
  `41ed8ea5b4e7919abbc94e191a152107bffde55bf5757b8a5ceeaf79ae116d87`
- `pari.cfg`: release 2.17.4, x86-64 kernel, GCC, `-O3 -Wall
  -fno-strict-aliasing`.

The archive and `buch2.c` hashes are exactly the authorities embedded in
`row14_pari_prepared_timing_adapter.cjs`.  The timing run can use this tree by
setting:

```bash
SAGEJS_PARI_ROOT=/home/user/pari-frontier/src/pari-2.17.4
SAGEJS_PARI_ARCHIVE=/home/user/pari-frontier/src/pari-2.17.4.tar.gz
```

There is also `/home/user/pari-adjacent-trace/src/pari-2.17.4`, but its
`buch2.c` SHA-256 is
`e4a24c92dd3ee07f31c760077c3957f64dc6b9fc8c96b650acec0d6153ab6ec1`.
It is instrumented or otherwise changed and the pristine adapter will reject
it.  It must not be used for the matched series.

### `bench-1`

| Item | Observation |
|---|---|
| Hostname | `cocalc-vm-51c5044ca6d3406d983e0f10` |
| OS | Ubuntu 24.04.4 LTS, kernel `7.0.0-1011-gcp`, KVM x86-64 |
| CPU | AMD EPYC 7B13; 8 vCPUs, 8 cores, 1 socket, 1 thread/core; one NUMA node; 32 MiB shared L3 |
| CPU topology | CPUs `0-7`; every thread-sibling set is a singleton |
| RAM | 31 GiB total, about 30 GiB available; no swap |
| Storage | `/home/user`: 148 GiB total, only 5.4 GiB available (97% used); `/scratch` absent |
| Node/pnpm | Node `v26.5.1`, pnpm `11.9.0` under `/home/user/.local`; available only after login-shell PATH initialization, not on the plain SSH non-login PATH used in the first probe |
| Compiler | GCC/`cc` 13.3.0; same compiler executable hash as `opt`; Clang 18.1.3 also present |
| System GP | PARI/GP 2.15.4; forbidden for new receipts |
| Project FLINT | 3.6.0 under the project prefix; static library SHA-256 `a9c0c44effb786ca34bd9e272c7499f1a92ad13d955afcfdb930f4fe75590775` |
| Project GMP | 6.3.0 under the project prefix; static library SHA-256 `a041724ce26b67d1466527443b2acf20fe1ebddd56ab3aa768b9ede57e1143d6` |
| System FLINT/GMP | FLINT 3.0.1 and GMP 6.3.0 development packages present; the campaign should nevertheless retain and hash its project-native 3.6.0/6.3.0 prefix |
| Private PARI 2.17.4 | No archive, source tree, or `libpari.so` found in the bounded `/home/user` search or at the adapter default |
| Repository | `/home/user/sagejs` detached at `88f4b7b66dac44513b8194a7681acd856ad45b6d`, with four tracked files modified |
| Target worktree | Absent; target remote-tracking ref absent locally; row-14 runner absent |
| Existing dependencies | `node_modules` about 521 MiB and project native prefix about 155 MiB |

The host was essentially idle over the five-second sample after a transient
Ubuntu release-check process exited.  Its extra RAM is attractive, but row 14
already fits the 4 GiB cap; the nearly full disk, absent private PARI build, and
login-only tool PATH make it a worse staging choice than `opt`.

## Pinning, exclusivity, and frequency policy

On each host, `taskset -c 0` and `taskset -c 1` produced the expected singleton
`Cpus_allowed_list`.  Thus a launch such as

```bash
SAGEJS_TIMING_CPU=3 taskset -c 3 ...
```

will pass the coordinator's affinity admission and ensure that the campaign
process itself does not migrate.  Because the EPYC guests expose one thread per
core, there is no sibling hyperthread to exclude.

That is **pinning, not exclusivity**.  Both guests have an effective root cpuset
covering all CPUs, empty `isolated` and `nohz_full` sets, unwritable cgroup
controls, and no user privilege to shield a CPU from system services.  Final
qualification therefore needs one of:

1. an administrator/coordinator-provided exclusive cpuset containing one CPU;
2. an explicit reservation of the entire VM plus a before/during/after process
   and scheduler-noise audit, if that is accepted as the host's exclusivity
   mechanism; or
3. a newly provisioned timing VM with an isolated physical core.

Likewise, both VMs reported 2450 MHz for every vCPU, but expose no
`scaling_driver`, governor, available-governor, current-frequency, turbo, or
boost control files.  The user cannot set or authenticate a fixed governor.
A final receipt must not claim a fixed governor from the 2450 MHz snapshot.
Either the VM provider/administrator must supply an enforceable fixed-frequency
contract, or the plan must explicitly record and accept a virtual fixed-rate
authority with repeated frequency/noise observations.  The latter would be a
policy decision, not something established by this preflight.

## Can the corrected eleven-pair campaign be staged?

**Not immediately.**  It is technically stageable on `opt` after the following
prerequisites, but the current host state would fail before mathematical timing:

1. Commit, validate, and push the in-progress row-14 correction, then freeze the
   exact candidate commit.  Do not stage the tracked-dirty project workspace.
2. Fetch that exact commit on `opt` and create a new clean timing worktree.  The
   public branch is reachable at commit
   `f5cead6b957ce1b6749eb3d7ad29babbda915838` as of this audit, so transport is
   available; the final correction still needs its own immutable commit.
3. Provision a writable `/scratch` mount or directory for the receipt and
   rebuildable cache.  The current user cannot create `/scratch` from `/`.
4. Retain or reproduce the project FLINT 3.6.0/GMP 6.3.0 prefix and dependencies
   in the clean candidate, then freeze their hashes with Node 26.7.0 and GCC
   13.3.0.  Do not silently fall back to system libraries.
5. Point the adapter at the pristine `pari-frontier` tree above and let its
   archive/source/library/toolchain authentication run before timing.
6. Obtain a real host reservation/exclusive-core mechanism and resolve the
   fixed-frequency evidence gap.  Recheck load and competing processes
   immediately before and throughout the series.
7. Run the focused non-mathematical coordinator/checker gates first.  Only then
   launch the prescribed `taskset`, 4 GiB `prlimit`, `--cpu=7200`, and
   `node --expose-gc` command.

At one-second minimum arms, the 44-arm schedule has an absolute timed lower
bound of 44 seconds.  Based on the existing row-14 measurements (roughly 91
seconds per fresh Sage computation and roughly 2 seconds per PARI computation),
22 Sage plus 22 PARI arms are likely to require roughly 34 minutes of kernel
time, plus excluded preparation/compilation and receipt checks.  The prescribed
7200-second CPU limit is adequate, and `opt`'s 15 GiB RAM is adequate for the
4 GiB cap.

`bench-1` can also be made stageable, but only after substantial disk cleanup,
installation/authentication of the private PARI tree, explicit login PATH or
absolute Node/pnpm paths, the same `/scratch` and exclusivity work, and a clean
candidate worktree.  Nothing in the row-14 memory profile justifies choosing it
over `opt` at present.

## Read-only evidence collected

The preflight used only SSH commands that read host state: `uname`,
`/etc/os-release`, `lscpu`, `/proc`, sysfs CPU topology/frequency files,
`taskset` on short shell probes, `free`, `df`, `uptime`, `vmstat`, `ps`, tool
version queries, `pkg-config`, `dpkg-query`, `stat`, `sha256sum`, bounded `find`,
and read-only Git identity/ref/worktree queries.  No campaign worker, compiler,
package manager, build system, or PARI class-group function was invoked.
