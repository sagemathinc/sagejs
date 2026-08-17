"use strict";

const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..");

const sourcePath = resolve(
  process.argv[2] || process.env.ECDATA_ALLCURVES || ""
);
const mwrank = process.env.ECLIB_MWRANK;
const outputPath = resolve(
  process.argv[3] || resolve(packageRoot, "test", "eclib-rank-oracle.json")
);
const caseCount = 1024;

if (!process.argv[2] && !process.env.ECDATA_ALLCURVES) {
  throw new Error(
    "pass allcurves.00000-09999 or set ECDATA_ALLCURVES"
  );
}
if (!mwrank) throw new Error("set ECLIB_MWRANK to an upstream executable");

function upstreamEnvironment() {
  const environment = { ...process.env };
  if (process.env.ECLIB_LIBRARY_PATH) {
    environment.LD_LIBRARY_PATH = process.env.ECLIB_LIBRARY_PATH;
    environment.DYLD_LIBRARY_PATH = process.env.ECLIB_LIBRARY_PATH;
  }
  return environment;
}

function runUpstream(arguments_, input = undefined) {
  const result = spawnSync(mwrank, arguments_, {
    encoding: "utf8",
    env: upstreamEnvironment(),
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error("upstream mwrank exited with " + result.status);
  }
  return result.stdout.trim();
}

const source = readFileSync(sourcePath, "utf8");
const leaders = [];
for (const [lineIndex, line] of source.trim().split(/\r?\n/).entries()) {
  const match = line.match(
    /^(\d+) ([a-z]+) (\d+) (\[[^\]]+\]) (\d+) (\d+)$/
  );
  if (!match) throw new Error("invalid allcurves line " + (lineIndex + 1));
  if (match[3] !== "1") continue;
  leaders.push({
    label: match[1] + match[2] + match[3],
    ainvs: JSON.parse(match[4]),
    rank: Number(match[5]),
  });
}
if (leaders.length < caseCount) {
  throw new Error("only " + leaders.length + " isogeny-class leaders found");
}

// Keep the committed suite fast enough for routine CI while covering more
// than one thousand distinct isogeny classes.  Conductor order makes this
// selection simple, reproducible, and independently inspectable.
const selected = leaders.slice(0, caseCount);

const input = selected.map(({ ainvs }) => JSON.stringify(ainvs)).join("\n") + "\n";
const stdout = runUpstream(["-q", "-v", "1", "-S", "0"], input);
const markers = [...stdout.matchAll(/^Curve (\[[^\n]+?\])\s*:/gm)];
if (markers.length !== selected.length) {
  throw new Error(
    "upstream emitted " + markers.length + " curves for " + selected.length + " inputs"
  );
}

const cases = selected.map((entry, index) => {
  const start = markers[index].index;
  const end = index + 1 < markers.length ? markers[index + 1].index : stdout.length;
  const section = stdout.slice(start, end);
  const exact = section.match(/\bRank = (\d+)\b/);
  const interval = section.match(/(\d+) <= rank <= (\d+)/);
  const selmer = section.match(/Rank of S\^2\(E\)\s*=\s*(\d+)/);
  if ((!exact && !interval) || !selmer) {
    throw new Error("could not parse upstream result for " + entry.label);
  }
  const lower = exact ? Number(exact[1]) : Number(interval[1]);
  const upper = exact ? lower : Number(interval[2]);
  if (lower !== entry.rank || upper !== entry.rank) {
    throw new Error(
      entry.label + " ecdata rank " + entry.rank +
      " disagrees with upstream interval " + lower + "/" + upper
    );
  }
  const foundPoints = [...section.matchAll(
    /^Generator \d+ is \[(-?\d+):(-?\d+):(-?\d+)\]/gm
  )].map((match) => match.slice(1).map(String));
  if (foundPoints.length !== lower) {
    throw new Error(
      entry.label + " emitted " + foundPoints.length +
      " generators for rank " + lower
    );
  }
  return {
    label: entry.label,
    ainvs: entry.ainvs.map(String),
    rankLowerBound: lower,
    rankUpperBound: upper,
    twoSelmerRank: Number(selmer[1]),
    foundPoints,
  };
});

const rankDistribution = {};
for (const item of cases) {
  const rank = String(item.rankLowerBound);
  rankDistribution[rank] = (rankDistribution[rank] || 0) + 1;
}
const version = runUpstream(["-V"]);
const document = {
  schema: 1,
  provenance: {
    ecdataRepository: "https://github.com/JohnCremona/ecdata",
    ecdataRevision: "25cec5ecfec8b9f016eb1631ac633194c2bed39f",
    ecdataFile: "allcurves/allcurves.00000-09999",
    ecdataLicense: "Artistic-2.0",
    ecdataSha256: createHash("sha256").update(source).digest("hex"),
    eclibRepository: "https://github.com/JohnCremona/eclib",
    mwrankVersion: version,
    mwrankArguments: ["-q", "-v", "1", "-S", "0"],
  },
  selection: {
    description:
      "the first 1024 curve-1 isogeny-class leaders in conductor order",
    sourceLeaders: leaders.length,
    cases: cases.length,
    rankDistribution,
  },
  cases,
};
writeFileSync(outputPath, JSON.stringify(document, null, 2) + "\n");
process.stdout.write(
  "Wrote " + cases.length + " upstream differential cases to " + outputPath + "\n"
);
