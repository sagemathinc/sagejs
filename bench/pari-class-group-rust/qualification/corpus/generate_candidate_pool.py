#!/usr/bin/env python3
"""Build a private PARI 2.17.4 candidate pool without leaking held-out answers.

This is deliberately a corpus-construction tool, not part of Sage.js.  It
generates deterministic monic polynomials, asks the pinned GP executable for
class-group evidence and timings, and independently checks elementary field
facts with SymPy.  Answer-bearing output is refused inside the repository.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import sympy


HERE = Path(__file__).resolve().parent
REPOSITORY = HERE.parents[3]
DEFAULT_GP = Path("/home/user/upstream/pari-2.17.4/gp")
SEED = "sagejs-rust-class-group-candidate-pool-v1-2026-09-20"
MARKER = "SAGEJS_CORPUS_V1|"
VERSION = "2.17.4"
EXPECTED_GP_SHA256 = "915f8085d7eace9f9778edcbc657083a234cdea657dfcc677a26003fde4232c4"
TRACE_SOURCE_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac"
RELATION_BATCH = re.compile(
    r"#### Look for [0-9]+ relations in [0-9]+ ideals \((?:small_norm|rnd_rel)\)"
)


class GenerationError(RuntimeError):
    pass


def compact(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":")).encode()


def digest(path: Path) -> str:
    answer = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            answer.update(block)
    return answer.hexdigest()


def polynomial_digest(coefficients: list[str]) -> str:
    return hashlib.sha256(compact(coefficients)).hexdigest()


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def require_private(path: Path) -> None:
    if is_within(path, REPOSITORY):
        raise GenerationError(
            f"answer-bearing output must be outside the repository: {path}"
        )


def gp_identity(gp: Path) -> dict[str, Any]:
    if not gp.is_file():
        raise GenerationError(f"GP executable does not exist: {gp}")
    binary_sha = digest(gp.resolve())
    run = subprocess.run(
        [str(gp), "-fq"],
        input="\\v\n",
        text=True,
        capture_output=True,
        check=True,
        timeout=15,
    )
    banner = "\n".join(line.strip() for line in run.stdout.splitlines() if line.strip())
    if f"Version {VERSION}" not in banner:
        raise GenerationError(f"expected PARI {VERSION}; got:\n{banner}")
    if binary_sha != EXPECTED_GP_SHA256:
        raise GenerationError(
            f"unexpected GP binary sha256 {binary_sha}; expected {EXPECTED_GP_SHA256}"
        )
    source = gp.resolve().parents[1] / "src" / "basemath" / "buch2.c"
    source_sha = digest(source) if source.is_file() else None
    if source_sha != TRACE_SOURCE_SHA256:
        raise GenerationError(
            f"unexpected Buchall source sha256 {source_sha}; "
            f"expected {TRACE_SOURCE_SHA256}"
        )
    return {
        "pariVersion": VERSION,
        "gpPath": str(gp.resolve()),
        "gpSha256": binary_sha,
        "buchallSourcePath": str(source),
        "buchallSourceSha256": source_sha,
        "banner": banner,
    }


def gp_polynomial(coefficients: list[int]) -> str:
    terms: list[str] = []
    for exponent, coefficient in enumerate(coefficients):
        if coefficient:
            terms.append(f"({coefficient})*x^{exponent}")
    return "+".join(terms) or "0"


def parse_int_vector(value: str) -> list[str]:
    value = value.strip()
    if value == "[]":
        return []
    if not (value.startswith("[") and value.endswith("]")):
        raise GenerationError(f"not a GP integer vector: {value}")
    entries = [entry.strip() for entry in value[1:-1].split(",")]
    if not all(re.fullmatch(r"[0-9]+", entry) for entry in entries):
        raise GenerationError(f"not a positive GP integer vector: {value}")
    return entries


def oracle_case(
    gp: Path, coefficients: list[int], repeats: int, timeout_seconds: int
) -> dict[str, Any]:
    polynomial = gp_polynomial(coefficients)
    script = f"""default(parisizemax,4000000000);
default(debug,0);
P={polynomial};
print(\"{MARKER}irreducible|\",polisirreducible(P));
N=nfinit(P);
print(\"{MARKER}signature|\",N.sign[1],\"|\",N.sign[2]);
print(\"{MARKER}index|\",N.index);
print(\"{MARKER}discriminant|\",N.disc);
for(i=1,{repeats},if(i=={repeats},default(debug,1));t=getwalltime();B=bnfinit(P);print(\"{MARKER}sample|\",1000000*(getwalltime()-t),\"|\",B.clgp[1],\"|\",B.clgp[2]));
"""
    run = subprocess.run(
        [str(gp), "-fq"],
        input=script,
        text=True,
        capture_output=True,
        check=True,
        timeout=timeout_seconds,
    )
    records = [
        line[len(MARKER) :].split("|")
        for line in run.stdout.splitlines()
        if line.startswith(MARKER)
    ]
    if len(records) != 4 + repeats:
        raise GenerationError(
            f"incomplete GP evidence ({len(records)} records): {run.stderr[-1000:]}"
        )
    if records[0] != ["irreducible", "1"]:
        raise GenerationError("polynomial is reducible")
    signature = [int(records[1][1]), int(records[1][2])]
    equation_index = int(records[2][1])
    discriminant = int(records[3][1])
    samples: list[int] = []
    class_number: str | None = None
    invariants: list[str] | None = None
    for record in records[4:]:
        if record[0] != "sample" or len(record) != 4:
            raise GenerationError(f"malformed GP sample: {record}")
        # GP's wall timer has millisecond resolution.  Zero is a valid
        # observation for tiny cases, represented conservatively as 1 ns so
        # the raw sample contract remains a positive integer.
        samples.append(max(1, int(record[1])))
        current_h = record[2]
        # PARI prints cyclic factors largest first. The corpus contract uses
        # Smith invariant order (smallest first, each dividing the next).
        current_cyc = list(reversed(parse_int_vector(record[3])))
        if class_number is None:
            class_number, invariants = current_h, current_cyc
        elif (class_number, invariants) != (current_h, current_cyc):
            raise GenerationError("PARI returned inconsistent repeated answers")
    relation_batches = len(RELATION_BATCH.findall(run.stderr))
    precision_restarts = run.stderr.count("increasing accuracy")
    precision_warnings = run.stderr.count("Buchall_param (")
    if precision_restarts != precision_warnings:
        raise GenerationError(
            "PARI precision trace counters disagree: "
            f"restarts={precision_restarts}, warnings={precision_warnings}"
        )
    return {
        "signature": signature,
        "equationOrderIndex": str(equation_index),
        "fieldDiscriminant": str(discriminant),
        "classNumber": class_number,
        "invariantFactors": invariants,
        "pariPublicNanoseconds": samples,
        "trace": {
            "contract": "pari-buchall-debug-trace-v1",
            "sourceSha256": TRACE_SOURCE_SHA256,
            "debugLevel": 1,
            "relationSearchBatches": relation_batches,
            "relationContinuationCount": max(0, relation_batches - 1),
            "precisionRestartCount": precision_restarts,
        },
    }


def independent_check(
    coefficients: list[int], oracle: dict[str, Any]
) -> dict[str, Any]:
    x = sympy.Symbol("x")
    polynomial = sympy.Poly.from_list(list(reversed(coefficients)), gens=x)
    irreducible = bool(polynomial.is_irreducible)
    discriminant = int(sympy.discriminant(polynomial.as_expr(), x))
    # Independently obtain the real-root count by isolating exact real
    # intervals.
    real_roots = len(sympy.polys.polytools.intervals(polynomial, eps=None))
    signature = [real_roots, (polynomial.degree() - real_roots) // 2]
    if not irreducible:
        raise GenerationError("SymPy independently reports reducible")
    if signature != oracle["signature"]:
        raise GenerationError(
            f"signature disagreement: SymPy {signature}, PARI {oracle['signature']}"
        )
    # Polynomial and field discriminants differ by the square of the equation
    # order index.  This checks PARI's reported index and field discriminant
    # without reusing PARI arithmetic.
    index = int(oracle["equationOrderIndex"])
    if discriminant != int(oracle["fieldDiscriminant"]) * index * index:
        raise GenerationError("independent discriminant/index identity failed")
    return {
        "engine": f"sympy-{sympy.__version__}",
        "irreducible": True,
        "signature": signature,
        "polynomialDiscriminant": str(discriminant),
        "fieldDiscriminantTimesIndexSquared": str(
            int(oracle["fieldDiscriminant"]) * index * index
        ),
    }


def timing_stratum(samples: list[int]) -> str:
    median = sorted(samples)[len(samples) // 2]
    if median < 5_000_000:
        return "under-5ms"
    if median < 100_000_000:
        return "5ms-to-100ms"
    if median < 2_000_000_000:
        return "100ms-to-2s"
    if median <= 30_000_000_000:
        return "2s-to-30s"
    raise GenerationError("median PARI time exceeds 30 seconds")


def deterministic_inputs(per_degree: int) -> list[dict[str, Any]]:
    """Return an answer-free oversampled input pool.

    Coefficient magnitudes deliberately span the four expected timing bands.
    Qualification still derives the actual band from measurements; the scale
    is never treated as an answer or timing oracle.
    """

    def multiply(left: list[int], right: list[int]) -> list[int]:
        product = [0] * (len(left) + len(right) - 1)
        for i, a in enumerate(left):
            for j, b in enumerate(right):
                product[i + j] += a * b
        return product

    cases: list[dict[str, Any]] = []
    # Start from a polynomial with the requested real/complex root pattern,
    # then perturb its constant term. Qualification proves both irreducibility
    # and the surviving signature; construction is never accepted as proof.
    root_scales = [7, 15, 31, 63, 127, 255, 511, 1023, 2047]
    for degree in range(2, 7):
        # Degree-local streams make every per-degree prefix stable. A smoke
        # run with --per-degree 1 therefore qualifies exactly the first case
        # of the frozen --per-degree 72 pool.
        rng = random.Random(f"{SEED}\0degree={degree}")
        signatures = [(degree - 2 * r2, r2) for r2 in range(degree // 2 + 1)]
        for ordinal in range(per_degree):
            r1, r2 = signatures[ordinal % len(signatures)]
            scale = root_scales[(ordinal // len(signatures)) % len(root_scales)]
            coefficients = [1]
            for index in range(r1):
                root = scale * (2 * index - r1 + 1) + rng.randrange(-2, 3)
                coefficients = multiply(coefficients, [-root, 1])
            for index in range(r2):
                real = scale * (index + 1) + rng.randrange(-2, 3)
                imaginary = scale * (r2 + index + 2) + rng.randrange(1, 4)
                coefficients = multiply(
                    coefficients,
                    [real * real + imaginary * imaginary, -2 * real, 1],
                )
            # A small nonsquare perturbation typically destroys the explicit
            # factorization without crossing a root-discriminant boundary.
            perturbation = 2 + ordinal // 2
            coefficients[0] += perturbation if ordinal % 2 == 0 else -perturbation
            encoded = [str(value) for value in coefficients]
            case_digest = polynomial_digest(encoded)
            cases.append(
                {
                    "id": f"generated-d{degree}-{ordinal + 1:04d}-{case_digest[:12]}",
                    "polynomialAscending": encoded,
                    "polynomialSha256": case_digest,
                    "degree": degree,
                }
            )
    return cases


def traits(case: dict[str, Any], oracle: dict[str, Any]) -> list[str]:
    h = int(oracle["classNumber"])
    answer = ["trivial-class-group" if h == 1 else "nontrivial-class-group"]
    if len(oracle["invariantFactors"]) > 1:
        answer.append("noncyclic-class-group")
    if int(oracle["equationOrderIndex"]) > 1:
        answer.append("nontrivial-equation-order-index")
    discriminant = abs(int(oracle["fieldDiscriminant"]))
    # Every rational prime dividing the field discriminant ramifies. The
    # qualification factor-base policy always includes ramified primes below
    # 100, so this is exact structural evidence rather than a timing proxy.
    if any(discriminant % prime == 0 for prime in sympy.primerange(2, 100)):
        answer.append("ramified-factor-base-prime")
    if oracle["signature"][0] + oracle["signature"][1] - 1 > 0:
        answer.append("nontrivial-units")
    if max(abs(int(value)) for value in case["polynomialAscending"]) >= 10**8:
        answer.append("large-exact-intermediates")
    if oracle["trace"]["precisionRestartCount"] > 0:
        answer.append("precision-restart")
    if oracle["trace"]["relationContinuationCount"] > 0:
        answer.append("relation-continuation")
    return answer


def command_verify(arguments: argparse.Namespace) -> None:
    print(json.dumps(gp_identity(Path(arguments.gp)), indent=2))


def command_neutral(arguments: argparse.Namespace) -> None:
    value = {
        "schema": "sagejs.rust-class-group/neutral-candidate-input-pool-v1",
        "seed": SEED,
        "answerVisibility": "none",
        "cases": deterministic_inputs(arguments.per_degree),
    }
    rendered = json.dumps(value, indent=2) + "\n"
    if arguments.output:
        target = Path(arguments.output)
        target.write_text(rendered, encoding="utf-8")
        print(f"wrote {target} sha256={digest(target)}")
    else:
        sys.stdout.write(rendered)


def command_qualify(arguments: argparse.Namespace) -> None:
    gp = Path(arguments.gp)
    identity = gp_identity(gp)
    output = Path(arguments.output).resolve()
    require_private(output)
    inputs = deterministic_inputs(arguments.per_degree)
    candidates: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    if arguments.resume and output.exists():
        checkpoint = json.loads(output.read_text(encoding="utf-8"))
        if (
            checkpoint.get("schema")
            != "sagejs.rust-class-group/private-candidate-pool-v1"
        ):
            raise GenerationError("resume checkpoint has an unexpected schema")
        if checkpoint.get("generatorSeed") != SEED:
            raise GenerationError("resume checkpoint has a different generator seed")
        if checkpoint.get("oracleBuild", {}).get("gpSha256") != identity["gpSha256"]:
            raise GenerationError("resume checkpoint used a different GP binary")
        candidates = checkpoint.get("candidates", [])
        failures = checkpoint.get("failures", [])
    completed = {case["id"] for case in candidates} | {
        failure["id"] for failure in failures
    }
    for position, case in enumerate(inputs, start=1):
        if case["id"] in completed:
            continue
        coefficients = list(map(int, case["polynomialAscending"]))
        try:
            oracle = oracle_case(
                gp,
                coefficients,
                arguments.repeats,
                arguments.candidate_timeout_seconds,
            )
            independent = independent_check(coefficients, oracle)
            candidates.append(
                {
                    **case,
                    "signature": oracle["signature"],
                    "timingStratum": timing_stratum(oracle["pariPublicNanoseconds"]),
                    "traits": traits(case, oracle),
                    "irreducible": True,
                    "expected": {
                        "classNumber": oracle["classNumber"],
                        "invariantFactors": oracle["invariantFactors"],
                        "pariPublicNanoseconds": oracle["pariPublicNanoseconds"],
                        "oracleIdentity": (
                            f"pari-{VERSION}-gp-sha256:{identity['gpSha256']}"
                        ),
                        "validationStatus": "pari-plus-independent-check",
                    },
                    "constructionEvidence": {
                        "equationOrderIndex": oracle["equationOrderIndex"],
                        "fieldDiscriminant": oracle["fieldDiscriminant"],
                        "pariTrace": oracle["trace"],
                        "independent": independent,
                    },
                }
            )
        except (GenerationError, subprocess.SubprocessError) as error:
            failures.append({"id": case["id"], "reason": str(error)})
        print(
            f"[{position}/{len(inputs)}] accepted={len(candidates)} failures={len(failures)}",
            file=sys.stderr,
            flush=True,
        )
        checkpoint = {
            "schema": "sagejs.rust-class-group/private-candidate-pool-v1",
            "generatorSeed": SEED,
            "oracleBuild": identity,
            "candidates": candidates,
            "failures": failures,
        }
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(checkpoint, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {output} sha256={digest(output)}")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    verify = commands.add_parser("verify-oracle")
    verify.add_argument("--gp", default=str(DEFAULT_GP))
    verify.set_defaults(run=command_verify)
    neutral = commands.add_parser("neutral-inputs")
    neutral.add_argument("--per-degree", type=int, default=72)
    neutral.add_argument("--output")
    neutral.set_defaults(run=command_neutral)
    qualify = commands.add_parser("qualify")
    qualify.add_argument("--gp", default=str(DEFAULT_GP))
    qualify.add_argument("--per-degree", type=int, default=72)
    qualify.add_argument("--repeats", type=int, default=15)
    qualify.add_argument(
        "--candidate-timeout-seconds",
        type=int,
        default=600,
        help="wall timeout for all repeated measurements of one candidate",
    )
    qualify.add_argument("--output", required=True)
    qualify.add_argument(
        "--resume", action="store_true", help="resume a matching private checkpoint"
    )
    qualify.set_defaults(run=command_qualify)
    return result


def main() -> int:
    try:
        arguments = parser().parse_args()
        if getattr(arguments, "per_degree", 1) < 1:
            raise GenerationError("--per-degree must be positive")
        if getattr(arguments, "repeats", 15) < 15:
            raise GenerationError("--repeats must be at least 15")
        if getattr(arguments, "candidate_timeout_seconds", 1) < 1:
            raise GenerationError("--candidate-timeout-seconds must be positive")
        arguments.run(arguments)
        return 0
    except (GenerationError, OSError, subprocess.SubprocessError) as error:
        print(f"candidate generation error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
