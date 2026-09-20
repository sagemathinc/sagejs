import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const cases = JSON.parse(fs.readFileSync(path.join(here, "cases.json")));
const vectorDirectory = path.join(here, "vectors");
fs.mkdirSync(vectorDirectory, { recursive: true });

for (const entry of cases.cases) {
  const preparedField = JSON.parse(fs.readFileSync(path.join(root, entry.input)));
  if (preparedField.fieldId !== entry.id || preparedField.containsOracleAnswers !== false) {
    throw new Error(`invalid answer-free neutral input for ${entry.id}`);
  }
  for (const stage of ["factor-base", "relation-prefix"]) {
    const native = JSON.parse(
      fs.readFileSync(path.join(here, `${entry.id}.${stage}.native-receipt.json`)),
    );
    const request = stage === "factor-base"
      ? preparedField
      : {
          schema: "sagejs.rust-class-group/prepared-relation-prefix-request-v1",
          maximumVisitedIdeals: 1,
          maximumCandidates: 64,
          preparedField,
        };
    const vector = {
      schema: "sagejs.rust-class-group-browser-vector/v1",
      id: `${entry.id}-${stage}`,
      request,
      expected: native.result,
    };
    fs.writeFileSync(
      path.join(vectorDirectory, `${entry.id}.${stage}.vector.json`),
      `${JSON.stringify(vector, null, 2)}\n`,
    );
  }
}
