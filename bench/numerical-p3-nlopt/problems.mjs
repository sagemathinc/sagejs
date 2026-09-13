export const objectives = Object.freeze({
  rosenbrock: ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
  beale: ([x, y]) =>
    (1.5 - x + x * y) ** 2 +
    (2.25 - x + x * y ** 2) ** 2 +
    (2.625 - x + x * y ** 3) ** 2,
  absolute: ([x, y]) => Math.abs(x) + 2 * Math.abs(y),
  outside_box: ([x, y]) => (x - 3) ** 2 + (y + 2) ** 2,
  ill_scaled: ([x, y]) => ((x - 1e6) / 1e6) ** 2 + ((y - 1e-6) / 1e-6) ** 2,
  quadratic_2_1: ([x, y]) => (x - 2) ** 2 + (y - 1) ** 2,
  quadratic_1_1: ([x, y]) => (x - 1) ** 2 + (y - 1) ** 2,
  quadratic_2_2: ([x, y]) => (x - 2) ** 2 + (y - 2) ** 2,
  scalar_to_five: ([x]) => (x - 5) ** 2,
  scalar_to_one: ([x]) => (x - 1) ** 2,
  scalar_to_two_million_scaled: ([x]) => ((x - 2e6) / 1e6) ** 2,
  scalar_square: ([x]) => x * x,
});

export const inequalities = Object.freeze({
  sum_le_one: ([x, y]) => [x + y - 1],
  unit_disk: ([x, y]) => [x * x + y * y - 1],
  redundant_sum_le_one: ([x, y]) => [x + y - 1, 2 * x + 2 * y - 2, x + y - 1],
  x_le_tiny: ([x]) => [x - 1e-8],
  x_le_million_scaled: ([x]) => [(x - 1e6) / 1e6],
  infeasible_interval: ([x]) => [x, 1 - x],
});

export const equalities = Object.freeze({
  sum_eq_one: ([x, y]) => [x + y - 1],
});

export function optionsFromCase(record) {
  return {
    method: record.method,
    initial: record.initial,
    initialStep: record.initial_step,
    lower: record.lower,
    upper: record.upper,
    objective: objectives[record.problem],
    inequality: record.inequality == null ? undefined : inequalities[record.inequality],
    inequalityCount: record.inequality_count ?? 0,
    inequalityTolerance: new Array(record.inequality_count ?? 0).fill(
      record.feasibility_tolerance ?? 1e-8,
    ),
    equality: record.equality == null ? undefined : equalities[record.equality],
    equalityCount: record.equality_count ?? 0,
    equalityTolerance: new Array(record.equality_count ?? 0).fill(
      record.feasibility_tolerance ?? 1e-8,
    ),
    relativeParameterTolerance: 1e-9,
    absoluteParameterTolerance: new Array(record.initial.length).fill(1e-12),
    maximumEvaluations: 4000,
  };
}

export function validateCase(record, result) {
  if (!Array.isArray(result.value)) {
    return { accepted: false, reason: "no_final_point" };
  }
  const objective = objectives[record.problem](result.value);
  const inequalityValues = record.inequality == null
    ? []
    : inequalities[record.inequality](result.value);
  const equalityValues = record.equality == null
    ? []
    : equalities[record.equality](result.value);
  const maximumViolation = Math.max(
    0,
    ...inequalityValues,
    ...equalityValues.map((value) => Math.abs(value)),
  );
  if (record.expect_infeasible) {
    return {
      accepted: maximumViolation >= record.minimum_violation,
      expectedInfeasible: true,
      objective,
      maximumViolation,
      backendConverged: result.backendConverged,
    };
  }
  const pointErrors = result.value.map(
    (value, index) => Math.abs(value - record.expected[index]),
  );
  const pointAccepted = pointErrors.every(
    (error, index) => error <= record.point_tolerance[index],
  );
  const objectiveAccepted = objective <= record.objective_tolerance;
  const feasibilityAccepted = maximumViolation <= (record.feasibility_tolerance ?? 1e-7);
  return {
    accepted: pointAccepted && objectiveAccepted && feasibilityAccepted,
    pointAccepted,
    objectiveAccepted,
    feasibilityAccepted,
    objective,
    maximumViolation,
    pointErrors,
    backendConverged: result.backendConverged,
  };
}
