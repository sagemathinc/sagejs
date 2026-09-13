import {readFile} from "node:fs/promises";

export async function* numberFieldGeometryBatches() {
  for (const name of ["ideals", "geometry", "decomposition"]) {
    yield {label: name, source: await readFile(new URL(
      `../../../test/number-field-${name}.py`, import.meta.url), "utf8")};
  }
  const factorSource = await readFile(new URL("../../../test/number-field-factorization.py", import.meta.url), "utf8");
  for (let index = 0; index < 5; index++) {
    yield {label: `factorization-${index}`, source: `_number_field_factor_case = ${index}\n` + factorSource};
  }
  const fixture = JSON.parse(await readFile(new URL(
    "../../../test/fixtures/number-field-geometry-sage.json", import.meta.url), "utf8"));
  const source = await readFile(new URL("../../../test/number-field-oracles.py", import.meta.url), "utf8");
  for (let offset = 0; offset < fixture.cases.length; offset += 15) {
    yield {label: `independent-oracles-${offset}`, source:
      "import json\n_number_field_oracle_fixture = json.loads(" +
      JSON.stringify(JSON.stringify({...fixture, cases: fixture.cases.slice(offset, offset + 15)})) +
      ")\n" + source};
  }
}
