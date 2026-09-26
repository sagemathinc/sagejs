#!/usr/bin/env python3
"""Derive the closed arbitrary-ideal map authority fixture from row6 v2."""

import hashlib
import json
import pathlib
import sys

SOURCE_SHA256 = "99a848722b9dfd13d938a036a20fce9152caf601bfd37c8927f211d3d3b8ea8e"
COMPACT_CERTIFICATE_SHA256 = (
    "ce85dcbcfdae9e73f6fe789f8712c463765295c7f41749c0d6950f53127cfaf2"
)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: derive_row6_map_authority.py SOURCE OUTPUT")
    source = pathlib.Path(sys.argv[1]).read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        raise SystemExit("source row6 v2 artifact digest mismatch")
    document = json.loads(source)
    authority = {
        "schema": "sagejs.rust-class-group/arbitrary-ideal-map-authority-v1",
        "sourceInputId": document["inputId"],
        "sourceArtifactSha256": SOURCE_SHA256,
        "compactCertificateSha256": COMPACT_CERTIFICATE_SHA256,
        "invariantFactors": document["analyticCompletion"]["candidateInvariantFactors"],
        "generatorMajorCoordinates": document["classMap"]["generatorMajorCoordinates"],
        "factorBaseCatalog": document["relationLatticeEvidence"]["factorBaseCatalog"],
        "relationRecords": document["relationLatticeEvidence"]["relationRecords"],
    }
    output = json.dumps(authority, separators=(",", ":"), ensure_ascii=True) + "\n"
    pathlib.Path(sys.argv[2]).write_text(output, encoding="ascii")


if __name__ == "__main__":
    main()
