{
  "variables": {
    "native_prefix": "<!(node scripts/native-prefix.cjs)"
  },
  "targets": [
    {
      "target_name": "sagejs_flint",
      "sources": ["src/addon.c"],
      "include_dirs": ["<(native_prefix)/include"],
      "libraries": [
        "<(native_prefix)/lib/libflint.a",
        "<(native_prefix)/lib/libmpfr.a",
        "-lgmp",
        "-lm",
        "-lpthread"
      ],
      "defines": ["NAPI_VERSION=6"],
      "cflags": ["-O3", "-fPIC", "-ffunction-sections", "-fdata-sections"],
      "ldflags": [
        "-Wl,--gc-sections",
        "-Wl,--exclude-libs,ALL",
        "-Wl,--strip-all"
      ]
    }
  ]
}
