"""Public prepared-root development timing; no automatic promotion gate."""

import json
import math
import time

from sagejs.numerics.evaluators import PreparedFunction
from sagejs.numerics.prepared_roots import solve_prepared_root

samples = {"native": [], "dynamic": []}
preparation = {"native": [], "dynamic": []}
targets = {}
for block in range(10):
    for backend in ["native", "dynamic"] if block % 2 else ["dynamic", "native"]:
        start = time.perf_counter()
        function = PreparedFunction("x*x-a", inputs=("x", "a"), backend=backend)
        preparation[backend].append(1000 * (time.perf_counter() - start))
        start = time.perf_counter()
        for index in range(20):
            parameter = 2.0 if index % 2 else 3.0
            result = solve_prepared_root(function, 1.0, 2.0, parameters=(parameter,))
            assert result.success
            assert abs(result.value - math.sqrt(parameter)) < 1e-12
            assert result.backend == (
                "source-native" if backend == "native" else "ordinary-python"
            )
        elapsed = 1000 * (time.perf_counter() - start)
        targets[backend] = result.plan_record.to_dict()["capability"][
            "execution_target"
        ]
        if block >= 3:
            samples[backend].append(elapsed)
        function.close()
print(
    json.dumps(
        {
            "scope": "public-prepared-root-with-independent-validation",
            "batch": 20,
            "warmups": 3,
            "samples_ms": samples,
            "preparation_ms": preparation,
            "execution_targets": targets,
        }
    )
)
