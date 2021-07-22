#!/usr/bin/env bash

# Given some scripts built using emscripten, modify them
# so they are executable.

sed -i '1s/^/#!\/usr\/bin\/env node \n/' "$@"
chmod +x "$@"