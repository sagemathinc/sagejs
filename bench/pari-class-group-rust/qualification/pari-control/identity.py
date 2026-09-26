#!/usr/bin/env python3
"""Print the authenticated, already-built PARI control identity."""

import json

from run import authenticated_build

print(json.dumps(authenticated_build(), sort_keys=True, separators=(",", ":")))
