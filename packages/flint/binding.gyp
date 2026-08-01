{
  "variables": {
    "native_prefix": "<!(node scripts/native-prefix.cjs)"
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
        "src/multivariate.c",
        "src/p1.c",
        "src/sparse_rational.c"
      ],
      "include_dirs": ["<(native_prefix)/include", "include"],
      "libraries": [
        "<(native_prefix)/lib/libsmalljac.a",
        "<(native_prefix)/lib/libff_poly.a",
        "<(native_prefix)/lib/libflint.a",
        "<(native_prefix)/lib/libmpc.a",
        "<(native_prefix)/lib/libmpfr.a",
        "<(native_prefix)/lib/libgmp.a",
        "-lm",
        "-lpthread"
      ],
      "defines": ["NAPI_VERSION=8"],
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
    }
  ]
}
