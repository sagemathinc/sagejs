{
  "variables": {
    "native_prefix": "<!(node scripts/native-prefix.cjs)",
    "eclib_source": "<!(node scripts/eclib-source.cjs)",
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
        "src/eclib_rank.cc",
        "src/elliptic_lfunction.c",
        "src/extension_field.c",
        "src/floating.c",
        "src/matrix.c",
        "src/modsym_core.c",
        "src/number_field_factor.c",
        "src/p1_core.c",
        "src/prime_count.c",
        "src/multivariate.c",
        "src/p1.c",
        "src/sparse_rational.c",
        "<(eclib_source)/libsrc/interface.cc",
        "<(eclib_source)/libsrc/int.cc",
        "<(eclib_source)/libsrc/unimod.cc",
        "<(eclib_source)/libsrc/modulus.cc",
        "<(eclib_source)/libsrc/arith.cc",
        "<(eclib_source)/libsrc/marith.cc",
        "<(eclib_source)/libsrc/compproc.cc",
        "<(eclib_source)/libsrc/vector.cc",
        "<(eclib_source)/libsrc/matrix.cc",
        "<(eclib_source)/libsrc/subspace.cc",
        "<(eclib_source)/libsrc/svector.cc",
        "<(eclib_source)/libsrc/smatrix.cc",
        "<(eclib_source)/libsrc/ssubspace.cc",
        "<(eclib_source)/libsrc/smatrix_elim.cc",
        "<(eclib_source)/libsrc/xsplit.cc",
        "<(eclib_source)/libsrc/conic.cc",
        "<(eclib_source)/libsrc/legendre.cc",
        "<(eclib_source)/libsrc/quadratic.cc",
        "<(eclib_source)/libsrc/illl.cc",
        "<(eclib_source)/libsrc/hilbert.cc",
        "<(eclib_source)/libsrc/timer.cc",
        "<(eclib_source)/libsrc/cubic.cc",
        "<(eclib_source)/libsrc/polys.cc",
        "<(eclib_source)/libsrc/realroots.cc",
        "<(eclib_source)/libsrc/p2points.cc",
        "<(eclib_source)/libsrc/gf.cc",
        "<(eclib_source)/libsrc/xsplit_data.cc",
        "<(eclib_source)/libsrc/logger.cc",
        "<(eclib_source)/libsrc/curve.cc",
        "<(eclib_source)/libsrc/curvedata.cc",
        "<(eclib_source)/libsrc/curvered.cc",
        "<(eclib_source)/libsrc/points.cc",
        "<(eclib_source)/libsrc/cperiods.cc",
        "<(eclib_source)/libsrc/isogs.cc",
        "<(eclib_source)/libsrc/heights.cc",
        "<(eclib_source)/libsrc/mwprocs.cc",
        "<(eclib_source)/libsrc/lambda.cc",
        "<(eclib_source)/libsrc/sifter.cc",
        "<(eclib_source)/libsrc/sieve_search.cc",
        "<(eclib_source)/libsrc/htconst.cc",
        "<(eclib_source)/libsrc/egr.cc",
        "<(eclib_source)/libsrc/saturate.cc",
        "<(eclib_source)/libsrc/divpol.cc",
        "<(eclib_source)/libsrc/pointsmod.cc",
        "<(eclib_source)/libsrc/curvemod.cc",
        "<(eclib_source)/libsrc/ffmod.cc",
        "<(eclib_source)/libsrc/tlss.cc",
        "<(eclib_source)/libsrc/elog.cc",
        "<(eclib_source)/libsrc/mequiv.cc",
        "<(eclib_source)/libsrc/mrank1.cc",
        "<(eclib_source)/libsrc/mlocsol.cc",
        "<(eclib_source)/libsrc/mglobsol.cc",
        "<(eclib_source)/libsrc/mquartic.cc",
        "<(eclib_source)/libsrc/mrank2.cc",
        "<(eclib_source)/libsrc/qc.cc",
        "<(eclib_source)/libsrc/sqfdiv.cc",
        "<(eclib_source)/libsrc/minim.cc",
        "<(eclib_source)/libsrc/reduce.cc",
        "<(eclib_source)/libsrc/transform.cc",
        "<(eclib_source)/libsrc/desc2.cc",
        "<(eclib_source)/libsrc/bitspace.cc",
        "<(eclib_source)/libsrc/twoadic.cc",
        "<(eclib_source)/libsrc/descent.cc"
      ],
      "include_dirs": [
        "<(native_prefix)/include",
        "<(eclib_source)/libsrc",
        "include"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NO_MPFP=1",
        "ECLIB_FLINT_RANK_ONLY=1"
      ],
      "cflags_cc": ["-std=c++17", "-fexceptions"],
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
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "13.0"
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
              "WarningLevel": 3,
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
