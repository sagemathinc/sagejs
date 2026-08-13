{
  "variables": {
    "macos_deployment_target": "<!(node ../../scripts/darwin-native.cjs --deployment-target)",
    "native_prefix": "<!(node scripts/native-prefix.cjs)",
    "windows_clang_builtins": "<!(node scripts/windows-clang-builtins.cjs)"
  },
  "targets": [
    {
      "target_name": "sagejs_flint",
      "sources": [
        "src/addon.c",
        "src/algebraic.c",
        "src/charpoly.c",
        "src/cyclotomic_rref.c",
        "src/dirichlet.c",
        "src/extension_field.c",
        "src/floating.c",
        "src/matrix.c",
        "src/modsym_core.c",
        "src/number_field_factor.c",
        "src/p1_core.c",
        "src/prime_count.c",
        "src/multivariate.c",
        "src/p1.c",
        "src/sparse_rational.c"
      ],
      "include_dirs": ["<(native_prefix)/include", "include"],
      "defines": ["NAPI_VERSION=8"],
      "conditions": [
        ["OS=='linux' and target_arch=='x64'", {
          "defines": ["SAGEJS_HAVE_SMALLJAC=1"],
          "libraries": [
            "<(native_prefix)/lib/libsmalljac.a",
            "<(native_prefix)/lib/libff_poly.a",
            "<(native_prefix)/lib/libflint.a",
            "<(native_prefix)/lib/libopenblas.a",
            "<(native_prefix)/lib/libmpc.a",
            "<(native_prefix)/lib/libmpfr.a",
            "<(native_prefix)/lib/libgmp.a",
            "-lm",
            "-lpthread"
          ],
          "cflags": [
            "-O3",
            "-fPIC",
            "-Wall",
            "-Wextra",
            "-ffunction-sections",
            "-fdata-sections"
          ],
          "ldflags": [
            "-Wl,--gc-sections",
            "-Wl,--exclude-libs,ALL",
            "-Wl,--strip-all"
          ]
        }],
        ["OS=='linux' and target_arch=='arm64'", {
          "libraries": [
            "<(native_prefix)/lib/libflint.a",
            "<(native_prefix)/lib/libopenblas.a",
            "<(native_prefix)/lib/libmpc.a",
            "<(native_prefix)/lib/libmpfr.a",
            "<(native_prefix)/lib/libgmp.a",
            "-lm",
            "-lpthread"
          ],
          "cflags": [
            "-O3",
            "-fPIC",
            "-Wall",
            "-Wextra",
            "-ffunction-sections",
            "-fdata-sections"
          ],
          "ldflags": [
            "-Wl,--gc-sections",
            "-Wl,--exclude-libs,ALL",
            "-Wl,--strip-all"
          ]
        }],
        ["OS=='mac'", {
          "libraries": [
            "<(native_prefix)/lib/libflint.a",
            "<(native_prefix)/lib/libopenblas.a",
            "<(native_prefix)/lib/libmpc.a",
            "<(native_prefix)/lib/libmpfr.a",
            "<(native_prefix)/lib/libgmp.a"
          ],
          "cflags": [
            "-O3",
            "-fPIC",
            "-Wall",
            "-Wextra"
          ],
          "xcode_settings": {
            "GCC_OPTIMIZATION_LEVEL": "3",
            "MACOSX_DEPLOYMENT_TARGET": "<(macos_deployment_target)"
          }
        }],
        ["OS=='win'", {
          "defines": ["_CRT_SECURE_NO_WARNINGS"],
          "libraries": [
            "<(native_prefix)/lib/flint.lib",
            "<(native_prefix)/lib/openblas.lib",
            "<(native_prefix)/lib/mpc.lib",
            "<(native_prefix)/lib/mpfr.lib",
            "<(native_prefix)/lib/gmp.lib",
            "<(native_prefix)/lib/pthreadVC3.lib",
            "<(windows_clang_builtins)"
          ],
          "configurations": {
            "Release": {
              "msbuild_toolset": "ClangCL",
              "msvs_settings": {
                "VCCLCompilerTool": {
                  "RuntimeLibrary": 2
                }
              }
            }
          },
          "msvs_settings": {
            "VCCLCompilerTool": {
              "Optimization": 3,
              "WarningLevel": 3
            }
          }
        }]
      ]
    }
  ]
}
