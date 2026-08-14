{
  "variables": {
    "macos_deployment_target": "<!(node ../../scripts/darwin-native.cjs --deployment-target)",
    "native_prefix": "<!(node scripts/native-prefix.cjs)"
  },
  "targets": [
    {
      "target_name": "sagejs_graph",
      "sources": ["src/addon.c"],
      "include_dirs": ["<(native_prefix)/include", "<(native_prefix)/include/igraph", "include"],
      "defines": ["NAPI_VERSION=8", "IGRAPH_STATIC=1"],
      "conditions": [
        ["OS=='linux'", {
          "libraries": ["<(native_prefix)/lib/libigraph.a", "-lm"],
          "cflags": ["-O3", "-fPIC", "-Wall", "-Wextra"],
          "ldflags": ["-Wl,--exclude-libs,ALL"]
        }],
        ["OS=='mac'", {
          "libraries": ["<(native_prefix)/lib/libigraph.a"],
          "cflags": ["-O3", "-fPIC", "-Wall", "-Wextra"],
          "xcode_settings": {
            "GCC_OPTIMIZATION_LEVEL": "3",
            "MACOSX_DEPLOYMENT_TARGET": "<(macos_deployment_target)"
          }
        }],
        ["OS=='win'", {
          "defines": ["_CRT_SECURE_NO_WARNINGS"],
          "libraries": ["<(native_prefix)/lib/igraph.lib"],
          "configurations": {
            "Release": {
              "msvs_settings": {
                "VCCLCompilerTool": {
                  "AdditionalOptions": ["/Brepro"],
                  "DebugInformationFormat": 0,
                  "RuntimeLibrary": 0
                },
                "VCLinkerTool": {
                  "AdditionalOptions": ["/Brepro"],
                  "GenerateDebugInformation": "false"
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
