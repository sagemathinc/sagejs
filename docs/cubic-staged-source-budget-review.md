# Staged cubic source allowance: provisional review

Status: 2026-09-05, **not release approval**. The proposed 485,000-byte
allowance must not be justified merely by a passing refreshed manifest.
Commit `60cb6be1` described the family as "reviewed" too strongly: combined
generated-code, resource and performance qualification was still pending.

## Source growth and purpose

The staged family totals 480,058 bytes: 433,952 bytes of mathematical Python
and 46,106 bytes of runtime support. The prerequisite branch mathematical
module has 367,810 bytes, so the staged module adds 66,142 bytes. The change
extracts shared proof phases and adds explicit borrowed scratch parameters,
bounded root-owned allocations and two-attempt orchestration. The ordinary
one-shot route retains lazy allocations. This explains the added source; it
does not establish that every added byte or abstraction is necessary.

The allowance change does not raise the 3 MiB checkpoint limit or relax
mathematical acceptance, overflow, or benchmark requirements.

## Initial artifact comparison

These are actual Linux x64 standalone family artifacts, not estimates:

| Artifact measure (bytes) | Earlier installed family | Staged family |
| --- | ---: | ---: |
| Generated `kernel_core.c` | 13,349,444 | 17,619,117 |
| Generated `kernel_core.h` | 9,411 | 9,132 |
| Generated Node wrapper `kernel.c` | 197,028 | 193,088 |
| Standalone `.node` file | 20,062,992 | 20,321,008 |
| GNU `size` text | 19,803,315 | 20,062,638 |
| GNU `size` data | 248,992 | 248,984 |
| GNU `size` bss | 227,808 | 227,808 |

Earlier cache key:
`91c13fe745a9595b181b864a5640921f8f25c656cc82c995d92076e63d5e99c4`,
source SHA256:
`a4bb54676c834e81466aacbb0c3d319a303e83262569193815ae04decb65470e`.
Staged cache key:
`fa46f7e7248fc3de25081d7c5532bd4c005a93454f3e43c3a1d9e38530f1a72a`,
source SHA256:
`d8dfbd3c7ea8d964482aed9b61851246ba59223b1beed3ac040ce0b2859d55de`.

The generated C grows about 32%, while standalone file and text size grow
about 1.3%. This comparison includes compiler changes and is **not** a
same-toolchain ablation isolating the staging change. GNU text includes more
than mathematical instructions, and standalone family sizes are not marginal
contributions to the combined production pack. Neither number is a runtime
speed or allocation measurement.

## Resource evidence and remaining requirements

Source-matched diagnostic core executions on 200 previously exposed fields
include 18 successful two-proof-attempt cases and one safe decline. The scan
also passes ASan/UBSan. It is not an authenticated independent replay, a
worst-case memory bound, or a controlled timing experiment. The staged driver's
fixed owners and borrowed helper discipline need review alongside measured
checkpoint statistics and explicit exhaustion tests.

Before promoting this allowance:

1. Compare baseline and staged generated code using the same compiler and
   dependency configuration; inspect unexpected duplication and symbols.
2. Qualify real repeated attempts, exhaustion and cleanup at the unchanged
   checkpoint bound, including authenticated independent replay.
3. Measure complete calls on `opt`, preserving proof assumptions and frozen
   heldout selection. Demonstrate that the added machinery helps the goal.
4. Complete current-source architecture provenance and platform qualification.

If those checks do not justify the growth, simplify the implementation or
reconsider the allowance. Passing the source-byte gate alone is insufficient.
