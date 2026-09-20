#!/usr/bin/env node

const [arm, field, round, mode = "ok"] = process.argv.slice(2);
if (mode === "fail" && arm === "b" && round === "3") {
  console.error("intentional adapter failure");
  process.exit(17);
}
const invariants = field === "noncyclic" ? ["2", "2"] : ["3"];
console.log(JSON.stringify({
  schema: "fake-class-group-result-v1",
  timing: { nanoseconds: String(1000 + Number(round) + (arm === "b" ? 10 : 0)) },
  answer: {
    classNumber: field === "noncyclic" ? "4" : "3",
    invariantFactors: mode === "mismatch" && arm === "b" ? ["9"] : invariants,
  },
}));
