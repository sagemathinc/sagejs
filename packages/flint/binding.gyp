{
  "variables": {
    "native_prefix": "<!(node scripts/native-prefix.cjs)"
  },
  "targets": [
    {
      "target_name": "sagejs_flint",
      "sources": ["src/addon.c", "src/floating.c"],
      "include_dirs": ["<(native_prefix)/include", "include"],
      "libraries": [
        "<(native_prefix)/lib/libflint.a",
        "<(native_prefix)/lib/libmpc.a",
        "<(native_prefix)/lib/libmpfr.a",
        "-lgmp",
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
