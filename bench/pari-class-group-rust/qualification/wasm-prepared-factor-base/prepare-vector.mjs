import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const request = JSON.parse(fs.readFileSync(path.join(
  directory,
  "../row6-candidate/inputs/row6-neutral-prepared-field.json",
), "utf8"));
const expected = {
  schema: "sagejs.rust-class-group/prepared-factor-base-v1",
  status: "bounded-stage",
  stage: "prepared-maximal-cubic-factor-base",
  inputId: "sha256:42ecf93a56de4cc7763d33c8b422e7804582278674c1a6fef41a4799a9930bd5",
  fieldId: "row6-x3-minus-2000000000010x-plus-2000000000018",
  equationOrderIndex: "3",
  relationBound: 9196,
  checkingBound: 9196,
  rationalPrimeCount: 740,
  idealCount: 1130,
  completeGroupCount: 203,
  descriptorSha256: "dc63c73dbc419b05a4a1b907cdd8a60f70247f74a0d477880eb25d19c4356306",
};
fs.mkdirSync(path.join(directory, "build"), { recursive: true });
fs.writeFileSync(path.join(directory, "build/row6.vector.json"), `${JSON.stringify({
  schema: "sagejs.rust-class-group-browser-vector/v1",
  id: "row6-prepared-maximal-factor-base",
  request,
  expected,
}, null, 2)}\n`);

