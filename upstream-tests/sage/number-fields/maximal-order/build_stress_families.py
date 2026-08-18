#!/usr/bin/env python3
"""Generate the scalable maximal-order stress families.

The checked corpus is the runtime-independent authority.  This developer tool
regenerates its synthetic stress records from exact integer constructions and
uses GP only for exact determinant/HNF operations and an `nfdisc` cross-check.
It never uses probabilistic primality as proof.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Any


sys.set_int_max_str_digits(1_000_000)

TRIAL_BOUND = 10_000
BAD_GENERATORS = (
    ("pure-bad-generator-n112-c1009", 112, 1009, "degree-raising"),
    ("pure-bad-generator-n128-c1009", 128, 1009, "degree-raising"),
    ("pure-bad-generator-n144-c1009", 144, 1009, "degree-raising"),
    ("pure-bad-generator-n160-c1009", 160, 1009, "degree-raising"),
    ("pure-bad-generator-n32-c2pow512", 32, 2**512, "deep-index"),
    ("pure-bad-generator-n32-c2pow2048", 32, 2**2048, "deep-index"),
)
SCALED_GENERATORS = (
    ("scaled-generator-wild-p2-n16", 16, 2, "wild-small-prime"),
    ("scaled-generator-wild-p2-n32", 32, 2, "wild-small-prime"),
    ("scaled-generator-wild-p2-n64", 64, 2, "wild-small-prime"),
    ("scaled-generator-many-prime-n16", 16, math.prod((2, 3, 5, 7, 11, 13, 17, 19)), "many-prime"),
    (
        "scaled-generator-many-prime-n32",
        32,
        math.prod((2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31)),
        "many-prime",
    ),
)


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def digest(domain: str, value: Any) -> str:
    return hashlib.sha256(f"{domain}\n{compact_json(value)}".encode()).hexdigest()


def pure_field_discriminant(n: int) -> int:
    sign = -1 if (n * (n - 1) // 2 + n - 1) % 2 else 1
    return sign * n**n * 2 ** (n - 1)


def bad_generator_polynomial(n: int, c: int) -> list[int]:
    """Return the minpoly of `theta + c*theta^2`, where `theta^n = 2`.

    If `r_1,r_2` are the roots of `c*r^2+r-y`, then
    `u_j=c^j*(r_1^j+r_2^j)` satisfies
    `u_j=-u_(j-1)+c*y*u_(j-2)`.  The resultant is
    `(-y)^n-2*u_n+4*c^n`.
    """

    previous_previous = [2]
    previous = [-1]
    for _ in range(2, n + 1):
        current = [-value for value in previous]
        shifted = [0, *(c * value for value in previous_previous)]
        current.extend([0] * (len(shifted) - len(current)))
        for offset, value in enumerate(shifted):
            current[offset] += value
        previous_previous, previous = previous, current
    coefficients = [-2 * value for value in previous]
    coefficients[0] += 4 * c**n
    coefficients.extend([0] * (n + 1 - len(coefficients)))
    coefficients[n] += -1 if n % 2 else 1
    return coefficients


def scaled_generator_polynomial(n: int, scale: int) -> list[int]:
    coefficients = [-(2 * scale**n), *(0 for _ in range(n - 1)), 1]
    return coefficients


def primes_below(bound: int) -> list[int]:
    sieve = bytearray(b"\x01") * bound
    sieve[:2] = b"\x00\x00"
    for prime in range(2, math.isqrt(bound - 1) + 1):
        if sieve[prime]:
            sieve[prime * prime : bound : prime] = b"\x00" * (
                (bound - 1 - prime * prime) // prime + 1
            )
    return [value for value in range(2, bound) if sieve[value]]


SMALL_PRIMES = primes_below(TRIAL_BOUND)


def exact_trial_components(value: int) -> list[dict[str, Any]]:
    remaining = value
    components: list[dict[str, Any]] = []
    for prime in SMALL_PRIMES:
        if remaining % prime:
            continue
        valuation = 0
        while remaining % prime == 0:
            remaining //= prime
            valuation += 1
        components.append(
            {"value": str(prime), "valuation": valuation, "state": "proven-prime"}
        )
    if remaining > 1:
        components.append(
            {
                "value": str(remaining),
                "valuation": 1,
                "state": "composite-unresolved",
            }
        )
    return components


GP_HELPERS = r'''
jsonvec(v)=my(s="[");for(i=1,#v,if(i>1,s=concat(s,","));s=concat(s,concat("\"",concat(Str(v[i]),"\""))));concat(s,"]");
jsonmat(M)=my(s="[");for(i=1,matsize(M)[1],if(i>1,s=concat(s,","));s=concat(s,jsonvec(Vec(M[i,]))));concat(s,"]");
'''


def gp_bad_generator_evidence(gp: str, n: int, c: int) -> dict[str, Any]:
    program = f"""
default(parisizemax,4000000000);
default(threadsizemax,128000000);
allocatemem(128000000);
{GP_HELPERS}
n={n};c={c};
A=matrix(n,n,r,j,my(t=j-1,s=0);for(k=0,t,my(e=t+k,q=e\\n,rr=e%n);if(rr==r-1,s+=binomial(t,k)*c^k*2^q));s);
idx=abs(matdet(A));
fd=nfdisc(x^n-2);
u0=2;u1=-1;for(j=2,n,my(u=-u1+c*y*u0);u0=u1;u1=u);T=(-y)^n-2*u1+4*c^n;
B=nfbasis(T);
M=matrix(n,n,r,j,polcoef(B[r],j-1));D=denominator(M);H=mathnf((D*M)~)~;
print("{{\\\"index\\\":\\\"",idx,"\\\",\\\"fieldDiscriminant\\\":\\\"",fd,"\\\",\\\"basisDenominator\\\":\\\"",D,"\\\",\\\"basisNumerator\\\":",jsonmat(H),"}}");
quit;
"""
    completed = subprocess.run(
        [gp, "-fq"],
        input=program,
        text=True,
        stdout=subprocess.PIPE,
        check=True,
    )
    lines = [line for line in completed.stdout.splitlines() if line.startswith("{")]
    if len(lines) != 1:
        raise RuntimeError(f"expected one GP JSON record, got {len(lines)}")
    return json.loads(lines[0])


def gp_scaled_generator_evidence(gp: str, n: int, scale: int) -> dict[str, Any]:
    program = f"""
default(parisizemax,4000000000);
default(threadsizemax,128000000);
allocatemem(128000000);
{GP_HELPERS}
n={n};m={scale};T=y^n-2*m^n;B=nfbasis(T);fd=nfdisc(T);
M=matrix(n,n,r,j,polcoef(B[r],j-1));D=denominator(M);H=mathnf((D*M)~)~;
print("{{\\\"fieldDiscriminant\\\":\\\"",fd,"\\\",\\\"basisDenominator\\\":\\\"",D,"\\\",\\\"basisNumerator\\\":",jsonmat(H),"}}");
quit;
"""
    completed = subprocess.run(
        [gp, "-fq"], input=program, text=True, stdout=subprocess.PIPE, check=True
    )
    lines = [line for line in completed.stdout.splitlines() if line.startswith("{")]
    if len(lines) != 1:
        raise RuntimeError(f"expected one GP JSON record, got {len(lines)}")
    return json.loads(lines[0])


def polynomial_record(coefficients: list[int]) -> dict[str, Any]:
    strings = [str(value) for value in coefficients]
    height = max(abs(value) for value in coefficients)
    return {
        "coefficientOrder": "ascending",
        "coefficients": strings,
        "degree": len(coefficients) - 1,
        "coefficientHeight": str(height),
        "coefficientHeightBits": height.bit_length(),
        "digest": digest("sagejs-number-field-polynomial-v1", strings),
    }


def common_record(
    *,
    case_id: str,
    family: str,
    tags: list[str],
    coefficients: list[int],
    field_discriminant: int,
    index: int,
    local_factors: list[dict[str, Any]],
    basis: dict[str, Any],
    locator: str,
    construction: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": case_id,
        "tier": "stress",
        "tags": tags,
        "family": family,
        "polynomial": polynomial_record(coefficients),
        "equationDiscriminant": str(field_discriminant * index * index),
        "fieldDiscriminant": str(field_discriminant),
        "equationOrderIndex": str(index),
        "localIndexFactors": local_factors,
        "primeSupportCertified": all(
            factor["state"] == "proven-prime" for factor in local_factors
        ),
        "basis": basis,
        "provenance": {
            "source": "sagejs-generated-scalable-stress",
            "locator": locator,
            "implementationFamily": "pari-sage",
        },
        "construction": construction,
        "certification": {
            "expected": "certified-global-maximal-order",
            "fixtureEvidence": "exact-generator-change-with-pari-discriminant-check",
            "discriminantFamilies": ["pari-sage"],
            "latticeCrossChecks": [],
        },
    }


def bad_record(gp: str, case_id: str, n: int, c: int, shape: str) -> dict[str, Any]:
    coefficients = bad_generator_polynomial(n, c)
    evidence = gp_bad_generator_evidence(gp, n, c)
    field_discriminant = pure_field_discriminant(n)
    if int(evidence["fieldDiscriminant"]) != field_discriminant:
        raise RuntimeError(f"GP field discriminant mismatch for {case_id}")
    index = int(evidence["index"])
    basis_value = {
        "denominator": evidence["basisDenominator"],
        "numerator": evidence["basisNumerator"],
    }
    return common_record(
        case_id=case_id,
        family="pure-field-bad-generator",
        tags=[
            "bad-primitive-generator",
            "equivalent-generator",
            "pure-field",
            "scalable-stress",
            shape,
        ],
        coefficients=coefficients,
        field_discriminant=field_discriminant,
        index=index,
        local_factors=exact_trial_components(index),
        basis={
            "state": "available",
            "denominator": evidence["basisDenominator"],
            "digest": digest("sagejs-maximal-order-hnf-v1", basis_value),
            "storage": "digest-only",
        },
        locator=f"T(n,c)=minpoly(theta+c*theta^2), theta^n=2; n={n}; c={c}",
        construction={
            "schemaVersion": 1,
            "kind": "pure-field-quadratic-generator",
            "parameters": {"n": n, "c": str(c)},
            "polynomialProof": "quadratic-resultant-recurrence",
            "fieldDiscriminantProof": "gp-nfdisc-equals-binomial-discriminant",
            "equationOrderIndexProof": "exact-power-basis-transition-determinant",
            "basisProof": "gp-certified-basis-canonical-row-hnf",
            "localFactorProof": f"exact-trial-division-below-{TRIAL_BOUND}-plus-exact-cofactor",
        },
    )


def scaled_record(gp: str, case_id: str, n: int, scale: int, shape: str) -> dict[str, Any]:
    exponent = n * (n - 1) // 2
    index = scale**exponent
    denominator = scale ** (n - 1)
    numerator = [
        [str(denominator // scale**row) if row == column else "0" for column in range(n)]
        for row in range(n)
    ]
    scale_components = exact_trial_components(scale)
    if any(factor["state"] != "proven-prime" for factor in scale_components):
        raise RuntimeError(f"scale for {case_id} was not completely trial-factored")
    local_factors = [
        {
            "value": factor["value"],
            "valuation": factor["valuation"] * exponent,
            "state": "proven-prime",
        }
        for factor in scale_components
    ]
    basis_value = {"denominator": str(denominator), "numerator": numerator}
    evidence = gp_scaled_generator_evidence(gp, n, scale)
    if int(evidence["fieldDiscriminant"]) != pure_field_discriminant(n):
        raise RuntimeError(f"GP field discriminant mismatch for {case_id}")
    oracle_basis_value = {
        "denominator": evidence["basisDenominator"],
        "numerator": evidence["basisNumerator"],
    }
    if digest("sagejs-maximal-order-hnf-v1", oracle_basis_value) != digest(
        "sagejs-maximal-order-hnf-v1", basis_value
    ):
        raise RuntimeError(f"GP basis mismatch for {case_id}")
    return common_record(
        case_id=case_id,
        family=f"scaled-pure-field-{shape}",
        tags=[
            "bad-primitive-generator",
            "equivalent-generator",
            "pure-field",
            "scalable-stress",
            shape,
        ],
        coefficients=scaled_generator_polynomial(n, scale),
        field_discriminant=pure_field_discriminant(n),
        index=index,
        local_factors=local_factors,
        basis={
            "state": "available",
            "denominator": str(denominator),
            "digest": digest("sagejs-maximal-order-hnf-v1", basis_value),
            "storage": "digest-only",
        },
        locator=f"T(n,m)=minpoly(m*theta), theta^n=2; n={n}; m={scale}",
        construction={
            "schemaVersion": 1,
            "kind": "scaled-pure-field-generator",
            "parameters": {"n": n, "scale": str(scale)},
            "polynomialProof": "direct-substitution-in-x^n-2",
            "fieldDiscriminantProof": "binomial-discriminant-with-frozen-gp-family-check",
            "equationOrderIndexProof": "diagonal-power-basis-transition",
            "basisProof": "explicit-diagonal-inverse-transition-hnf",
            "localFactorProof": f"complete-deterministic-trial-division-below-{TRIAL_BOUND}",
        },
    )


def generate(gp: str, requested: set[str] | None) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for specification in BAD_GENERATORS:
        if requested is None or specification[0] in requested:
            records.append(bad_record(gp, *specification))
    for specification in SCALED_GENERATORS:
        if requested is None or specification[0] in requested:
            records.append(scaled_record(gp, *specification))
    if requested is not None:
        missing = requested - {record["id"] for record in records}
        if missing:
            raise ValueError(f"unknown stress ids: {', '.join(sorted(missing))}")
    return records


def corpus_summary(cases: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "caseCount": len(cases),
        "standardCount": sum(case["tier"] == "standard" for case in cases),
        "stressCount": sum(case["tier"] == "stress" for case in cases),
        "basisAvailableCount": sum(case["basis"]["state"] == "available" for case in cases),
        "basisInlineCount": sum(bool(case["basis"].get("numerator")) for case in cases),
        "crossFamilyLatticeCount": sum(
            case["certification"]["fixtureEvidence"] == "cross-family-lattice-agreement"
            for case in cases
        ),
        "degreeMinimum": min(case["polynomial"]["degree"] for case in cases),
        "degreeMaximum": max(case["polynomial"]["degree"] for case in cases),
    }


def stress_oracle_outcomes(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        *(
            {
                "caseId": record["id"],
                "oracle": "gp-nfbasis-2.17.3",
                "status": "ok",
                "boundMs": 180_000,
                "note": "exact basis, field discriminant, and canonical HNF completed during deterministic regeneration",
            }
            for record in records
        ),
        {
            "family": "scalable-stress-expansion",
            "oracle": "sage-10.9",
            "status": "unavailable",
            "reason": "Sage executable absent on the regeneration host",
        },
        {
            "family": "scalable-stress-expansion",
            "oracle": "hecke-0.39.21",
            "status": "unavailable",
            "reason": "Hecke package absent from the regeneration host Julia depot",
        },
    ]


def merge_corpus(path: Path, records: list[dict[str, Any]], check: bool) -> None:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    generated_ids = {record["id"] for record in records}
    current = {case["id"]: case for case in manifest["cases"]}
    if check:
        mismatches = [case_id for case_id in generated_ids if current.get(case_id) != next(
            record for record in records if record["id"] == case_id
        )]
        if mismatches:
            raise RuntimeError(f"corpus regeneration mismatch: {', '.join(sorted(mismatches))}")
        return
    manifest["cases"] = [
        case for case in manifest["cases"] if case["id"] not in generated_ids
    ] + records
    manifest["expectedOracleOutcomes"] = [
        outcome
        for outcome in manifest["expectedOracleOutcomes"]
        if outcome.get("caseId") not in generated_ids
        and outcome.get("family") != "scalable-stress-expansion"
    ] + stress_oracle_outcomes(records)
    manifest["summary"] = corpus_summary(manifest["cases"])
    manifest.pop("manifestDigest", None)
    manifest["manifestDigest"] = digest("sagejs-maximal-order-corpus-v1", manifest)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gp", default="/usr/bin/gp")
    parser.add_argument("--ids", nargs="*")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--merge-corpus", type=Path)
    parser.add_argument("--check-corpus", type=Path)
    args = parser.parse_args()
    requested = set(args.ids) if args.ids else None
    records = generate(args.gp, requested)
    if args.merge_corpus is not None and args.check_corpus is not None:
        parser.error("--merge-corpus and --check-corpus are mutually exclusive")
    if args.merge_corpus is not None:
        merge_corpus(args.merge_corpus, records, False)
    if args.check_corpus is not None:
        merge_corpus(args.check_corpus, records, True)
    result = {
        "schemaVersion": 1,
        "trialDivisionBoundExclusive": TRIAL_BOUND,
        "cases": records,
    }
    text = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output is None and args.merge_corpus is None and args.check_corpus is None:
        print(text, end="")
    elif args.output is not None:
        args.output.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
