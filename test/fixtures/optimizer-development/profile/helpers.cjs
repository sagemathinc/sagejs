"use strict";

const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "../../../..");
const {
  makeProfileFunctionIdentity,
  makeProfileRegionIdentity,
  makeProfileSourceIdentity,
  profileSemanticFingerprint,
  profileSha256,
} = require(resolve(ROOT, "dist/tools/python/optimizer/profile-identity.js"));

function positionAt(text, offset) {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length, column: lines.at(-1).length, offset };
}

function candidate(span) {
  const loop = span.category === "loop";
  return {
    category: span.category,
    identityId: span.identity.id,
    functionId: loop ? span.identity.functionId : span.identity.id,
    regionId: loop ? span.identity.id : null,
  };
}

function segmentsFor(spans) {
  const points = new Map();
  for (const span of spans) {
    points.set(span.generated.start.offset, span.generated.start);
    points.set(span.generated.end.offset, span.generated.end);
  }
  const offsets = [...points.keys()].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index + 1 < offsets.length; index += 1) {
    const start = offsets[index];
    const end = offsets[index + 1];
    const active = spans.filter(
      (span) => span.generated.start.offset <= start && span.generated.end.offset >= end,
    );
    if (active.length === 0 || start === end) continue;
    const width = Math.min(
      ...active.map((span) => span.generated.end.offset - span.generated.start.offset),
    );
    const candidates = active
      .filter((span) => span.generated.end.offset - span.generated.start.offset === width)
      .map(candidate)
      .sort((left, right) => left.identityId.localeCompare(right.identityId));
    segments.push({
      generated: { start: points.get(start), end: points.get(end) },
      mapping: {
        status: candidates.length === 1 ? "attributed" : "ambiguous",
        candidates,
      },
    });
  }
  return segments;
}

function makeMap({ javascript, url, functions, loops = [], duplicateLoop = false }) {
  const pythonSource = functions
    .map((item) => `def ${item.name}():\n    pass`)
    .join("\n");
  const sourceIdentity = makeProfileSourceIdentity(
    pythonSource,
    "test/fixtures/optimizer-development/profile/synthetic.py",
    ROOT,
    "python",
  );
  const functionSpans = functions.map((item, ordinal) => {
    const identity = makeProfileFunctionIdentity({
      sourceUnitId: sourceIdentity.id,
      qualifiedName: item.name,
      kind: "function",
      semanticFingerprint: profileSemanticFingerprint({ function: item.name }),
      range: {
        startLine: ordinal * 2 + 1,
        startColumn: 0,
        endLine: ordinal * 2 + 2,
        endColumn: 8,
      },
      ordinal: 0,
    });
    return {
      category: "function",
      identity,
      optimizerRegionId: null,
      generated: {
        start: positionAt(javascript, item.start),
        end: positionAt(javascript, item.end),
      },
    };
  });
  const byName = new Map(functionSpans.map((span, index) => [functions[index].name, span]));
  const loopSpans = loops.map((item, ordinal) => {
    const parent = byName.get(item.functionName);
    if (!parent) throw new Error(`missing parent function ${item.functionName}`);
    return {
      category: "loop",
      identity: makeProfileRegionIdentity({
        functionId: parent.identity.id,
        kind: item.kind ?? "test.hot-loop",
        semanticFingerprint: profileSemanticFingerprint({ loop: item.name }),
        range: {
          startLine: ordinal + 1,
          startColumn: 0,
          endLine: ordinal + 1,
          endColumn: 1,
        },
        ordinal: 0,
      }),
      optimizerRegionId: item.optimizerRegionId ?? `test.${item.name}.v1`,
      generated: {
        start: positionAt(javascript, item.start),
        end: positionAt(javascript, item.end),
      },
    };
  });
  if (duplicateLoop && loopSpans.length) {
    const original = loopSpans[0];
    loopSpans.push({
      ...original,
      identity: makeProfileRegionIdentity({
        functionId: original.identity.functionId,
        kind: "test.ambiguous-loop",
        semanticFingerprint: profileSemanticFingerprint({ loop: "ambiguous-copy" }),
        range: original.identity.range,
        ordinal: 1,
      }),
      optimizerRegionId: "test.ambiguous-copy.v1",
    });
  }
  const spans = [...functionSpans, ...loopSpans].sort(
    (left, right) => left.generated.start.offset - right.generated.start.offset ||
      right.generated.end.offset - left.generated.end.offset,
  );
  return {
    schema: "sagejs.optimizer-profile-map/v1",
    authority: "compiler-emitted-content-authenticated",
    compilerSchema: "test-synthetic/v1",
    source: { identity: sourceIdentity, bytes: Buffer.byteLength(pythonSource) },
    generated: {
      url,
      sha256: profileSha256(javascript),
      bytes: Buffer.byteLength(javascript),
    },
    spans,
    segments: segmentsFor(spans),
  };
}

function hotColdFixture(iterations = 40_000_000, url = "sagejs-profile:///hot-cold.js") {
  const javascript = [
    "function hot(iterations) {",
    "  let value = 0;",
    "  for (let index = 0; index < iterations; index += 1) {",
    "    value = Math.imul(value + index, 1664525) | 0;",
    "  }",
    "  return value;",
    "}",
    "function cold() {",
    "  return 17;",
    "}",
    `hot(${iterations});`,
    "cold();",
  ].join("\n");
  const hotStart = javascript.indexOf("function hot");
  const hotEnd = javascript.indexOf("\nfunction cold");
  const coldStart = javascript.indexOf("function cold");
  const coldEnd = javascript.indexOf("\nhot(", coldStart);
  const loopStart = javascript.indexOf("  for (");
  const loopEnd = javascript.indexOf("\n  return value", loopStart);
  return {
    javascript,
    url,
    map: makeMap({
      javascript,
      url,
      functions: [
        { name: "hot", start: hotStart, end: hotEnd },
        { name: "cold", start: coldStart, end: coldEnd },
      ],
      loops: [{ name: "hot-loop", functionName: "hot", start: loopStart, end: loopEnd }],
    }),
  };
}

module.exports = { ROOT, hotColdFixture, makeMap, positionAt };
