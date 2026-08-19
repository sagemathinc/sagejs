"""Persistent adapter that times number-field workloads inside Magma.

The Python process stays resident for the benchmark protocol.  Each request is
executed by one Magma process containing all warmups and retained samples, and
the reported times are measured inside Magma, so process startup is excluded.
"""

import json
import os
import subprocess
import sys
import tempfile
import traceback


MAGMA = os.environ.get("SAGEJS_MAGMA", "/home/user/bin/magma")
SAMPLE_MARKER = "@@NFFP_MAGMA_SAMPLE@@"


def magma_version():
    completed = subprocess.run(
        [MAGMA, "-b"],
        input="GetVersion();\nquit;\n",
        capture_output=True,
        check=True,
        text=True,
        timeout=15,
    )
    return ".".join(completed.stdout.strip().split())


def polynomial_text(coefficients):
    terms = []
    for exponent, coefficient in enumerate(coefficients):
        if coefficient:
            terms.append(f"({int(coefficient)})*x^{exponent}")
    return " + ".join(terms) or "0"


def point_text(point):
    return f"C![({point[0]}),({point[1]})]"


def magma_program(request):
    operation = request["operation"]
    warmups = int(request.get("warmups", 0))
    samples = int(request.get("samples", 1))
    bound = int(request.get("bound", 0))
    digits = max(20, int(int(request.get("precision_bits", 53)) * 0.30103) + 12)
    points = request.get("points", [])
    shared = f"""
SetColumns(1024);
Q<x> := PolynomialRing(Rationals());
f := {polynomial_text(request["coefficients"])};

function LocalData(O, polynomial, index_squared, p)
    if index_squared mod p eq 0 then
        return [ <entry[2], Valuation(Integers()!Norm(entry[1]), p)> : entry in Factorization(p*O) ];
    end if;
    reduced_ring<y> := PolynomialRing(GF(p));
    return [ <entry[2], Degree(entry[1])> : entry in Factorization(reduced_ring!polynomial) ];
end function;

function LocalCoefficient(degrees, exponent)
    coefficients := [ Integers() | 0 : index in [0..exponent] ];
    coefficients[1] := 1;
    for degree in degrees do
        for index in [degree..exponent] do
            coefficients[index+1] +:= coefficients[index-degree+1];
        end for;
    end for;
    return coefficients[exponent+1];
end function;

for sample_index in [1..{warmups + samples}] do
    K<a> := NumberField(f);
"""
    if operation == "prime-stream":
        repetitions = 100
        body = f"""
    O := MaximalOrder(K);
    index_squared := Abs(Integers()!(Discriminant(f)/Discriminant(O)));
    started := Realtime();
    for repeat_index in [1..{repetitions}] do
        answer := [ <p, LocalData(O, f, index_squared, p)> : p in PrimesInInterval(2, {bound - 1}) ];
    end for;
    elapsed := 1000.0*Realtime(started)/{repetitions};
    if sample_index gt {warmups} then
        printf "{SAMPLE_MARKER}%o|", elapsed;
        for row_index in [1..#answer] do
            if row_index gt 1 then printf ";"; end if;
            printf "%o:", answer[row_index][1];
            for factor_index in [1..#answer[row_index][2]] do
                if factor_index gt 1 then printf ","; end if;
                printf "%o/%o", answer[row_index][2][factor_index][1], answer[row_index][2][factor_index][2];
            end for;
        end for;
        printf "\\n";
    end if;
"""
    elif operation == "coefficients":
        repetitions = 10
        body = f"""
    started := Realtime();
    for repeat_index in [1..{repetitions}] do
        O := MaximalOrder(K);
        index_squared := Abs(Integers()!(Discriminant(f)/Discriminant(O)));
        local_degrees := AssociativeArray(Integers());
        for p in PrimesInInterval(2, {bound}) do
            local_degrees[p] := [ entry[2] : entry in LocalData(O, f, index_squared, p) ];
        end for;
        answer := [ Integers() | 1 ];
        for n in [2..{bound}] do
            coefficient := 1;
            for factor in Factorization(n) do
                coefficient *:= LocalCoefficient(local_degrees[factor[1]], factor[2]);
            end for;
            Append(~answer, coefficient);
        end for;
    end for;
    elapsed := 1000.0*Realtime(started)/{repetitions};
    if sample_index gt {warmups} then
        printf "{SAMPLE_MARKER}%o|", elapsed;
        for index in [1..#answer] do
            if index gt 1 then printf ","; end if;
            printf "%o", answer[index];
        end for;
        printf "\\n";
    end if;
"""
    elif operation in ("quadratic-zeta-batch", "general-zeta-scalar"):
        repetitions = 1
        encoded_points = ", ".join(point_text(point) for point in points)
        body = f"""
    C := ComplexField({digits});
    L := LSeries(K);
    points := [ {encoded_points} ];
    started := Realtime();
    for repeat_index in [1..{repetitions}] do
        answer := [ Evaluate(L, point) : point in points ];
    end for;
    elapsed := 1000.0*Realtime(started)/{repetitions};
    if sample_index gt {warmups} then
        printf "{SAMPLE_MARKER}%o|", elapsed;
        for index in [1..#answer] do
            if index gt 1 then printf ";"; end if;
            printf "%o,%o", Real(answer[index]), Imaginary(answer[index]);
        end for;
        printf "\\n";
    end if;
"""
    elif operation == "global-arithmetic":
        body = f"""
    started := Realtime();
    O := MaximalOrder(K);
    U, unit_map := UnitGroup(O);
    class_group, class_map := ClassGroup(O);
    regulator := Regulator(O);
    unit_rank := #[ invariant : invariant in Invariants(U) | invariant eq 0 ];
    elapsed := 1000.0*Realtime(started);
    if sample_index gt {warmups} then
        printf "{SAMPLE_MARKER}%o|%o,%o,%o\\n", elapsed, unit_rank, #class_group, regulator;
    end if;
"""
    else:
        raise NotImplementedError(f"unsupported Magma operation {operation}")
    return shared + body + "end for;\nquit;\n"


def parse_payload(operation, payload):
    if operation == "prime-stream":
        rows = []
        if payload:
            for encoded_row in payload.split(";"):
                prime, encoded_factors = encoded_row.split(":", 1)
                factors = []
                if encoded_factors:
                    factors = [
                        [int(value) for value in factor.split("/", 1)]
                        for factor in encoded_factors.split(",")
                    ]
                rows.append([int(prime), sorted(factors)])
        return rows
    if operation == "coefficients":
        return [int(value) for value in payload.split(",")]
    if operation in ("quadratic-zeta-batch", "general-zeta-scalar"):
        values = [entry.split(",", 1) for entry in payload.split(";")]
        return values[0] if operation == "general-zeta-scalar" else values
    if operation == "global-arithmetic":
        rank, class_number, regulator = payload.split(",", 2)
        return {
            "unit_rank": int(rank),
            "unit_complete": True,
            "class_complete": True,
            "class_number": int(class_number),
            "regulator": regulator,
        }
    raise ValueError(f"unknown operation {operation}")


def run(request):
    program = magma_program(request)
    with tempfile.TemporaryDirectory(prefix="sagejs-nffp-magma-") as directory:
        script = os.path.join(directory, "workload.m")
        with open(script, "w", encoding="utf8") as handle:
            handle.write(program)
        completed = subprocess.run(
            [MAGMA, "-b", script],
            capture_output=True,
            check=False,
            text=True,
            timeout=max(30, int(request.get("timeout_ms", 300_000)) // 1000),
        )
    if completed.returncode:
        raise RuntimeError(completed.stderr or completed.stdout)
    samples = []
    for line in completed.stdout.splitlines():
        if not line.startswith(SAMPLE_MARKER):
            continue
        timing, payload = line[len(SAMPLE_MARKER) :].split("|", 1)
        samples.append(
            {
                "timing_ms": float(timing),
                "result": parse_payload(request["operation"], payload),
            }
        )
    if len(samples) != int(request.get("samples", 1)):
        raise RuntimeError(f"missing Magma samples: {completed.stdout}")
    repetitions = {
        "prime-stream": 100,
        "coefficients": 10,
    }.get(request["operation"], 1)
    return {
        "status": "ok",
        "samples": samples,
        "timing_repetitions": repetitions,
    }


try:
    version = magma_version()
except Exception as error:
    unavailable_reason = str(error)
    print("@@NFFP_READY@@unavailable: " + unavailable_reason, flush=True)
    for line in sys.stdin:
        print(
            "@@NFFP_RESULT@@"
            + json.dumps({"status": "unavailable", "reason": unavailable_reason}),
            flush=True,
        )
else:
    print("@@NFFP_READY@@Magma V" + version, flush=True)
    for line in sys.stdin:
        try:
            response = run(json.loads(line))
        except NotImplementedError as error:
            response = {"status": "unsupported", "reason": str(error)}
        except Exception as error:
            response = {
                "status": "error",
                "reason": str(error),
                "traceback": traceback.format_exc(limit=12),
            }
        print("@@NFFP_RESULT@@" + json.dumps(response, sort_keys=True), flush=True)
