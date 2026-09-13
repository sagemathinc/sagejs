import { createCminpackBackend } from "../index.mjs";
import { createMghOracle, parseMghCases, parseMghReference } from "./mgh.mjs";

function norm(values) {
  let scale = 0;
  let sum = 1;
  for (const value of values) {
    const absolute = Math.abs(value);
    if (absolute === 0) continue;
    if (scale < absolute) {
      sum = 1 + sum * (scale / absolute) ** 2;
      scale = absolute;
    } else {
      sum += (absolute / scale) ** 2;
    }
  }
  return scale === 0 ? 0 : scale * Math.sqrt(sum);
}

/**
 * Run the exact production reactor against cminpack's complete 53-case
 * More-Garbow-Hillstrom driver corpus.  The separate oracle module contains
 * only the upstream problem definitions, so it independently recomputes the
 * final residual rather than trusting the solver callback or status.
 */
export async function qualifyMgh({
  artifactBytes,
  oracleBytes,
  casesText,
  lmdifReferenceText,
  lmderReferenceText,
}) {
  const cases = parseMghCases(casesText);
  const references = {
    "cminpack-lmdif": parseMghReference(lmdifReferenceText),
    "cminpack-lmder": parseMghReference(lmderReferenceText),
  };
  if (cases.length !== 53 || references["cminpack-lmdif"].length !== 53 ||
      references["cminpack-lmder"].length !== 53) {
    throw new Error("the pinned cminpack qualification corpus is incomplete");
  }

  const backend = await createCminpackBackend(artifactBytes);
  const oracle = await createMghOracle(oracleBytes);
  const tolerance = Math.sqrt(Number.EPSILON);
  const results = [];

  for (const method of ["cminpack-lmdif", "cminpack-lmder"]) {
    for (let index = 0; index < cases.length; index += 1) {
      const record = cases[index];
      const reference = references[method][index];
      if (record.number !== reference.number ||
          record.variables !== reference.variables ||
          record.residuals !== reference.residuals) {
        throw new Error(`MGH case/reference mismatch at ${method} ${index}`);
      }
      const problem = oracle.problem(record);
      try {
        const result = backend.leastSquares({
          method,
          initial: problem.initial,
          residualCount: record.residuals,
          residual: problem.residual,
          jacobian: method === "cminpack-lmder" ? problem.jacobian : undefined,
          functionTolerance: tolerance,
          stepTolerance: tolerance,
          gradientTolerance: 0,
          finiteDifferenceStep: 0,
          maximumEvaluations: (record.variables + 1) *
            (method === "cminpack-lmdif" ? 200 : 100),
        });
        if (result.value == null) {
          throw new Error(`MGH ${method} ${index} returned no final point`);
        }
        const residualNorm = norm(problem.residual(result.value));
        const normError = Math.abs(residualNorm - reference.residualNorm);
        const normTolerance = reference.residualNorm < 1e-8
          ? 1e-7
          : Math.max(1e-9, Math.abs(reference.residualNorm) * 5e-7);
        // cminpack can return MINPACK's status 8 where its own historical
        // reference driver reports the equivalent orthogonality stop 4.
        const mappedStatus = result.backendStatus === 8 ? 4 : result.backendStatus;
        if (!Number.isFinite(residualNorm) || normError > normTolerance ||
            mappedStatus !== reference.status) {
          throw new Error(`MGH ${method} ${index} differs: ${JSON.stringify({
            record,
            reference,
            actual: { status: result.backendStatus, residualNorm },
            normError,
            normTolerance,
          })}`);
        }
        results.push({
          method,
          index,
          ...record,
          status: result.backendStatus,
          reference_status: reference.status,
          residual_norm: residualNorm,
          reference_residual_norm: reference.residualNorm,
          residual_evaluations: result.residualEvaluations,
          jacobian_evaluations: result.jacobianEvaluations,
        });
      } finally {
        problem.dispose();
      }
    }
  }

  const lifecycle = backend.inspect();
  if (lifecycle.liveAllocations !== 0 || lifecycle.liveBytes !== 0 ||
      lifecycle.activeContexts !== 0) {
    throw new Error("cminpack qualification leaked Wasm state");
  }
  return Object.freeze({ results: Object.freeze(results), lifecycle });
}
