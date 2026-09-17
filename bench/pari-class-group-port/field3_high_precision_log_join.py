"""Authenticate and join the field-3 high-precision logarithm owners.

The two real-place producers publish packed real triples.  The complex-place
producer publishes complete seven-cell PARI logarithm records which are
already weighted by two.  This coordinator only authenticates those owners
and lays their source-order cells out as the raw `3 x 301` logarithm matrix.
It performs no floating-point arithmetic and never reweights a computed cell.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any, Mapping, Sequence


if hasattr(sys, "set_int_max_str_digits"):
    sys.set_int_max_str_digits(0)


TARGET_BITS = 153088
TOTAL_COLUMNS = 301
SCALAR_COLUMNS = 26
REAL_PLACES = 2
PLACES = 3
PACKED_LOG_CELLS = 7
REAL_CELLS = TOTAL_COLUMNS * REAL_PLACES * 3
COMPLEX_CELLS = TOTAL_COLUMNS * PACKED_LOG_CELLS
OUTPUT_CELLS = TOTAL_COLUMNS * PLACES * PACKED_LOG_CELLS

RUN_IDENTITY = "pari-2.17.4:nfinit192->nfnewprec153088:field3"
FIELD = "x^4-2000022*x-2000042"
REAL_SCHEMA = "sagejs.pari-class-group/real-log-column-owner-v1"
COMPLEX_SCHEMA = "sagejs.pari-class-group/field3-complex-log-column-owner-v1"
OUTPUT_SCHEMA = "sagejs.pari-class-group/field3-raw-log-owner-v1"
PREFIX_SCHEMA = "sagejs-field3-complex-log-prefix-owner-v1"
LEGACY_REAL_SCHEMA = "sagejs.pari-class-group/field3-real-log-column-owner-v1"

AUTHORITY_SHA256 = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c"
INITIAL_SHA256 = "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe"
PREPARED_SHA256 = "bc0dfbca45a575a381ba87371fb27906f68b34cedd025435986fad4c7c6287cf"
NORM_SHA256 = "65e1bbd5c05b89b63d08d91e137c2ac68116db3df66073080d89ca4a55275f53"
KERNEL_SOURCE_SHA256 = (
    "87d2b07569daa31ebf62ce88c971dd0fbdf4e87e898509b9fe9d59d4da1e2007"
)
PREFIX_SHA256 = "f0a842ef820888e76b4421684a98a3cfd4654c47dee8896d63f204df7e7174fd"
LEGACY_REAL_PREFIX_SHA256 = (
    "09b0a20f1f059757ee3ed347f693fed92fb6749c2d46aac872abcffdd244fde8"
)
SOURCE_DIGESTS = {
    "principalGeneratorsSha256": (
        "31e9c9b4c0245417ce9265d5233d1a67fb717206e9811975cb85a59af03ab5de"
    ),
    "relationMetadataSha256": (
        "c751a9a91b9f17fc4047d8483e36d6ac6f9a0c1fe04ad072ed405f4a9c3a9f3b"
    ),
    "relationRecordsSha256": (
        "5df8c4bb02cd481965fdb01bac424f58d419216e3cefd4883ac985631da0e719"
    ),
}

REAL_LAYOUT = (
    "source-column-major [real-place-0 triple, real-place-1 triple]; "
    "append weighted-complex triple to form 3x301 raw log order"
)
COMPLEX_LAYOUT = (
    "source-column-major [kind, weighted-2logabs triple, weighted-2arg triple]"
)
OUTPUT_LAYOUT = (
    "source-column-major [real-place-0 seven-cell log, real-place-1 "
    "seven-cell log, complex-place-2 seven-cell weighted log]"
)

_INTEGER = re.compile(r"-?(0|[1-9][0-9]*)\Z")
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_REAL_NAME = re.compile(r"real-log-columns-complete-([0-9a-f]{64})\.json\Z")
_COMPLEX_NAME = re.compile(r"complex-log-columns-complete-([0-9a-f]{64})\.json\Z")


class Field3LogJoinFailure(ValueError):
    """One input owner or its exact cross-owner evidence is invalid."""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _packed_sha256(values: Sequence[Any]) -> str:
    return _sha256("\n".join(str(value) for value in values).encode())


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    answer: dict[str, Any] = {}
    for key, value in pairs:
        if key in answer:
            raise Field3LogJoinFailure(f"duplicate JSON key: {key}")
        answer[key] = value
    return answer


def _decode(data: bytes, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(data, object_pairs_hook=_strict_object)
    except (TypeError, ValueError, UnicodeError) as error:
        raise Field3LogJoinFailure(f"{label} is not strict JSON") from error
    if not isinstance(value, Mapping):
        raise Field3LogJoinFailure(f"{label} is not a JSON object")
    return value


def _exact_keys(value: Mapping[str, Any], keys: Sequence[str], label: str) -> None:
    if set(value) != set(keys):
        raise Field3LogJoinFailure(f"{label} keys changed")


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise Field3LogJoinFailure(f"{label} is not an integer")
    return value


def _canonical_cells(value: Any, length: int, label: str) -> list[str]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise Field3LogJoinFailure(f"{label} is not a sequence")
    if len(value) != length:
        raise Field3LogJoinFailure(f"{label} has the wrong length")
    answer: list[str] = []
    for cell in value:
        if not isinstance(cell, str) or _INTEGER.fullmatch(cell) is None:
            raise Field3LogJoinFailure(f"{label} contains a noncanonical integer")
        answer.append(cell)
    return answer


def _digest(value: Any, label: str) -> str:
    if not isinstance(value, str) or _SHA256.fullmatch(value) is None:
        raise Field3LogJoinFailure(f"{label} is not a SHA-256 digest")
    return value


def _read_hashed_owner(
    selected: str | Path,
    expected_sha256: str,
    filename_pattern: re.Pattern[str],
    label: str,
) -> tuple[Mapping[str, Any], bytes]:
    path = Path(selected)
    data = path.read_bytes()
    actual = _sha256(data)
    if actual != expected_sha256:
        raise Field3LogJoinFailure(f"{label} byte hash changed")
    match = filename_pattern.fullmatch(path.name)
    if match is None or match.group(1) != actual:
        raise Field3LogJoinFailure(f"{label} filename does not bind its byte hash")
    if stat.S_IMODE(path.stat().st_mode) != 0o444:
        raise Field3LogJoinFailure(f"{label} is not mode 0444")
    return _decode(data, label), data


def _validate_batches(
    value: Any, maximum: int, label: str, *, fixed_width: bool = False
) -> None:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence) or not value:
        raise Field3LogJoinFailure(f"{label} has no source batches")
    expected_start = 0
    for index, record in enumerate(value):
        if not isinstance(record, Mapping):
            raise Field3LogJoinFailure(f"{label} batch is not an object")
        keys = ["sourceStart", "sourceCount", "sha256"]
        if fixed_width:
            keys.insert(0, "scheduleIndex")
        _exact_keys(record, keys, f"{label} batch")
        start = _integer(record["sourceStart"], f"{label} sourceStart")
        count = _integer(record["sourceCount"], f"{label} sourceCount")
        if start != expected_start:
            raise Field3LogJoinFailure(
                f"{label} batches have a gap, overlap, or reorder"
            )
        if count < 1 or count > maximum or start + count > TOTAL_COLUMNS:
            raise Field3LogJoinFailure(f"{label} batch has an invalid range")
        if fixed_width:
            if _integer(record["scheduleIndex"], f"{label} scheduleIndex") != index:
                raise Field3LogJoinFailure(f"{label} schedule index changed")
            if start != 4 * index or count != (1 if start == 300 else 4):
                raise Field3LogJoinFailure(f"{label} deterministic schedule changed")
        _digest(record["sha256"], f"{label} batch hash")
        expected_start = start + count
    if expected_start != TOTAL_COLUMNS:
        raise Field3LogJoinFailure(f"{label} batches do not cover all columns")


def _validate_common(value: Mapping[str, Any], label: str) -> None:
    expected = {
        "runIdentity": RUN_IDENTITY,
        "targetBits": TARGET_BITS,
        "totalColumns": TOTAL_COLUMNS,
        "authoritySha256": AUTHORITY_SHA256,
        "initialOwnerSha256": INITIAL_SHA256,
        "preparedOwnerSha256": PREPARED_SHA256,
        "sourceDigests": SOURCE_DIGESTS,
    }
    for key, wanted in expected.items():
        if value.get(key) != wanted:
            raise Field3LogJoinFailure(f"{label} {key} changed")
    if (
        value.get("sourceStart") != 0
        or value.get("sourceCount") != TOTAL_COLUMNS
        or value.get("sourceStop") != TOTAL_COLUMNS
        or value.get("scalarColumns") != SCALAR_COLUMNS
        or value.get("nonscalarColumns") != TOTAL_COLUMNS - SCALAR_COLUMNS
    ):
        raise Field3LogJoinFailure(f"{label} source coverage changed")


def _validate_real_owner(value: Mapping[str, Any]) -> list[str]:
    _exact_keys(
        value,
        [
            "schema",
            "runIdentity",
            "targetBits",
            "sourceStart",
            "sourceCount",
            "sourceStop",
            "totalColumns",
            "scalarColumns",
            "nonscalarColumns",
            "realPlaces",
            "layout",
            "packedTriples",
            "authoritySha256",
            "initialOwnerSha256",
            "preparedOwnerSha256",
            "sourceDigests",
            "batches",
        ],
        "real owner",
    )
    if value["schema"] != REAL_SCHEMA or value["layout"] != REAL_LAYOUT:
        raise Field3LogJoinFailure("real owner schema or layout changed")
    _validate_common(value, "real owner")
    if value["realPlaces"] != REAL_PLACES:
        raise Field3LogJoinFailure("real owner place count changed")
    _validate_batches(value["batches"], 28, "real owner")
    return _canonical_cells(value["packedTriples"], REAL_CELLS, "real owner cells")


def _validate_complex_owner(value: Mapping[str, Any]) -> list[str]:
    _exact_keys(
        value,
        [
            "schema",
            "runIdentity",
            "targetBits",
            "totalColumns",
            "layout",
            "authoritySha256",
            "initialOwnerSha256",
            "preparedOwnerSha256",
            "kernelSourceSha256",
            "normConsequencesSha256",
            "sourceDigests",
            "sourceStart",
            "sourceCount",
            "sourceStop",
            "scalarColumns",
            "nonscalarColumns",
            "packedWeightedComplex",
            "selectedPrefixSha256",
            "selectedPrefixColumns",
            "prefixCompatibilitySha256",
            "batches",
        ],
        "complex owner",
    )
    if value["schema"] != COMPLEX_SCHEMA or value["layout"] != COMPLEX_LAYOUT:
        raise Field3LogJoinFailure("complex owner schema or layout changed")
    _validate_common(value, "complex owner")
    if value["kernelSourceSha256"] != KERNEL_SOURCE_SHA256:
        raise Field3LogJoinFailure("complex kernel source changed")
    if value["normConsequencesSha256"] != NORM_SHA256:
        raise Field3LogJoinFailure("complex norm consequence authority changed")
    if (
        value["selectedPrefixSha256"] != PREFIX_SHA256
        or value["selectedPrefixColumns"] != 32
    ):
        raise Field3LogJoinFailure("complex selected-prefix authority changed")
    _digest(value["prefixCompatibilitySha256"], "prefix compatibility hash")
    _validate_batches(value["batches"], 4, "complex owner", fixed_width=True)
    cells = _canonical_cells(
        value["packedWeightedComplex"], COMPLEX_CELLS, "complex owner cells"
    )
    for column in range(TOTAL_COLUMNS):
        wanted = "1" if column < SCALAR_COLUMNS else "2"
        if cells[PACKED_LOG_CELLS * column] != wanted:
            raise Field3LogJoinFailure(f"complex kind changed at column {column}")
    return cells


def _determinant4(matrix: list[list[int]]) -> int:
    a = [row[:] for row in matrix]
    denominator = 1
    sign = 1
    for pivot in range(3):
        chosen = pivot
        while chosen < 4 and a[chosen][pivot] == 0:
            chosen += 1
        if chosen == 4:
            raise Field3LogJoinFailure("singular principal generator")
        if chosen != pivot:
            a[pivot], a[chosen] = a[chosen], a[pivot]
            sign = -sign
        value = a[pivot][pivot]
        for row in range(pivot + 1, 4):
            for column in range(pivot + 1, 4):
                numerator = a[row][column] * value - a[row][pivot] * a[pivot][column]
                if numerator % denominator:
                    raise Field3LogJoinFailure("nonexact determinant division")
                a[row][column] = numerator // denominator
        denominator = value
    return sign * a[3][3]


def _source_evidence(
    authority_path: str | Path, initial_path: str | Path
) -> tuple[dict[str, str], str]:
    authority_data = Path(authority_path).read_bytes()
    initial_data = Path(initial_path).read_bytes()
    if _sha256(authority_data) != AUTHORITY_SHA256:
        raise Field3LogJoinFailure("exact relation authority bytes changed")
    if _sha256(initial_data) != INITIAL_SHA256:
        raise Field3LogJoinFailure("exact tensor authority bytes changed")
    authority = _decode(authority_data, "relation authority")
    initial = _decode(initial_data, "initial authority")
    try:
        owners = authority["authority"]["owners"]
        tensor_raw = initial["expected"][0]["basisTable"]
        generators_raw = owners["principalGenerators"]
        metadata_raw = owners["relationMetadata"]
        records_raw = owners["relationRecords"]
        packet_norms_raw = owners["packetNorms"]
    except (KeyError, IndexError, TypeError) as error:
        raise Field3LogJoinFailure("exact source authority shape changed") from error
    source_digests = {
        "principalGeneratorsSha256": _packed_sha256(generators_raw),
        "relationMetadataSha256": _packed_sha256(metadata_raw),
        "relationRecordsSha256": _packed_sha256(records_raw),
    }
    if source_digests != SOURCE_DIGESTS:
        raise Field3LogJoinFailure("exact source digests changed")
    if not (
        len(generators_raw) == 4 * TOTAL_COLUMNS
        and len(metadata_raw) == 3 * TOTAL_COLUMNS
        and len(records_raw) == 288 * TOTAL_COLUMNS
        and len(packet_norms_raw) == 288
        and len(tensor_raw) == 64
    ):
        raise Field3LogJoinFailure("exact source dimensions changed")
    generators = [int(value) for value in generators_raw]
    records = [int(value) for value in records_raw]
    packet_norms = [int(value) for value in packet_norms_raw]
    tensor = [int(value) for value in tensor_raw]
    norms: list[int] = []
    for relation in range(TOTAL_COLUMNS):
        coefficients = generators[4 * relation : 4 * relation + 4]
        matrix = [[0] * 4 for _ in range(4)]
        for column in range(4):
            for row in range(4):
                matrix[row][column] = sum(
                    coefficients[basis] * tensor[16 * basis + 4 * column + row]
                    for basis in range(4)
                )
        exact = _determinant4(matrix)
        factored = 1
        for packet in range(288):
            exponent = records[288 * relation + packet]
            if exponent < 0:
                raise Field3LogJoinFailure("negative principal relation exponent")
            if exponent:
                factored *= packet_norms[packet] ** exponent
        if abs(exact) != factored:
            raise Field3LogJoinFailure(
                f"principal relation norm mismatch at column {relation}"
            )
        norms.append(exact)
    norm_sha256 = _packed_sha256(norms)
    if norm_sha256 != NORM_SHA256:
        raise Field3LogJoinFailure("exact norm consequence digest changed")
    return source_digests, norm_sha256


def _twice_real(triple: Sequence[str]) -> list[str]:
    mantissa, precision, exponent = (int(value) for value in triple)
    if precision == -1:
        return [str(2 * mantissa), "-1", "0"]
    if mantissa == 0:
        return [str(mantissa), str(precision), str(exponent)]
    return [str(mantissa), str(precision), str(exponent + 1)]


def _validate_scalar_identities(real: Sequence[str], complex_: Sequence[str]) -> None:
    for column in range(SCALAR_COLUMNS):
        real_at = 6 * column
        complex_at = PACKED_LOG_CELLS * column
        real0 = list(real[real_at : real_at + 3])
        real1 = list(real[real_at + 3 : real_at + 6])
        if real0 != real1:
            raise Field3LogJoinFailure(f"scalar real places differ at column {column}")
        if complex_[complex_at] != "1":
            raise Field3LogJoinFailure(
                f"scalar complex kind changed at column {column}"
            )
        if list(complex_[complex_at + 1 : complex_at + 4]) != _twice_real(real0):
            raise Field3LogJoinFailure(
                f"scalar weighted complex log differs at column {column}"
            )
        if list(complex_[complex_at + 4 : complex_at + 7]) != ["0", "-1", "0"]:
            raise Field3LogJoinFailure(
                f"scalar complex argument changed at column {column}"
            )


def _join_cells(real: Sequence[str], complex_: Sequence[str]) -> list[str]:
    output: list[str] = []
    exact_zero_imaginary = ["0", "-1", "0"]
    for column in range(TOTAL_COLUMNS):
        real_at = 6 * column
        complex_at = PACKED_LOG_CELLS * column
        for place in range(REAL_PLACES):
            triple_at = real_at + 3 * place
            output.extend(["1"])
            output.extend(real[triple_at : triple_at + 3])
            output.extend(exact_zero_imaginary)
        output.extend(complex_[complex_at : complex_at + PACKED_LOG_CELLS])
    if len(output) != OUTPUT_CELLS:
        raise Field3LogJoinFailure("joined raw logarithm shape changed")
    return output


def join_complete_owners(
    real_owner_path: str | Path,
    real_owner_sha256: str,
    complex_owner_path: str | Path,
    complex_owner_sha256: str,
    authority_path: str | Path,
    initial_path: str | Path,
) -> dict[str, Any]:
    """Return a detached complete raw owner; do not write any file."""
    _digest(real_owner_sha256, "expected real owner hash")
    _digest(complex_owner_sha256, "expected complex owner hash")
    real_owner, _ = _read_hashed_owner(
        real_owner_path, real_owner_sha256, _REAL_NAME, "real owner"
    )
    complex_owner, _ = _read_hashed_owner(
        complex_owner_path, complex_owner_sha256, _COMPLEX_NAME, "complex owner"
    )
    real = _validate_real_owner(real_owner)
    complex_ = _validate_complex_owner(complex_owner)
    source_digests, norm_sha256 = _source_evidence(authority_path, initial_path)
    if real_owner["sourceDigests"] != source_digests:
        raise Field3LogJoinFailure("real owner detached from exact sources")
    if complex_owner["sourceDigests"] != source_digests:
        raise Field3LogJoinFailure("complex owner detached from exact sources")
    if complex_owner["normConsequencesSha256"] != norm_sha256:
        raise Field3LogJoinFailure("complex owner detached from exact norms")
    _validate_scalar_identities(real, complex_)
    packed = _join_cells(real, complex_)
    return {
        "schema": OUTPUT_SCHEMA,
        "field": FIELD,
        "runIdentity": RUN_IDENTITY,
        "targetBits": TARGET_BITS,
        "sourceStart": 0,
        "sourceCount": TOTAL_COLUMNS,
        "sourceStop": TOTAL_COLUMNS,
        "totalColumns": TOTAL_COLUMNS,
        "scalarColumns": SCALAR_COLUMNS,
        "nonscalarColumns": TOTAL_COLUMNS - SCALAR_COLUMNS,
        "places": PLACES,
        "layout": OUTPUT_LAYOUT,
        "packedLogs": packed,
        "authoritySha256": AUTHORITY_SHA256,
        "initialOwnerSha256": INITIAL_SHA256,
        "preparedOwnerSha256": PREPARED_SHA256,
        "normConsequencesSha256": norm_sha256,
        "sourceDigests": source_digests,
        "realOwnerSha256": real_owner_sha256,
        "complexOwnerSha256": complex_owner_sha256,
    }


def _validate_joined_owner(owner: Mapping[str, Any]) -> list[str]:
    _exact_keys(
        owner,
        [
            "schema",
            "field",
            "runIdentity",
            "targetBits",
            "sourceStart",
            "sourceCount",
            "sourceStop",
            "totalColumns",
            "scalarColumns",
            "nonscalarColumns",
            "places",
            "layout",
            "packedLogs",
            "authoritySha256",
            "initialOwnerSha256",
            "preparedOwnerSha256",
            "normConsequencesSha256",
            "sourceDigests",
            "realOwnerSha256",
            "complexOwnerSha256",
        ],
        "joined owner",
    )
    if (
        owner["schema"] != OUTPUT_SCHEMA
        or owner["field"] != FIELD
        or owner["runIdentity"] != RUN_IDENTITY
        or owner["targetBits"] != TARGET_BITS
        or owner["sourceStart"] != 0
        or owner["sourceCount"] != TOTAL_COLUMNS
        or owner["sourceStop"] != TOTAL_COLUMNS
        or owner["totalColumns"] != TOTAL_COLUMNS
        or owner["scalarColumns"] != SCALAR_COLUMNS
        or owner["nonscalarColumns"] != TOTAL_COLUMNS - SCALAR_COLUMNS
        or owner["places"] != PLACES
        or owner["layout"] != OUTPUT_LAYOUT
        or owner["authoritySha256"] != AUTHORITY_SHA256
        or owner["initialOwnerSha256"] != INITIAL_SHA256
        or owner["preparedOwnerSha256"] != PREPARED_SHA256
        or owner["normConsequencesSha256"] != NORM_SHA256
        or owner["sourceDigests"] != SOURCE_DIGESTS
    ):
        raise Field3LogJoinFailure("joined owner identity changed")
    _digest(owner["realOwnerSha256"], "joined real owner hash")
    _digest(owner["complexOwnerSha256"], "joined complex owner hash")
    return _canonical_cells(owner["packedLogs"], OUTPUT_CELLS, "joined cells")


def publish_complete_owner(
    output_directory: str | Path, owner: Mapping[str, Any]
) -> dict[str, Any]:
    """Atomically publish a previously complete, detached joined owner."""
    _validate_joined_owner(owner)
    data = (json.dumps(owner, separators=(",", ":")) + "\n").encode()
    digest = _sha256(data)
    directory = Path(output_directory)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"raw-log-columns-complete-{digest}.json"
    if destination.exists():
        if _sha256(destination.read_bytes()) != digest:
            raise Field3LogJoinFailure("existing raw owner bytes changed")
        if stat.S_IMODE(destination.stat().st_mode) != 0o444:
            raise Field3LogJoinFailure("existing raw owner is not mode 0444")
    else:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{destination.name}.", dir=directory
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.chmod(0o400)
            temporary.replace(destination)
            destination.chmod(0o444)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    return {
        "schema": OUTPUT_SCHEMA,
        "durablePath": str(destination),
        "sha256": digest,
        "bytes": len(data),
        "sourceColumns": TOTAL_COLUMNS,
        "packedLogEntries": TOTAL_COLUMNS * PLACES,
        "packedCells": OUTPUT_CELLS,
    }


def inspect_qualified_prefix(
    legacy_real_path: str | Path,
    complex_prefix_path: str | Path,
    authority_path: str | Path,
    initial_path: str | Path,
) -> dict[str, Any]:
    """Validate the qualified common prefix without fabricating completion."""
    real_data = Path(legacy_real_path).read_bytes()
    complex_data = Path(complex_prefix_path).read_bytes()
    if _sha256(real_data) != LEGACY_REAL_PREFIX_SHA256:
        raise Field3LogJoinFailure("qualified real prefix bytes changed")
    if _sha256(complex_data) != PREFIX_SHA256:
        raise Field3LogJoinFailure("qualified complex prefix bytes changed")
    real_owner = _decode(real_data, "qualified real prefix")
    complex_owner = _decode(complex_data, "qualified complex prefix")
    if (
        real_owner.get("schema") != LEGACY_REAL_SCHEMA
        or real_owner.get("runIdentity") != RUN_IDENTITY
        or real_owner.get("targetBits") != TARGET_BITS
        or real_owner.get("sourceColumns") != 28
        or real_owner.get("totalColumns") != TOTAL_COLUMNS
        or real_owner.get("scalarColumns") != SCALAR_COLUMNS
        or real_owner.get("realPlaces") != REAL_PLACES
        or real_owner.get("layout") != REAL_LAYOUT
        or real_owner.get("authoritySha256") != AUTHORITY_SHA256
        or real_owner.get("preparedOwnerSha256") != PREPARED_SHA256
    ):
        raise Field3LogJoinFailure("qualified real prefix identity changed")
    real = _canonical_cells(real_owner.get("packedTriples"), 28 * 6, "real prefix")
    _exact_keys(
        complex_owner,
        [
            "schema",
            "field",
            "targetBits",
            "sourceAuthoritySha256",
            "sourceInitialOwnerSha256",
            "pariOracleTraceSha256",
            "columns",
            "remainingSchedule",
        ],
        "complex prefix",
    )
    if (
        complex_owner["schema"] != PREFIX_SCHEMA
        or complex_owner["field"] != FIELD
        or complex_owner["targetBits"] != TARGET_BITS
        or complex_owner["sourceAuthoritySha256"] != AUTHORITY_SHA256
        or complex_owner["sourceInitialOwnerSha256"] != INITIAL_SHA256
    ):
        raise Field3LogJoinFailure("qualified complex prefix identity changed")
    columns = complex_owner["columns"]
    if not isinstance(columns, Sequence) or len(columns) != 32:
        raise Field3LogJoinFailure("qualified complex prefix length changed")
    raw: list[str] = []
    previous_column = -1
    for record in columns:
        if not isinstance(record, Mapping):
            raise Field3LogJoinFailure("complex prefix column is not an object")
        _exact_keys(record, ["column", "principal", "raw"], "complex prefix column")
        column = _integer(record["column"], "complex prefix source column")
        if column <= previous_column or column >= TOTAL_COLUMNS:
            raise Field3LogJoinFailure("complex prefix columns are reordered")
        previous_column = column
        _canonical_cells(record["principal"], 6, "complex prefix principal")
        raw.extend(_canonical_cells(record["raw"], 7, "complex prefix raw"))
    _source_evidence(authority_path, initial_path)
    _validate_scalar_identities(real[: 6 * SCALAR_COLUMNS], raw[: 7 * SCALAR_COLUMNS])
    return {
        "schema": "sagejs.pari-class-group/field3-raw-log-prefix-check-v1",
        "status": "authenticated-prefix-only",
        "realColumns": 28,
        "complexColumns": 32,
        "commonScalarColumns": SCALAR_COLUMNS,
        "complete": False,
        "published": False,
        "missingComplexColumns": TOTAL_COLUMNS - 32,
        "authoritySha256": AUTHORITY_SHA256,
        "initialOwnerSha256": INITIAL_SHA256,
        "preparedOwnerSha256": PREPARED_SHA256,
        "normConsequencesSha256": NORM_SHA256,
        "realPrefixSha256": LEGACY_REAL_PREFIX_SHA256,
        "complexPrefixSha256": PREFIX_SHA256,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--real-owner")
    parser.add_argument("--real-sha256")
    parser.add_argument("--complex-owner")
    parser.add_argument("--complex-sha256")
    parser.add_argument("--authority", required=True)
    parser.add_argument("--initial", required=True)
    parser.add_argument("--output-directory")
    parser.add_argument("--inspect-prefix", action="store_true")
    parser.add_argument("--real-prefix")
    parser.add_argument("--complex-prefix")
    return parser


def main() -> None:
    arguments = _parser().parse_args()
    if arguments.inspect_prefix:
        if arguments.output_directory is not None:
            raise Field3LogJoinFailure("prefix inspection cannot publish an owner")
        if arguments.real_prefix is None or arguments.complex_prefix is None:
            raise Field3LogJoinFailure("prefix inspection needs both prefix owners")
        result = inspect_qualified_prefix(
            arguments.real_prefix,
            arguments.complex_prefix,
            arguments.authority,
            arguments.initial,
        )
    else:
        required = [
            arguments.real_owner,
            arguments.real_sha256,
            arguments.complex_owner,
            arguments.complex_sha256,
            arguments.output_directory,
        ]
        if any(value is None for value in required):
            raise Field3LogJoinFailure("complete join arguments are missing")
        owner = join_complete_owners(
            arguments.real_owner,
            arguments.real_sha256,
            arguments.complex_owner,
            arguments.complex_sha256,
            arguments.authority,
            arguments.initial,
        )
        result = publish_complete_owner(arguments.output_directory, owner)
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
