# Number-field platform matrix, 2026-08-18

## Authority and scope

The arithmetic authority is `0abc59da72b735bbb4d90a03f980e3ffafde7b09`
(`Publish the packed word-prime Krylov kernel`). The vector010 freeze
`3ecf3eb81cc012f4cf3618230c2b1f14bbb3003e` changes only the Round4 fixture,
its focused test, and its task contract; it does not change arithmetic source.
All production kernels below were built from the `0abc59da` arithmetic source,
then the four detached validation worktrees advanced to `3ecf3eb8` only to run
the frozen vector010 regression.

The exact SSH config aliases were `m1`, `bench-arm`, `bench-1`, and `windows`.
No source in the integration worktree or the hosts' established checkouts was
changed.

## Hosts and production artifacts

Every host published all 20 production modules with native ABI 21. The three
number-field source hashes agree on every platform:

- word-prime Krylov: `81083d3f301dc1c60559baff70edf031c2837583092568a3516b3789cafbee91`
- packed BL HNF: `c76869deb2a7c6bff88abf47dd09a4cc53740386a50b7d4b8cfb2ee13a7e36c4`
- field-analysis checker: `33312d84827d7c7038f4f099041c2eb418c44230c58b6b7891034014307b9442`

| Alias | Host | Node | Production index SHA-256 | Krylov cache / artifact SHA-256 | BL cache / artifact SHA-256 | Field checker cache / artifact SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `m1` | Darwin 25.4.0 arm64 | 26.5.0 | `70fbc98a7841c651ca9a18e2b5496f7f3791877f28c2745970b7d927c4e59c2c` | `b45ea005514784403c23489882c7898fb681d5366d9089d5ae7616fb28d020f5` / `1dbfc8cc7e52bbfb741a64f87292991ddd7c944ab3f7cdffa8d5f14635adbd6a` | `1176c6404ea826c8a537b78be358a6a778668c027560b954cc18c95139bc5fa3` / `635b248517b681da738cd7fd76250107b7dd3c2519e02363e7e98a3797d80fab` | `5bd8c53a8bdefc3c6c6bba4b6c334c41a566792a22e29810d14e973a43ece9c6` / `803c88f1a45cf537455272710dee8f90fc35a97bae51a0a464a1e57f769a4646` |
| `bench-arm` | Linux 6.17.0-1022-gcp arm64 | 26.5.1 | `debd37e5f429637583610474a1d3db1343a980c83c9298027ed713951e26b81c` | `5c9ac6d1921ed05747c5c2c4be4300469fb40650870c32d59a372e55801433f1` / `57e8dd913b374166b8a2af707cdbd29ccda9db24f0a4e9a060e70bdba4618bb7` | `7335280cd1ec95547d383ca2015c48dcb70830c89bf08b11b79b221aa813c801` / `4510fb0e35034626698b3becf60be7404f97f36d457e63521e619b2438122e9f` | `c99cc4d1229aae023b8a883d56d75ca2fef3f3c249b391aab38961dbff905f05` / `2fa9cf9b938137fd0e6485e48b2d8ffc71e12936a89da0466930176cabe79adb` |
| `bench-1` | Linux 6.17.0-1022-gcp x64 | 26.5.1 | `6283bcd67415febbbc91a8623499766dedf73ec12ab88d66c9aa8a6c8a4f5a8b` | `0c0f503339dda78169437740735bf26fbacfd327a005cb92e748ba8561f8cdd3` / `6c6886f7593386ef3b985b3a28093a3a51173f5105ede87bcad2a6334fb2f85d` | `a9e26bcb4ef1a4bf0caffb092f655238d666a367b469a2d769c5bf25fcbbff06` / `1ddc6a84af4e5fcfce0d4e4a4e241ad26af0793b035f8129b7f573dac05bf7d8` | `94809642db469581a96fe5fed9cda6c1de038b8e64ee4c7dd274c1deec29fec0` / `69816a522f7988e00fc14a25c867aa582fa576b8e3564a7f82857a0ecccbbc9f` |
| `windows` | Windows Server 2022 10.0.20348 x64 | 26.5.1 | `ef6249ff108f74c4f3a2673615c88a198357aba9d54783885f0ae754bfeab767` | `03b76550364dd9637f497b5cb9ccb6f936b4402a3c252105cf71b8678f084a33` / `7a1e2ec6a4e83fcda87b30b2a14e14dbd8131a2f6822cac71e220fc6ff96a88b` | `bee30aa558d2d879064b23541d4034e5aac83551a3a7c55611e2a1a765b0166d` / `f2cf29ee4eebb3e61869d2041c19c2d40ac382ac85dd9308c1964a5cfa4c7c5b` | `7cddc8ff7b09f3b4ea2850a2d007cb5089da91de08c40ad4e68d7738a806e345` / `879cba495bba56f298771555bd621ef8accc37c0bdc8fd104c45e655cee9a690` |

## Focused exact matrix

The common command at `0abc59da` was:

```text
node --test --test-concurrency=1 \
  test/production-native-kernels.cjs \
  test/number-field-maximal-order-engine.cjs \
  test/number-field-large-prime-maximal-order.cjs \
  test/number-field-analysis-resource-python.cjs \
  test/number-field-analysis-public-hook.cjs \
  test/number-field-buchmann-lenstra-fast.cjs \
  test/word-prime-krylov.cjs
```

| Alias | Exact result | Confirmed passes |
| --- | --- | --- |
| `m1` | 19 pass, 1 integration-test failure, 67.116 s | public maximal orders, large-prime exact fallback, field-analysis authentication and production autoload, packed BL T8 HNF and corruption rejection, both compiled Krylov tests |
| `bench-arm` | 19 pass, 1 integration-test failure, 141.758 s | same |
| `bench-1` | 19 pass, 1 integration-test failure, 97.551 s | same |
| `windows` | 17 pass, 3 non-mathematical test/harness failures, 169.716 s | public maximal orders, large-prime exact fallback, field-analysis authentication and production autoload, production kernel ABI checks, and compiled Krylov path witness |

The shared failure in `packed field-analysis proof is source-transparent and
differential` is deterministic on all four hosts. Its strict temporary cache
compiles only `field_analysis_resource.py`, but importing the number-field
package now also loads production-registered `packed_row_hnf_in_place`. Strict
mode correctly rejects that missing second artifact. The ordinary independent
authentication tests, packed fixed-point CPython oracle, production source-hash
check, required autoload, and public authenticated result all pass. This is a
test-cache isolation defect, not an authentication or arithmetic defect.

Specifically, `test/number-field-analysis-resource-python.cjs:324` compiles
only the field-analysis source. The native witness at line 325 reaches
`bl_composite_kernel.py`, and the exit-status assertion at line 308 reports:

```text
RuntimeError: native kernel packed_row_hnf_in_place from
.../sagejs/number_fields/bl_composite_kernel.py has no matching compiled artifact
```

The minimal focused repair is to compile `bl_composite_kernel.py` into the same
temporary cache before starting the required-native witness, or equivalently to
compile the complete production dependency closure.

Windows has two additional harness-only failures:

- The packed BL test's CPython half completes. The next call tries to spawn the
  extensionless `bin/sagejs` path directly rather than invoking it through
  Node; native Windows reports no child result and the assertion itself then
  throws `ERR_INVALID_ARG_TYPE` because its diagnostic message is `undefined`.
  The direct call is at `test/number-field-buchmann-lenstra-fast.cjs:131`, with
  the resulting assertion stack at line 125. Passing `process.execPath` as the
  command and `bin/sagejs` as the first argument is the minimal portable fix.
- The compiled Krylov/FLINT differential completes, then `rmSync` reports
  `EPERM` at `test/word-prime-krylov.cjs:132` while deleting its temporary
  native-cache directory. The separate compiled/native/dynamic path test
  passes. Replacing both direct cache removals (lines 132 and 261) with the
  existing `test/helpers/native-cache-cleanup.cjs` helper is the minimal fix;
  that helper defers cleanup until Windows releases the mapped `.node` DLL.

No mathematical mismatch or certificate failure was observed.

## Harness closure at `00945940`

Commit `00945940` changes only the three affected test harnesses. It was
applied to the existing detached validation worktrees without rebuilding the
`0abc59da` arithmetic sources or any native artifact. Only the tests that had
failed in the original focused matrix were rerun.

The repaired strict-cache differential command was:

```text
node --test \
  --test-name-pattern=packed.*field-analysis.*differential \
  test/number-field-analysis-resource-python.cjs
```

| Alias | Result | Focused test / runner duration |
| --- | --- | ---: |
| `m1` | pass | 48.976 / 49.058 s |
| `bench-arm` | pass | 62.565 / 62.649 s |
| `bench-1` | pass | 37.044 / 37.121 s |
| `windows` | pass | 102.592 / 102.702 s |

The two native-Windows-only reruns also pass:

| Test | Result | Focused test / runner duration |
| --- | --- | ---: |
| `test/number-field-buchmann-lenstra-fast.cjs` | pass | 3.462 / 3.579 s |
| `packed.*Krylov.*matches.*FLINT` in `test/word-prime-krylov.cjs` | pass | 3.814 / 3.992 s |

Thus the strict-cache dependency closure, portable `bin/sagejs` launch, and
Windows loaded-addon cleanup fixes close every harness failure from the
original four-platform matrix. The final focused rerun status is green on all
required platforms.

## Frozen vector010

After advancing only the fixture/test layer to `3ecf3eb8`, each host ran:

```text
node --test --test-name-pattern="vector 010 completes" \
  test/number-field-round4.cjs
```

| Alias | Result | Duration |
| --- | --- | ---: |
| `m1` | pass | 51.684 s |
| `bench-arm` | pass | 130.555 s |
| `bench-1` | pass | 92.728 s |
| `windows` | pass | 101.606 s |

The test requires compiled word-prime Krylov, reconstructs the exact frozen
basis, verifies local index valuation 222, ramification degree 16, residue
degree 2, 67 characteristic-polynomial calls, 24 modular characteristic calls,
17 exact quotient recoveries, the final Ford-Letard certificate, and rejection
of a corrupted certificate basis.

## Environmental observations

- The immutable native-dependency checksum URL returned HTTP 404 on all four
  hosts. Existing host-local dependency prefixes with the same pinned native
  versions were therefore used to rebuild the current adapters and kernels.
- A fresh macOS worktree required `git submodule update --init --recursive`
  before `pnpm build` could build the vendored parsers.
- Reused validation worktrees contained stale ignored partial native prefixes;
  an unqualified build failed closed on missing `flint/dirichlet.h`. Pointing
  the current compiler at the established complete host prefix resolved this.
- Windows had CMake 3.31.6 and clang-cl 19.1.5 installed under Visual Studio
  Build Tools, but those directories were absent from non-interactive SSH
  `PATH`. Adding the exact installed directories enabled native compilation.

These are setup/release-artifact issues and are separate from the exact
number-field results above.
