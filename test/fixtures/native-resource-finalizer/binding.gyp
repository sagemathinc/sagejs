{
  "variables": {
    "sagejs_sanitize%": 0
  },
  "targets": [
    {
      "target_name": "native_resource_finalizer_fixture",
      "sources": ["fixture.c"],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_EXPERIMENTAL",
        "NODE_API_EXPERIMENTAL_NO_WARNING"
      ],
      "cflags": ["-Wall", "-Wextra", "-Werror"],
      "xcode_settings": {
        "WARNING_CFLAGS": ["-Wall", "-Wextra", "-Werror"]
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "WarningLevel": 4
        }
      },
      "conditions": [
        ["OS!='win' and sagejs_sanitize==1", {
          "cflags": [
            "-fsanitize=address,undefined",
            "-fno-omit-frame-pointer"
          ]
        }]
      ]
    }
  ]
}
