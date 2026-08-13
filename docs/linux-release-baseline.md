# Linux x64 release baseline

Sage.js Linux x64 release binaries target **glibc 2.28**. This matches the
oldest platform supported by official Node.js 26 binaries (RHEL 8, Debian 10,
and Ubuntu 20.04-era systems) without pretending that a binary built on the
developer's newer host is portable.

CPU portability and operating-system portability are separate contracts:

- GMP uses its fat x86-64 dispatcher, and OpenBLAS uses an explicit dynamic CPU
  target list. Release inputs must use the portable native-mathematics profile.
- The Node template and every embedded `.node` addon must satisfy
  [`linux-x64-glibc-2.28-policy.json`](../scripts/linux-baseline/linux-x64-glibc-2.28-policy.json).
  The policy caps GLIBC, GLIBCXX, CXXABI, and GCC symbol versions and allows only
  a small system dependency closure.

## Why Sage.js does not use the official Node 26 Linux binary

Node 25 and newer official Linux binaries have a `DT_NEEDED` dependency on
`libatomic.so.1`. Node's own `BUILDING.md` says users must install the
`libatomic`/`libatomic1` runtime. The dynamic loader resolves this dependency
before Sage.js starts, so an installer diagnostic or JavaScript fallback cannot
repair a missing library.

The byte-exact inspection of the official 26.7.0 Linux x64 archive is retained
as [`official-node-26.7.0-linux-x64.json`](../scripts/linux-baseline/official-node-26.7.0-linux-x64.json).
It satisfies the selected symbol-version ceilings, but the dependency allowlist
rejects it solely because of `libatomic.so.1`.

The release template is therefore built from the exact Node source tarball with
GCC and `--partly-static` inside a digest-pinned manylinux_2_28 image. Node only
adds `-latomic` on Linux when it is built with Clang; GCC x86-64 emits the needed
atomic operation without the external runtime. Partial static linking also
removes dependence on the build image's newer C++ runtime. This is a small,
upstream-supported build variation, not a Sage.js fork of Node.

The source tarball, build image, runtime image, policy, and complete native input
inspection are recorded in `linux-baseline-receipt.json`. Full builds also
retain and validate the selected portable mathematics profile: no host CPU
identity or native compiler flag, fat GMP, and dynamic-architecture OpenBLAS.
The output is then
executed in digest-pinned minimal UBI 8 after proving that image does not have
the `libatomic` package installed. It provides the target glibc, so this tests
the exact missing-library case rather than merely trusting an ELF report.

## Reproducing the proof

With Podman or Docker:

```sh
node scripts/linux-baseline/release-inputs.cjs
```

This builds and validates only the Node template, which is the quick decisive
`libatomic` proof. To build the committed Sage.js tree and inspect every native
addon as one release input set:

```sh
node scripts/linux-baseline/release-inputs.cjs --all-inputs --source-ref HEAD
```

The full mode intentionally accepts a committed Git tree, not an arbitrary
dirty checkout. It does not publish either image or artifact.

## Release policy

Release packaging must consume these inspected inputs rather than rebuilding
them on the packaging host. A newer glibc build can be useful for development,
but it is not a Linux release candidate. Raising the 2.28 floor or admitting a
new shared dependency requires an explicit policy and support decision.
