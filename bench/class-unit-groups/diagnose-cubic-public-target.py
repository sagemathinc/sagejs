import json
import time

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomial = x**3 - x**2 - 11 * x - 63


def fresh(name, rebuild, prepare_order=True, vector=False):
    p = (
        R([int(v) for v in ["-63", "-11", "-1", "1"]])
        if vector
        else (
            sum(int(v) * x**i for i, v in enumerate(["-63", "-11", "-1", "1"]))
            if rebuild
            else polynomial
        )
    )
    field = NumberField(p, name)
    if prepare_order:
        field.maximal_order()
    return field


warm = fresh("warm", False)
assert warm.class_number(proof=False) == 3
receipt = getattr(warm, "_native_cubic_class_number_certificate", None)
assert receipt is not None and receipt.matches(warm)
assert receipt.verify_conditional_grh(warm)

samples = []
for boundary in [
    "scalar-prepared",
    "fresh-complete",
    "fresh-class-number",
    "coefficient-vector-complete",
    "coefficient-vector-class-number",
]:
    prepared = (
        [fresh("prepared_" + str(i), False) for i in range(128)]
        if boundary == "scalar-prepared"
        else None
    )
    fields = []
    answers = []
    started = time.perf_counter_ns()
    for i in range(128):
        field = (
            prepared[i]
            if prepared is not None
            else fresh(
                boundary + "_" + str(i),
                True,
                boundary
                not in ["fresh-class-number", "coefficient-vector-class-number"],
                boundary.startswith("coefficient-vector"),
            )
        )
        answers.append(int(field.class_number(proof=False)))
        fields.append(field)
    elapsed = time.perf_counter_ns() - started
    assert all(answer == 3 for answer in answers)
    for field in fields:
        receipt = getattr(field, "_native_cubic_class_number_certificate", None)
        assert receipt is not None and receipt.matches(field)
        assert list(receipt.invariants) == [3]
    assert receipt.verify_conditional_grh(fields[-1])
    samples.append(
        {
            "boundary": boundary,
            "iterations": 128,
            "root_ns": str(elapsed),
            "authenticated_receipts": 128,
            "independent_replay": True,
        }
    )
print("CUBIC_TARGET_RESULT=" + json.dumps(samples))
