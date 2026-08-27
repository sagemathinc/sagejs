"""Typed, bounded access to selected LMFDB collections.

The default and bundled catalogs are offline. Network access occurs only for
an explicitly constructed `LMFDB(source="online")` catalog and only while a
bounded query is evaluated. Mathematical constructors never query LMFDB.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any, Iterator, Mapping, Sequence
from urllib.parse import urlencode, urljoin, urlsplit

import sagejs.runtime as runtime

from . import _lmfdb_bundled as bundled

SCHEMA = "sagejs.lmfdb-catalog.v1"
SNAPSHOT_SCHEMA = "sagejs.lmfdb-snapshot.v1"
ADAPTER_VERSION = "1"
DEFAULT_API_URL = "https://www.lmfdb.org/api/"
MAX_ONLINE_LIMIT = 10_000
MAX_PAGE_RECORDS = 100
DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024


class LMFDBError(RuntimeError):
    """Base class for catalog errors."""


class LMFDBCapabilityError(LMFDBError):
    """The selected provider is unavailable in this runtime."""


class LMFDBNetworkError(LMFDBError):
    """A bounded online request failed or violated its transport contract."""


class LMFDBSchemaError(LMFDBError):
    """Source data does not satisfy the pinned adapter schema."""


class LMFDBQueryError(LMFDBError):
    """A query is unsupported or exceeds a declared bound."""


class Between:
    """An inclusive exact interval predicate."""

    __slots__ = ("lower", "upper", "_frozen")

    def __init__(self, lower: Any, upper: Any) -> None:
        if lower > upper:
            raise ValueError("between lower endpoint must not exceed upper endpoint")
        object.__setattr__(self, "lower", lower)
        object.__setattr__(self, "upper", upper)
        object.__setattr__(self, "_frozen", True)

    def __setattr__(self, _name: str, _value: Any) -> None:
        if getattr(self, "_frozen", False):
            raise TypeError("LMFDB predicates are immutable")
        raise TypeError("LMFDB predicates are immutable")

    def __repr__(self) -> str:
        return "between(" + repr(self.lower) + ", " + repr(self.upper) + ")"


def between(lower: Any, upper: Any) -> Between:
    """Return an inclusive interval predicate for :meth:`LMFDBCollection.search`."""

    return Between(lower, upper)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _exact_integer(value: Any, field: str) -> int:
    if isinstance(value, bool):
        raise LMFDBSchemaError(field + " must be an exact integer")
    if isinstance(value, int):
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if text.startswith(("+", "-")):
            digits = text[1:]
        else:
            digits = text
        if digits and digits.isdigit():
            return int(text)
    raise LMFDBSchemaError(field + " must be an exact integer or decimal string")


def _optional_integer(value: Any, field: str) -> int | None:
    if value is None:
        return None
    return _exact_integer(value, field)


def _boolean(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise LMFDBSchemaError(field + " must be a boolean")
    return value


def _optional_boolean(value: Any, field: str) -> bool | None:
    if value is None:
        return None
    return _boolean(value, field)


def _string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise LMFDBSchemaError(field + " must be a nonempty string")
    return value


def _integer_list(value: Any, field: str) -> list[int]:
    if not isinstance(value, (list, tuple)):
        raise LMFDBSchemaError(field + " must be an integer array")
    return [_exact_integer(item, field) for item in value]


def _source_equation(value: Any) -> list[list[int]]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except Exception as exception:
            raise LMFDBSchemaError("eqn is not exact JSON") from exception
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise LMFDBSchemaError("eqn must be the pair [f_coefficients, h_coefficients]")
    f = _integer_list(value[0], "eqn.f")
    h = _integer_list(value[1], "eqn.h")
    if not f or not h:
        raise LMFDBSchemaError("eqn coefficient arrays must be nonempty")
    return [f, h]


def _detached(value: Any) -> Any:
    return json.loads(_canonical_json(value))


def _runtime_global(name: str) -> Any:
    value = runtime.reflect.get(runtime.global_object, name)
    if value is runtime.undefined:
        raise LMFDBCapabilityError(name + " is unavailable in this runtime")
    return value


def _normalized_sort_value(value: Any) -> tuple[int, Any]:
    if value is None:
        return (0, "")
    if isinstance(value, bool):
        return (1, int(value))
    if isinstance(value, (int, float, str)):
        return (1, value)
    return (1, _canonical_json(value))


class _Adapter:
    collection: str
    table: str
    kind: str
    fields: Mapping[str, str]
    integer_fields: tuple[str, ...]
    api_fields: tuple[str, ...]

    def normalize(self, source: Mapping[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def record_type(self) -> type[LMFDBRecord]:
        raise NotImplementedError

    def validate_predicate(self, field: str, predicate: Any) -> Any:
        if field not in self.fields:
            raise LMFDBQueryError(
                "unsupported " + self.collection + " search field " + repr(field)
            )
        if field in self.integer_fields:
            if isinstance(predicate, Between):
                return Between(
                    _exact_integer(predicate.lower, field),
                    _exact_integer(predicate.upper, field),
                )
            return _exact_integer(predicate, field)
        if isinstance(predicate, Between):
            raise LMFDBQueryError("between is supported only for exact integer fields")
        if isinstance(predicate, (str, bool)):
            return predicate
        raise LMFDBQueryError(field + " equality requires a string or boolean")

    def api_parameter(self, field: str, predicate: Any) -> tuple[str, str]:
        backend = self.fields[field]
        if isinstance(predicate, Between):
            expression = {
                "$gte": _exact_integer(predicate.lower, field),
                "$lte": _exact_integer(predicate.upper, field),
            }
            return backend, "py" + repr(expression)
        if isinstance(predicate, bool):
            return backend, "py" + ("True" if predicate else "False")
        if field in self.integer_fields:
            return backend, "i" + str(_exact_integer(predicate, field))
        return backend, "s" + str(predicate)

    def source_url(self, label: str) -> str:
        raise NotImplementedError


class _Genus2Adapter(_Adapter):
    collection = "genus2_curves"
    table = "g2c_curves"
    kind = "genus2_curve"
    fields = {
        "label": "label",
        "isogeny_class": "class",
        "conductor": "cond",
        "discriminant_abs": "abs_disc",
        "analytic_rank": "analytic_rank",
        "mw_rank": "mw_rank",
        "locally_solvable": "locally_solvable",
        "globally_solvable": "globally_solvable",
        "torsion_order": "torsion_order",
    }
    integer_fields = (
        "conductor",
        "discriminant_abs",
        "analytic_rank",
        "mw_rank",
        "globally_solvable",
        "torsion_order",
    )
    api_fields = (
        "label",
        "class",
        "cond",
        "abs_disc",
        "eqn",
        "analytic_rank",
        "analytic_rank_proved",
        "mw_rank",
        "mw_rank_proved",
        "locally_solvable",
        "globally_solvable",
        "torsion_order",
        "torsion_subgroup",
        "aut_grp_label",
        "geom_aut_grp_label",
        "end_alg",
        "geom_end_alg",
        "st_label",
    )

    def normalize(self, source: Mapping[str, Any]) -> dict[str, Any]:
        label = _string(source.get("label"), "label")
        equation = _source_equation(source.get("eqn"))
        answer: dict[str, Any] = {
            "label": label,
            "isogeny_class": _string(source.get("class"), "class"),
            "conductor": _exact_integer(source.get("cond"), "cond"),
            "discriminant_abs": _exact_integer(source.get("abs_disc"), "abs_disc"),
            "f_coefficients": equation[0],
            "h_coefficients": equation[1],
        }
        for public, backend in (
            ("analytic_rank", "analytic_rank"),
            ("mw_rank", "mw_rank"),
            ("globally_solvable", "globally_solvable"),
            ("torsion_order", "torsion_order"),
        ):
            answer[public] = _optional_integer(source.get(backend), backend)
        for public, backend in (
            ("analytic_rank_proved", "analytic_rank_proved"),
            ("mw_rank_proved", "mw_rank_proved"),
            ("locally_solvable", "locally_solvable"),
        ):
            answer[public] = _optional_boolean(source.get(backend), backend)
        for public, backend in (
            ("torsion_subgroup", "torsion_subgroup"),
            ("automorphism_group", "aut_grp_label"),
            ("geometric_automorphism_group", "geom_aut_grp_label"),
            ("endomorphism_algebra", "end_alg"),
            ("geometric_endomorphism_algebra", "geom_end_alg"),
            ("sato_tate_label", "st_label"),
        ):
            value = source.get(backend)
            answer[public] = None if value is None else str(value)
        return answer

    def record_type(self) -> type[LMFDBRecord]:
        return Genus2CurveRecord

    def source_url(self, label: str) -> str:
        parts = label.split(".")
        if len(parts) != 4:
            raise LMFDBSchemaError("invalid genus-2 LMFDB label " + repr(label))
        return "https://www.lmfdb.org/Genus2Curve/Q/" + "/".join(parts)


class _NumberFieldAdapter(_Adapter):
    collection = "number_fields"
    table = "nf_fields"
    kind = "number_field"
    fields = {
        "label": "label",
        "degree": "degree",
        "discriminant_abs": "disc_abs",
        "class_number": "class_number",
        "real_places": "r1",
        "complex_places": "r2",
        "monogenic": "monogenic",
    }
    integer_fields = (
        "degree",
        "discriminant_abs",
        "class_number",
        "real_places",
        "complex_places",
        "monogenic",
    )
    api_fields = (
        "label",
        "degree",
        "coeffs",
        "r2",
        "disc_sign",
        "disc_abs",
        "index",
        "monogenic",
        "galt",
        "class_number",
        "class_group",
        "regulator",
        "torsion_order",
        "used_grh",
        "narrow_class_number",
        "narrow_class_group",
        "unit_signature_rank",
    )

    def normalize(self, source: Mapping[str, Any]) -> dict[str, Any]:
        label = _string(source.get("label"), "label")
        degree = _exact_integer(source.get("degree"), "degree")
        r2 = _exact_integer(source.get("r2"), "r2")
        r1 = degree - 2 * r2
        if degree < 1 or r1 < 0:
            raise LMFDBSchemaError("number-field signature is inconsistent")
        coefficients = _integer_list(source.get("coeffs"), "coeffs")
        if len(coefficients) != degree + 1 or coefficients[-1] == 0:
            raise LMFDBSchemaError("defining polynomial degree does not match label")
        label_parts = label.split(".")
        if len(label_parts) != 4:
            raise LMFDBSchemaError("invalid number-field LMFDB label " + repr(label))
        try:
            label_degree = int(label_parts[0])
            label_r1 = int(label_parts[1])
            label_discriminant = int(label_parts[2])
        except Exception as exception:
            raise LMFDBSchemaError(
                "invalid number-field LMFDB label " + repr(label)
            ) from exception
        discriminant_abs = _exact_integer(source.get("disc_abs"), "disc_abs")
        if (label_degree, label_r1, label_discriminant) != (
            degree,
            r1,
            discriminant_abs,
        ):
            raise LMFDBSchemaError("number-field label disagrees with record metadata")
        sign = _exact_integer(source.get("disc_sign"), "disc_sign")
        if sign not in (-1, 1):
            raise LMFDBSchemaError("disc_sign must be -1 or 1")
        class_group_source = source.get("class_group")
        if isinstance(class_group_source, str):
            try:
                class_group_source = json.loads(class_group_source)
            except Exception as exception:
                raise LMFDBSchemaError("class_group is not exact JSON") from exception
        answer: dict[str, Any] = {
            "label": label,
            "degree": degree,
            "signature": [r1, r2],
            "real_places": r1,
            "complex_places": r2,
            "discriminant": sign * discriminant_abs,
            "discriminant_abs": discriminant_abs,
            "coefficients": coefficients,
            "equation_order_index": _optional_integer(source.get("index"), "index"),
            "monogenic": _optional_integer(source.get("monogenic"), "monogenic"),
            "galois_label": None
            if source.get("galt") is None
            else str(source.get("galt")),
            "class_number": _optional_integer(
                source.get("class_number"), "class_number"
            ),
            "class_group": (
                None
                if class_group_source is None
                else _integer_list(class_group_source, "class_group")
            ),
            "regulator": None
            if source.get("regulator") is None
            else str(source.get("regulator")),
            "roots_of_unity_order": _optional_integer(
                source.get("torsion_order"), "torsion_order"
            ),
            "used_grh": _optional_boolean(source.get("used_grh"), "used_grh"),
            "narrow_class_number": _optional_integer(
                source.get("narrow_class_number"), "narrow_class_number"
            ),
            "unit_signature_rank": _optional_integer(
                source.get("unit_signature_rank"), "unit_signature_rank"
            ),
        }
        narrow_group = source.get("narrow_class_group")
        if isinstance(narrow_group, str):
            try:
                narrow_group = json.loads(narrow_group)
            except Exception as exception:
                raise LMFDBSchemaError(
                    "narrow_class_group is not exact JSON"
                ) from exception
        answer["narrow_class_group"] = (
            None
            if narrow_group is None
            else _integer_list(narrow_group, "narrow_class_group")
        )
        return answer

    def record_type(self) -> type[LMFDBRecord]:
        return NumberFieldRecord

    def source_url(self, label: str) -> str:
        return "https://www.lmfdb.org/NumberField/" + label


_ADAPTERS: Mapping[str, _Adapter] = {
    "genus2_curves": _Genus2Adapter(),
    "number_fields": _NumberFieldAdapter(),
}


class LMFDBRecord:
    """Immutable normalized record with detached source data and provenance."""

    __slots__ = (
        "_normalized_json",
        "_source_json",
        "_provenance_json",
        "_record_sha256",
        "_frozen",
    )

    def __init__(
        self,
        normalized: Mapping[str, Any],
        source_data: Mapping[str, Any],
        provenance: Mapping[str, Any],
    ) -> None:
        normalized_copy = _detached(normalized)
        source_copy = _detached(source_data)
        provenance_copy = _detached(provenance)
        identity = {
            "schema": SCHEMA,
            "kind": provenance_copy["kind"],
            "normalized": normalized_copy,
            "source_data": source_copy,
            "source_name": provenance_copy["source_name"],
            "source_table": provenance_copy["source_table"],
        }
        object.__setattr__(self, "_normalized_json", _canonical_json(normalized_copy))
        object.__setattr__(self, "_source_json", _canonical_json(source_copy))
        object.__setattr__(self, "_provenance_json", _canonical_json(provenance_copy))
        object.__setattr__(
            self, "_record_sha256", _sha256_text(_canonical_json(identity))
        )
        object.__setattr__(self, "_frozen", True)

    def __setattr__(self, _name: str, _value: Any) -> None:
        if getattr(self, "_frozen", False):
            raise TypeError("LMFDB records are immutable")
        raise TypeError("LMFDB records are immutable")

    def __getattr__(self, name: str) -> Any:
        normalized = json.loads(self._normalized_json)
        if name in normalized:
            return normalized[name]
        provenance = json.loads(self._provenance_json)
        if name == "kind":
            return provenance["kind"]
        if name == "source":
            return provenance["provider"]
        if name == "source_release":
            return provenance["source_release"]
        if name == "source_url":
            return provenance["source_url"]
        if name == "retrieved_at":
            return provenance.get("retrieved_at")
        if name == "record_sha256":
            return self._record_sha256
        raise AttributeError(name)

    def __getitem__(self, name: str) -> Any:
        return getattr(self, name)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, LMFDBRecord)
            and self._record_sha256 == other._record_sha256
        )

    def __hash__(self) -> int:
        return hash(self._record_sha256)

    def __repr__(self) -> str:
        return self.__class__.__name__ + "(" + repr(self.label) + ")"

    def to_dict(self) -> dict[str, Any]:
        return json.loads(self._normalized_json)

    def raw_data(self) -> dict[str, Any]:
        return json.loads(self._source_json)

    def provenance(self) -> dict[str, Any]:
        answer = json.loads(self._provenance_json)
        answer["record_sha256"] = self._record_sha256
        return answer

    def citation(self) -> str:
        return str(json.loads(self._provenance_json)["citation"])

    def metadata_status(self, field: str) -> str:
        normalized = json.loads(self._normalized_json)
        if field not in normalized:
            raise KeyError(field)
        proof_field = field + "_proved"
        if proof_field in normalized:
            proof = normalized[proof_field]
            if proof is True:
                return "proved"
            if proof is False:
                return "not-proved"
        if field in ("class_number", "class_group", "regulator"):
            used_grh = normalized.get("used_grh")
            if used_grh is True:
                return "conditional-on-grh"
            if used_grh is False:
                return "reported-unconditional"
        return "reported"


class Genus2CurveRecord(LMFDBRecord):
    """One exact genus-2 curve record."""

    def curve(self) -> Any:
        from sagejs.hyperelliptic_curves.model import HyperellipticCurve

        ring = _runtime_global("PolynomialRing")(_runtime_global("QQ"), "x")
        curve = HyperellipticCurve(ring(self.f_coefficients), ring(self.h_coefficients))
        if int(curve.genus()) != 2:
            raise LMFDBSchemaError("LMFDB genus-2 equation did not construct genus 2")
        return curve


class NumberFieldRecord(LMFDBRecord):
    """One exact number-field record."""

    def field(self, name: str = "a") -> Any:
        if not isinstance(name, str) or not name:
            raise ValueError("number-field generator name must be nonempty")
        ring = _runtime_global("PolynomialRing")(_runtime_global("QQ"), "x")
        field = _runtime_global("NumberField")(ring(self.coefficients), name)
        if int(field.degree()) != int(self.degree):
            raise LMFDBSchemaError(
                "constructed number-field degree disagrees with record"
            )
        return field


def _make_record(
    adapter: _Adapter,
    source_data: Mapping[str, Any],
    provider: str,
    source_release: str,
    retrieved_at: str | None = None,
) -> LMFDBRecord:
    normalized = adapter.normalize(source_data)
    provenance = {
        "schema": SCHEMA,
        "adapter_version": ADAPTER_VERSION,
        "kind": adapter.kind,
        "provider": provider,
        "source_name": "LMFDB",
        "source_release": source_release,
        "source_table": adapter.table,
        "source_url": adapter.source_url(str(normalized["label"])),
        "retrieved_at": retrieved_at,
        "citation": bundled.CITATION,
        "license": "CC-BY-SA",
    }
    return adapter.record_type()(normalized, source_data, provenance)


def _record_from_snapshot(
    adapter: _Adapter,
    source_data: Mapping[str, Any],
    stored_provenance: Mapping[str, Any],
) -> LMFDBRecord:
    provider = _string(stored_provenance.get("provider"), "provenance.provider")
    release = _string(
        stored_provenance.get("source_release"), "provenance.source_release"
    )
    retrieved = stored_provenance.get("retrieved_at")
    if retrieved is not None and not isinstance(retrieved, str):
        raise LMFDBSchemaError("provenance.retrieved_at must be a string or null")
    expected = _make_record(adapter, source_data, provider, release, retrieved)
    expected_provenance = expected.provenance()
    for field in (
        "schema",
        "adapter_version",
        "kind",
        "provider",
        "source_name",
        "source_release",
        "source_table",
        "source_url",
        "retrieved_at",
        "citation",
        "license",
        "record_sha256",
    ):
        if stored_provenance.get(field) != expected_provenance.get(field):
            raise LMFDBSchemaError(
                "LMFDB snapshot provenance field is inconsistent: " + field
            )
    public_provenance = dict(expected_provenance)
    public_provenance.pop("record_sha256")
    public_provenance["upstream_provider"] = stored_provenance.get(
        "upstream_provider", provider
    )
    public_provenance["provider"] = "snapshot"
    return adapter.record_type()(expected.to_dict(), source_data, public_provenance)


def _matches(record: LMFDBRecord, predicates: Mapping[str, Any]) -> bool:
    for field, predicate in predicates.items():
        value = getattr(record, field)
        if isinstance(predicate, Between):
            if value is None or value < predicate.lower or value > predicate.upper:
                return False
        elif value != predicate:
            return False
    return True


class _Provider:
    name: str

    def execute(
        self,
        adapter: _Adapter,
        predicates: Mapping[str, Any],
        ordering: Sequence[str],
        limit: int | None,
    ) -> list[LMFDBRecord]:
        raise NotImplementedError

    def coverage(self, collection: str) -> Mapping[str, Any]:
        raise NotImplementedError

    def capabilities(self) -> Mapping[str, Any]:
        raise NotImplementedError

    def close(self) -> None:
        return None


class _BundledProvider(_Provider):
    name = "bundled"

    def execute(
        self,
        adapter: _Adapter,
        predicates: Mapping[str, Any],
        ordering: Sequence[str],
        limit: int | None,
    ) -> list[LMFDBRecord]:
        rows = bundled.COLLECTIONS[adapter.collection]
        records = [
            _make_record(
                adapter,
                row,
                self.name,
                bundled.BUNDLED_SOURCE_RELEASE,
                bundled.BUNDLED_RETRIEVED_AT,
            )
            for row in rows
        ]
        records = [record for record in records if _matches(record, predicates)]
        for field in reversed(tuple(ordering)):
            reverse = field.startswith("-")
            public = field[1:] if reverse else field
            records.sort(
                key=lambda record, key=public: _normalized_sort_value(
                    getattr(record, key)
                ),
                reverse=reverse,
            )
        return records if limit is None else records[:limit]

    def coverage(self, collection: str) -> Mapping[str, Any]:
        return _detached(bundled.COVERAGE[collection])

    def capabilities(self) -> Mapping[str, Any]:
        return {"offline": True, "network": False, "snapshot": True}


class _OnlineProvider(_Provider):
    name = "online"

    def __init__(
        self,
        base_url: str,
        timeout: float,
        max_response_bytes: int,
    ) -> None:
        parsed = urlsplit(base_url)
        local_http = parsed.scheme == "http" and parsed.hostname in (
            "127.0.0.1",
            "localhost",
            "::1",
        )
        if parsed.scheme != "https" and not local_http:
            raise ValueError("online LMFDB origin must use HTTPS")
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("online LMFDB origin must not contain credentials")
        path = parsed.path.rstrip("/") + "/"
        if not path.endswith("/api/"):
            raise ValueError("online LMFDB origin path must end in /api/")
        self._base_url = parsed.scheme + "://" + parsed.netloc + path
        self._origin = (parsed.scheme, parsed.hostname, parsed.port)
        self._timeout = float(timeout)
        self._max_response_bytes = int(max_response_bytes)
        if self._timeout <= 0 or self._max_response_bytes <= 0:
            raise ValueError("online timeout and response-byte cap must be positive")

    def _validate_url(self, url: str, adapter: _Adapter) -> str:
        absolute = urljoin(self._base_url, url)
        parsed = urlsplit(absolute)
        if (parsed.scheme, parsed.hostname, parsed.port) != self._origin:
            raise LMFDBNetworkError("LMFDB pagination left the configured origin")
        expected = urlsplit(self._base_url).path + adapter.table + "/"
        if parsed.path != expected or parsed.fragment:
            raise LMFDBNetworkError("LMFDB pagination left the configured API table")
        return absolute

    def _initial_url(
        self,
        adapter: _Adapter,
        predicates: Mapping[str, Any],
        ordering: Sequence[str],
    ) -> str:
        parameters: list[tuple[str, str]] = [
            ("_format", "json"),
            ("_fields", ",".join(adapter.api_fields)),
        ]
        if ordering:
            backend_order = []
            for field in ordering:
                descending = field.startswith("-")
                public = field[1:] if descending else field
                backend_order.append(
                    ("-" if descending else "") + adapter.fields[public]
                )
            parameters.append(("_sort", ",".join(backend_order)))
        for field in sorted(predicates):
            parameters.append(adapter.api_parameter(field, predicates[field]))
        return self._base_url + adapter.table + "/?" + urlencode(parameters)

    def _page(self, url: str, adapter: _Adapter) -> Mapping[str, Any]:
        from urllib.request import Request, urlopen

        request = Request(url, headers={"Accept": "application/json"}, method="GET")
        try:
            with urlopen(request, timeout=self._timeout) as response:
                final_url = self._validate_url(response.geturl(), adapter)
                del final_url
                content_type = response.headers.get_content_type()
                if content_type not in ("application/json", "text/json"):
                    raise LMFDBNetworkError(
                        "LMFDB returned unexpected content type " + repr(content_type)
                    )
                body = response.read(self._max_response_bytes + 1)
        except LMFDBError:
            raise
        except Exception as exception:
            raise LMFDBNetworkError("LMFDB request failed for " + url) from exception
        if len(body) > self._max_response_bytes:
            raise LMFDBNetworkError("LMFDB response exceeded the configured byte cap")
        try:
            payload = json.loads(body)
        except Exception as exception:
            raise LMFDBNetworkError("LMFDB returned malformed JSON") from exception
        if not isinstance(payload, dict):
            raise LMFDBSchemaError("LMFDB response must be a JSON object")
        if payload.get("table") != adapter.table:
            raise LMFDBSchemaError("LMFDB response table does not match the query")
        data = payload.get("data")
        if not isinstance(data, list) or len(data) > MAX_PAGE_RECORDS:
            raise LMFDBSchemaError("LMFDB response has an invalid data page")
        return payload

    def execute(
        self,
        adapter: _Adapter,
        predicates: Mapping[str, Any],
        ordering: Sequence[str],
        limit: int | None,
    ) -> list[LMFDBRecord]:
        if limit is None:
            raise LMFDBQueryError("online LMFDB queries require a finite limit")
        if limit < 1 or limit > MAX_ONLINE_LIMIT:
            raise LMFDBQueryError(
                "online LMFDB limit must be between 1 and " + str(MAX_ONLINE_LIMIT)
            )
        url: str | None = self._initial_url(adapter, predicates, ordering)
        seen: set[str] = set()
        records: list[LMFDBRecord] = []
        while url is not None and len(records) < limit:
            url = self._validate_url(url, adapter)
            if url in seen:
                raise LMFDBNetworkError("LMFDB pagination loop detected")
            seen.add(url)
            payload = self._page(url, adapter)
            timestamp = payload.get("timestamp")
            source_release = "live" if timestamp is None else str(timestamp)
            for source in payload["data"]:
                if not isinstance(source, dict):
                    raise LMFDBSchemaError("LMFDB data page contains a non-object")
                records.append(
                    _make_record(
                        adapter,
                        source,
                        self.name,
                        source_release,
                        None if timestamp is None else str(timestamp),
                    )
                )
                if len(records) == limit:
                    break
            next_url = payload.get("next")
            if next_url is None or next_url == "":
                url = None
            elif not isinstance(next_url, str):
                raise LMFDBSchemaError("LMFDB next page URL must be a string or null")
            else:
                url = next_url
        return records

    def coverage(self, collection: str) -> Mapping[str, Any]:
        del collection
        return {
            "complete": False,
            "description": "live bounded LMFDB HTTP API view",
            "maximum_query_records": MAX_ONLINE_LIMIT,
        }

    def capabilities(self) -> Mapping[str, Any]:
        return {"offline": False, "network": True, "snapshot": True}


class _SnapshotProvider(_Provider):
    name = "snapshot"

    def __init__(self, path: str) -> None:
        try:
            import sqlite3
        except Exception as exception:
            raise LMFDBCapabilityError(
                "SQLite snapshots are unavailable"
            ) from exception
        self._path = os.path.abspath(os.fspath(path))
        if not os.path.isfile(self._path):
            raise FileNotFoundError(self._path)
        self._database = sqlite3.connect(self._path)
        try:
            self._database.execute("pragma query_only=on")
            read_only = self._database.execute("pragma query_only").fetchone()
            if read_only is None or int(read_only[0]) != 1:
                raise LMFDBCapabilityError(
                    "SQLite cannot enforce a read-only LMFDB snapshot session"
                )
            check = self._database.execute("pragma quick_check").fetchone()
            if check is None or check[0] != "ok":
                raise LMFDBSchemaError("LMFDB snapshot failed SQLite quick_check")
            metadata_rows = self._database.execute(
                "select key, value from sagejs_dataset_metadata order by key"
            ).fetchall()
            self._metadata = {str(key): str(value) for key, value in metadata_rows}
            metadata_identity = dict(self._metadata)
            metadata_digest = metadata_identity.pop("snapshot_metadata_sha256", None)
            if metadata_digest != _sha256_text(_canonical_json(metadata_identity)):
                raise LMFDBSchemaError("LMFDB snapshot metadata digest is inconsistent")
            if self._metadata.get("schema") != SNAPSHOT_SCHEMA:
                raise LMFDBSchemaError("unsupported LMFDB snapshot schema")
            if self._metadata.get("adapter_version") != ADAPTER_VERSION:
                raise LMFDBSchemaError("unsupported LMFDB snapshot adapter")
            application_id = self._database.execute("pragma application_id").fetchone()
            user_version = self._database.execute("pragma user_version").fetchone()
            if application_id is None or int(application_id[0]) != 1397509446:
                raise LMFDBSchemaError("unsupported LMFDB snapshot application id")
            if user_version is None or int(user_version[0]) != 1:
                raise LMFDBSchemaError("unsupported LMFDB snapshot user version")
            index_count = self._database.execute(
                "select count(*) from sqlite_master "
                "where type='index' and name='records_label'"
            ).fetchone()
            if index_count is None or int(index_count[0]) != 1:
                raise LMFDBSchemaError("LMFDB snapshot is missing its label index")
            count = self._database.execute("select count(*) from records").fetchone()[0]
            if int(count) != int(self._metadata["record_count"]):
                raise LMFDBSchemaError("LMFDB snapshot record count is inconsistent")
            rows = self._database.execute(
                "select collection, label, normalized_json, source_json, "
                "provenance_json, record_sha256, row_sha256 "
                "from records order by collection,label"
            ).fetchall()
            digest_rows = []
            collection_counts: dict[str, int] = {}
            for row in rows:
                (
                    collection,
                    label,
                    normalized_json,
                    source_json,
                    provenance_json,
                    record_digest,
                    row_digest,
                ) = [str(item) for item in row]
                if collection not in _ADAPTERS:
                    raise LMFDBSchemaError(
                        "LMFDB snapshot contains an unknown collection"
                    )
                canonical_row = _snapshot_row(
                    collection,
                    label,
                    normalized_json,
                    source_json,
                    provenance_json,
                    record_digest,
                )
                if canonical_row["row_sha256"] != row_digest:
                    raise LMFDBSchemaError("LMFDB snapshot row digest is inconsistent")
                if _canonical_json(json.loads(normalized_json)) != normalized_json:
                    raise LMFDBSchemaError(
                        "LMFDB snapshot normalized JSON is not canonical"
                    )
                if _canonical_json(json.loads(source_json)) != source_json:
                    raise LMFDBSchemaError(
                        "LMFDB snapshot source JSON is not canonical"
                    )
                if _canonical_json(json.loads(provenance_json)) != provenance_json:
                    raise LMFDBSchemaError(
                        "LMFDB snapshot provenance JSON is not canonical"
                    )
                provenance = json.loads(provenance_json)
                record = _record_from_snapshot(
                    _ADAPTERS[collection], json.loads(source_json), provenance
                )
                if _canonical_json(record.to_dict()) != normalized_json:
                    raise LMFDBSchemaError(
                        "LMFDB snapshot normalized record is inconsistent"
                    )
                if record.record_sha256 != record_digest:
                    raise LMFDBSchemaError(
                        "LMFDB snapshot record digest is inconsistent"
                    )
                identity = collection + "\0" + label
                digest_rows.append((identity, row_digest))
                collection_counts[collection] = collection_counts.get(collection, 0) + 1
            logical = _logical_digest(digest_rows)
            if logical != self._metadata.get("logical_records_sha256"):
                raise LMFDBSchemaError("LMFDB snapshot logical digest is inconsistent")
            self._collection_counts = collection_counts
        except Exception:
            self._database.close()
            raise

    def execute(
        self,
        adapter: _Adapter,
        predicates: Mapping[str, Any],
        ordering: Sequence[str],
        limit: int | None,
    ) -> list[LMFDBRecord]:
        rows = self._database.execute(
            "select normalized_json, source_json, provenance_json, record_sha256 "
            "from records where collection=? order by label",
            (adapter.collection,),
        ).fetchall()
        records: list[LMFDBRecord] = []
        for normalized_json, source_json, provenance_json, expected_digest in rows:
            source = json.loads(str(source_json))
            provenance = json.loads(str(provenance_json))
            record = _record_from_snapshot(adapter, source, provenance)
            if record.record_sha256 != str(expected_digest):
                raise LMFDBSchemaError("LMFDB snapshot record digest is inconsistent")
            if _canonical_json(record.to_dict()) != str(normalized_json):
                raise LMFDBSchemaError(
                    "LMFDB snapshot normalized record is inconsistent"
                )
            if _matches(record, predicates):
                records.append(record)
        for field in reversed(tuple(ordering)):
            reverse = field.startswith("-")
            public = field[1:] if reverse else field
            records.sort(
                key=lambda record, key=public: _normalized_sort_value(
                    getattr(record, key)
                ),
                reverse=reverse,
            )
        return records if limit is None else records[:limit]

    def coverage(self, collection: str) -> Mapping[str, Any]:
        collections = json.loads(self._metadata["collections"])
        if collection not in collections:
            return {"complete": False, "record_count": 0, "description": "not present"}
        return {
            "complete": False,
            "record_count": self._collection_counts.get(collection, 0),
            "description": "bounded immutable user snapshot",
        }

    def capabilities(self) -> Mapping[str, Any]:
        return {"offline": True, "network": False, "snapshot": True}

    def close(self) -> None:
        self._database.close()


def _logical_digest(rows: Sequence[tuple[str, str]]) -> str:
    framed = "".join(
        str(len(label)) + ":" + label + ":" + str(len(digest)) + ":" + digest + "\n"
        for label, digest in rows
    )
    return _sha256_text(framed)


def _snapshot_row(
    collection: str,
    label: str,
    normalized_json: str,
    source_json: str,
    provenance_json: str,
    record_sha256: str,
) -> dict[str, str]:
    row = {
        "collection": collection,
        "label": label,
        "normalized_json": normalized_json,
        "source_json": source_json,
        "provenance_json": provenance_json,
        "record_sha256": record_sha256,
    }
    row["row_sha256"] = _sha256_text(_canonical_json(row))
    return row


def _exclusive_temporary_path(directory: str, target: str) -> str:
    stem = "." + os.path.basename(target) + ".sagejs-lmfdb-" + str(os.getpid())
    for counter in range(1000):
        candidate = os.path.join(directory, stem + "-" + str(counter))
        try:
            descriptor = os.open(candidate, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
        except FileExistsError:
            continue
        os.close(descriptor)
        return candidate
    raise FileExistsError("could not reserve a unique LMFDB snapshot temporary file")


def _write_snapshot(
    path: str, records: Sequence[LMFDBRecord], explain: Mapping[str, Any]
) -> None:
    if not records:
        raise LMFDBQueryError("cannot snapshot an empty LMFDB result")
    try:
        import sqlite3
    except Exception as exception:
        raise LMFDBCapabilityError("SQLite snapshots are unavailable") from exception
    target = os.path.abspath(os.fspath(path))
    directory = os.path.dirname(target) or os.curdir
    if not os.path.isdir(directory):
        raise FileNotFoundError(directory)
    temporary = _exclusive_temporary_path(directory, target)
    database = None
    try:
        database = sqlite3.connect(temporary)
        database.execute("pragma application_id=1397509446")
        database.execute("pragma user_version=1")
        database.execute(
            "create table sagejs_dataset_metadata("
            "key text primary key, value text not null)"
        )
        database.execute(
            "create table records("
            "collection text not null, label text not null, "
            "normalized_json text not null, source_json text not null, "
            "provenance_json text not null, record_sha256 text not null, "
            "row_sha256 text not null, "
            "primary key(collection,label))"
        )
        database.execute("create index records_label on records(label)")
        ordered = sorted(records, key=lambda record: (record.kind, record.label))
        database.executemany(
            "insert into records values (?,?,?,?,?,?,?)",
            [
                tuple(
                    _snapshot_row(
                        "genus2_curves"
                        if record.kind == "genus2_curve"
                        else "number_fields",
                        record.label,
                        _canonical_json(record.to_dict()),
                        _canonical_json(record.raw_data()),
                        _canonical_json(record.provenance()),
                        record.record_sha256,
                    )[field]
                    for field in (
                        "collection",
                        "label",
                        "normalized_json",
                        "source_json",
                        "provenance_json",
                        "record_sha256",
                        "row_sha256",
                    )
                )
                for record in ordered
            ],
        )
        written_rows = database.execute(
            "select collection, label, row_sha256 from records "
            "order by collection,label"
        ).fetchall()
        digest_rows = [
            (str(collection) + "\0" + str(label), str(row_digest))
            for collection, label, row_digest in written_rows
        ]
        collections = sorted(
            set(
                "genus2_curves" if record.kind == "genus2_curve" else "number_fields"
                for record in ordered
            )
        )
        metadata = {
            "schema": SNAPSHOT_SCHEMA,
            "adapter_version": ADAPTER_VERSION,
            "record_count": str(len(ordered)),
            "logical_records_sha256": _logical_digest(digest_rows),
            "collections": _canonical_json(collections),
            "query": _canonical_json(explain),
            "provenance": "user-local",
            "citation": bundled.CITATION,
        }
        metadata["snapshot_metadata_sha256"] = _sha256_text(_canonical_json(metadata))
        database.executemany(
            "insert into sagejs_dataset_metadata values (?,?)",
            sorted(metadata.items()),
        )
        database.commit()
        check = database.execute("pragma quick_check").fetchone()
        if check is None or check[0] != "ok":
            raise LMFDBSchemaError("new LMFDB snapshot failed SQLite quick_check")
        database.close()
        database = None
        os.replace(temporary, target)
    except Exception:
        if database is not None:
            database.close()
        if os.path.exists(temporary):
            os.remove(temporary)
        raise


class LMFDBQuery:
    """Lazy, reiterable, bounded query over one typed collection."""

    __slots__ = ("_collection", "_predicates", "_ordering", "_limit")

    def __init__(
        self,
        collection: LMFDBCollection,
        predicates: Mapping[str, Any],
        ordering: Sequence[str],
        limit: int | None,
    ) -> None:
        self._collection = collection
        self._predicates = dict(predicates)
        self._ordering = tuple(ordering)
        self._limit = limit

    def __iter__(self) -> Iterator[LMFDBRecord]:
        return iter(
            self._collection._catalog._provider.execute(
                self._collection._adapter,
                self._predicates,
                self._ordering,
                self._limit,
            )
        )

    def all(self) -> list[LMFDBRecord]:
        return list(self)

    def sort(self, *fields: str) -> LMFDBQuery:
        ordering = self._collection._normalize_sort(fields)
        return LMFDBQuery(self._collection, self._predicates, ordering, self._limit)

    def limit(self, value: int | None) -> LMFDBQuery:
        normalized = self._collection._normalize_limit(value)
        return LMFDBQuery(
            self._collection, self._predicates, self._ordering, normalized
        )

    def explain(self) -> dict[str, Any]:
        predicates = {}
        for key, value in self._predicates.items():
            predicates[key] = (
                {"operator": "between", "lower": value.lower, "upper": value.upper}
                if isinstance(value, Between)
                else {"operator": "equal", "value": value}
            )
        answer: dict[str, Any] = {
            "schema": SCHEMA,
            "provider": self._collection.provider,
            "collection": self._collection.name,
            "predicates": predicates,
            "sort": list(self._ordering),
            "limit": self._limit,
        }
        provider = self._collection._catalog._provider
        if isinstance(provider, _OnlineProvider):
            answer["request_url"] = provider._initial_url(
                self._collection._adapter, self._predicates, self._ordering
            )
        return answer

    def snapshot(self, path: str) -> str:
        records = self.all()
        _write_snapshot(path, records, self.explain())
        return os.path.abspath(os.fspath(path))


class LMFDBCollection:
    """A typed LMFDB collection independent of its data provider."""

    __slots__ = ("_catalog", "_adapter")

    def __init__(self, catalog: LMFDB, adapter: _Adapter) -> None:
        self._catalog = catalog
        self._adapter = adapter

    @property
    def name(self) -> str:
        return self._adapter.collection

    @property
    def provider(self) -> str:
        return self._catalog._provider.name

    @property
    def schema(self) -> str:
        return SCHEMA

    def __getitem__(self, label: str) -> LMFDBRecord:
        answer = self.get(label)
        if answer is None:
            raise KeyError(label)
        return answer

    def get(self, label: str, default: Any = None) -> Any:
        if not isinstance(label, str) or not label:
            raise ValueError("LMFDB labels must be nonempty strings")
        records = self.search(label=label, sort=("label",), limit=2).all()
        if len(records) > 1:
            raise LMFDBSchemaError("LMFDB label lookup returned multiple records")
        return default if not records else records[0]

    def _normalize_sort(self, sort: Sequence[str]) -> tuple[str, ...]:
        answer = []
        for field in sort:
            if not isinstance(field, str) or not field:
                raise LMFDBQueryError("sort fields must be nonempty strings")
            public = field[1:] if field.startswith("-") else field
            if public not in self._adapter.fields:
                raise LMFDBQueryError("unsupported sort field " + repr(public))
            answer.append(field)
        if "label" not in [field.lstrip("-") for field in answer]:
            answer.append("label")
        return tuple(answer)

    def _normalize_limit(self, limit: int | None) -> int | None:
        if limit is None:
            if self.provider == "online":
                raise LMFDBQueryError("online LMFDB queries require a finite limit")
            return None
        value = _exact_integer(limit, "limit")
        if value < 1:
            raise LMFDBQueryError("LMFDB query limit must be positive")
        if self.provider == "online" and value > MAX_ONLINE_LIMIT:
            raise LMFDBQueryError(
                "online LMFDB limit must not exceed " + str(MAX_ONLINE_LIMIT)
            )
        return value

    def search(
        self,
        *,
        sort: Sequence[str] = ("label",),
        limit: int | None = 100,
        **predicates: Any,
    ) -> LMFDBQuery:
        normalized = {
            field: self._adapter.validate_predicate(field, predicate)
            for field, predicate in predicates.items()
        }
        return LMFDBQuery(
            self,
            normalized,
            self._normalize_sort(sort),
            self._normalize_limit(limit),
        )

    def coverage(self) -> dict[str, Any]:
        return _detached(self._catalog._provider.coverage(self.name))

    def citation(self) -> str:
        return bundled.CITATION


class LMFDB:
    """Provider-independent LMFDB catalog session."""

    def __init__(
        self,
        source: str = "auto",
        *,
        base_url: str = DEFAULT_API_URL,
        timeout: float = 30,
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
        _snapshot_path: str | None = None,
    ) -> None:
        if source == "auto":
            source = "bundled"
        if source == "bundled":
            provider: _Provider = _BundledProvider()
        elif source == "online":
            provider = _OnlineProvider(base_url, timeout, max_response_bytes)
        elif source == "snapshot" and _snapshot_path is not None:
            provider = _SnapshotProvider(_snapshot_path)
        else:
            raise ValueError("source must be 'auto', 'bundled', or 'online'")
        self._provider = provider
        self.genus2_curves = LMFDBCollection(self, _ADAPTERS["genus2_curves"])
        self.number_fields = LMFDBCollection(self, _ADAPTERS["number_fields"])

    @classmethod
    def open(cls, path: str) -> LMFDB:
        """Open and validate a user-local SQLite query snapshot."""

        return cls(source="snapshot", _snapshot_path=path)

    def capabilities(self) -> dict[str, Any]:
        return _detached(self._provider.capabilities())

    def close(self) -> None:
        self._provider.close()

    def __enter__(self) -> LMFDB:
        return self

    def __exit__(self, _kind: Any, _value: Any, _traceback: Any) -> bool:
        self.close()
        return False


__all__ = [
    "Between",
    "Genus2CurveRecord",
    "LMFDB",
    "LMFDBCapabilityError",
    "LMFDBCollection",
    "LMFDBError",
    "LMFDBNetworkError",
    "LMFDBQuery",
    "LMFDBQueryError",
    "LMFDBRecord",
    "LMFDBSchemaError",
    "NumberFieldRecord",
    "between",
]
