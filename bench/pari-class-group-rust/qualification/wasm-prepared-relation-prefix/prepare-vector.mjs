import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const preparedField = JSON.parse(fs.readFileSync(path.join(
  directory,
  "../row6-candidate/inputs/row6-neutral-prepared-field.json",
), "utf8"));
const request = {
  schema: "sagejs.rust-class-group/prepared-relation-prefix-request-v1",
  maximumVisitedIdeals: 1,
  maximumCandidates: 64,
  preparedField,
};
const expected = {
  schema: "sagejs.rust-class-group/prepared-relation-prefix-v1",
  status: "bounded-stage",
  stage: "prepared-cubic-relation-prefix",
  inputId: "sha256:42ecf93a56de4cc7763d33c8b422e7804582278674c1a6fef41a4799a9930bd5",
  fieldId: "row6-x3-minus-2000000000010x-plus-2000000000018",
  limits: { maximumVisitedIdeals: 1, maximumCandidates: 64 },
  relationBound: 9196,
  factorBaseIdeals: 1130,
  residentRelationRows: 204,
  missingRank: 926,
  completeRankAndSurplus: false,
  counters: {
    visitedIdeals: 1,
    cursorTrials: 66,
    primitiveNonscalarCandidates: 64,
    smoothCandidates: 1,
    appendedRelations: 1,
    positiveCacheStatuses: 1,
    randomIdeals: 0,
    randomSearchIdeals: 0,
  },
  storage: {
    relationCacheCapacity: 267,
    fullRelationCacheCapacity: 11420,
    denseRecordsBytes: 2413680,
    fullDenseRecordsBytes: 103236800,
  },
  prefixSha256: "7e4c9242d3fa92c7bc7f8fbb3e9c68cc77f66cbc5838657cf38e610c66ba22b3",
};
fs.mkdirSync(path.join(directory, "build"), { recursive: true });
fs.writeFileSync(path.join(directory, "build/row6.vector.json"), `${JSON.stringify({
  schema: "sagejs.rust-class-group-browser-vector/v1",
  id: "row6-prepared-relation-prefix",
  request,
  expected,
}, null, 2)}\n`);
