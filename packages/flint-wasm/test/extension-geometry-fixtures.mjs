import {readFile} from "node:fs/promises";

// Keep individual Web Worker evaluations bounded without dropping any native
// fixture assertions or increasing the mathematical algorithms' own budgets.
export async function* extensionGeometryBatches() {
  for (const [name, fields, stages] of [
    ["extension-ideals", [4, 8, 9, 27, 65519**2], [null]],
    ["extension-geometry", [4, 9, 27], [null]],
    ["extension-zero-dimensional", [4, 9], ["frobenius1", "frobenius2", "components", "nonsplit", "separator"]],
  ]) {
    const source = await readFile(new URL(`../../../test/${name}.py`, import.meta.url), "utf8");
    for (const field of fields) {
      for (const stage of stages) {
        // Four individually bounded public calls exceed one worker evaluation
        // when combined for the degree-nine nonreduced GF(9) quotient.
        const operations = field === 9 && stage === "frobenius2"
          ? ["radical", "is_radical", "primary", "associated"] : [null];
        for (const operation of operations) {
          yield {
            label: `${name}/GF(${field})${stage ? `/${stage}` : ""}${operation ? `/${operation}` : ""}`,
            source: `_extension_field_selection = ${field}\n` +
              `_extension_zero_stage = ${stage ? JSON.stringify(stage) : "None"}\n` +
              `_extension_zero_operation = ${operation ? JSON.stringify(operation) : "None"}\n` + source,
          };
        }
      }
    }
  }
  const fixtures = JSON.parse(await readFile(new URL(
    "../../../test/fixtures/extension-geometry-sage-oracles-v1.json", import.meta.url), "utf8"));
  const source = await readFile(new URL("../../../test/extension-geometry-oracles.py", import.meta.url), "utf8");
  for (const fixture of fixtures.cases) {
    for (const stage of ["radical", "joined", "nonsplit", "points"]) {
      yield {
        label: `independent-Sage-geometry/GF(${fixture.characteristic**2})/${stage}`,
        source: "import json\n_extension_geometry_cases = json.loads(" +
          JSON.stringify(JSON.stringify([fixture])) + ")\n" +
          `_extension_geometry_oracle_stage = ${JSON.stringify(stage)}\n` + source,
      };
    }
  }
}
