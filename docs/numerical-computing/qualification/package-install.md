# Fresh npm and relocated SEA qualification

The package qualification command tests the production archives, not the
workspace packages. It creates a new temporary project, installs the public
`@sagemath/sagejs` archive and exactly one matching platform archive through
absolute `file:` URLs, and checks that private native workspaces did not leak
into the consumer. It then exercises:

- CommonJS and ESM public APIs through the installed native kernel;
- ordinary Python Brent root finding from the installed public package;
- lazy cminpack least squares and NLopt minimization from that package;
- the same numerical smoke through `createSage()` and its installed SEA; and
- a separately copied `sagepython` executable after relocation.

Run it on the host matching the release target:

```sh
pnpm release:qualify:package -- --target linux-x64
pnpm release:qualify:package -- --target linux-arm64
pnpm release:qualify:package -- --target macos-arm64
pnpm release:qualify:package -- --target windows-x64
```

The default archive paths are
`build/release/npm/sagejs.tgz` and
`build/release/npm/sagejs-<target>.tgz`. Explicit paths are accepted without
shell-specific quoting or path conversion:

```sh
pnpm release:qualify:package -- \
  --target linux-x64 \
  --root /qualified/npm/sagejs.tgz \
  --platform-package /qualified/npm/sagejs-linux-x64.tgz
```

The equivalent PowerShell invocation is:

```powershell
pnpm release:qualify:package -- `
  --target windows-x64 `
  --root C:\qualified\npm\sagejs.tgz `
  --platform-package C:\qualified\npm\sagejs-windows-x64.tgz
```

The command rejects a target that does not match the current Node platform and
architecture. Cross-compiling a tarball is not evidence that its executable
ran on the target.

## Qualification adapter runners

`scripts/package-qualification/runtime.cjs` exports reusable preparation and
execution boundaries for the source-bound P8 collector:

- `prepareFreshInstall(...)` and `runInstalledSourcePython(...)` execute
  arbitrary Python source from an isolated installed public package;
- `runInstalledKernelPython(...)` executes arbitrary Python source through the
  installed public `createSage()` API and platform SEA;
- `runInstalledNode(...)` executes target-side JavaScript from the isolated
  consumer and exposes only the exact installed root through
  `SAGEJS_QUALIFICATION_INSTALLED_ROOT`;
- `runInstalledSourceLanguage(...)` executes scripted Sage, Python, MATLAB,
  Magma, or Wolfram input from installed package bytes; and
- `prepareRelocatedSea(...)`, `runRelocatedSeaPython(...)`, and
  `runRelocatedSeaLanguage(...)` execute the same inputs after copying a SEA
  away from its build or package directory.

Each runner returns `{status, signal, stdout, stderr, elapsedMs}` and does not
interpret mathematical output. P8 adapters must keep using the authoritative
product corpus and independent oracle normalization rather than duplicating
cases here. Call each context's `cleanup()` after collecting its receipt.
