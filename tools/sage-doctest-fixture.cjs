"use strict";

const { createHash } = require("node:crypto");

const SCHEMA = "sagejs.sage-doctests/v1";

function isEscaped(source, index) {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && source[i] === "\\"; i -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

// Find Python and Cython triple-quoted strings without parsing the surrounding
// implementation.  This deliberately recognizes strings lexically: the
// extracted corpus contains documentation semantics, never executable code.
function tripleQuotedStrings(source) {
  const blocks = [];
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const character = source[index];
    if (character === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (character === "#") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character !== "'" && character !== '"') {
      index += 1;
      continue;
    }

    const delimiter = character.repeat(3);
    if (source.slice(index, index + 3) !== delimiter) {
      const quote = character;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\n") line += 1;
        if (source[index] === quote && !isEscaped(source, index)) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    const delimiterLine = line;
    index += 3;
    const contentStart = index;
    const contentLine = line;
    while (index < source.length) {
      if (
        source.slice(index, index + 3) === delimiter &&
        !isEscaped(source, index)
      ) {
        break;
      }
      if (source[index] === "\n") line += 1;
      index += 1;
    }
    blocks.push({
      content: source.slice(contentStart, index),
      contentLine,
      delimiterLine,
    });
    if (index < source.length) index += 3;
  }

  return blocks;
}

function indentation(line) {
  return line.match(/^[ \t]*/)[0].replaceAll("\t", "        ").length;
}

function declaration(line) {
  let match = line.match(
    /^([ \t]*)(?:(?:cdef[ \t]+)?class)[ \t]+([A-Za-z_][A-Za-z0-9_]*)/,
  );
  if (match) {
    return { indent: indentation(match[1]), name: match[2] };
  }
  match = line.match(
    /^([ \t]*)(?:(?:async[ \t]+)?def|cdef|cpdef)[ \t]+(?:[^(\s]+[ \t]+)*([A-Za-z_][A-Za-z0-9_]*)[ \t]*\(/,
  );
  if (match) {
    return { indent: indentation(match[1]), name: match[2] };
  }
}

function ownerAtLine(sourceLines, lineNumber) {
  const delimiter = sourceLines[lineNumber - 1] ?? "";
  let maximumIndent = indentation(delimiter);
  const names = [];

  for (let index = lineNumber - 2; index >= 0; index -= 1) {
    const found = declaration(sourceLines[index]);
    if (!found || found.indent >= maximumIndent) continue;
    names.unshift(found.name);
    maximumIndent = found.indent;
    if (maximumIndent === 0) break;
  }
  return names.length ? names.join(".") : "<module>";
}

function exampleTags(source) {
  const tags = [];
  const patterns = [
    ["needs", /#\s*needs\s+([^\n#]+)/gi],
    ["optional", /#\s*optional\s*-\s*([^\n#]+)/gi],
    ["long time", /#\s*long time\b/gi],
    ["random", /#\s*random\b/gi],
    ["not tested", /#\s*not tested\b/gi],
    ["known bug", /#\s*known bug\b/gi],
  ];
  for (const [name, pattern] of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = match[1]?.trim();
      tags.push(value ? { name, value } : { name });
    }
  }
  return tags;
}

function extractExamples(block, sourcePath, owner) {
  const lines = block.content.split("\n");
  const examples = [];
  let index = 0;

  while (index < lines.length) {
    const prompt = lines[index].match(/^([ \t]*)sage:\s?(.*)$/);
    if (!prompt) {
      index += 1;
      continue;
    }

    const promptIndent = prompt[1];
    const line = block.contentLine + index;
    const sourceLines = [prompt[2]];
    index += 1;
    while (index < lines.length) {
      const continuation = lines[index].match(
        new RegExp(`^${promptIndent.replaceAll("\t", "\\t")}\\.\\.\\.\\.:\\s?(.*)$`),
      );
      if (!continuation) break;
      sourceLines.push(continuation[1]);
      index += 1;
    }

    const wanted = [];
    while (index < lines.length) {
      if (lines[index].match(new RegExp(`^${promptIndent}sage:\\s?`))) break;
      if (lines[index].trim() === "") {
        index += 1;
        break;
      }
      const outputLine = lines[index].startsWith(promptIndent)
        ? lines[index].slice(promptIndent.length)
        : lines[index];
      wanted.push(outputLine);
      index += 1;
    }

    const source = sourceLines.join("\n");
    examples.push({
      id: `${sourcePath}:${line}`,
      line,
      source,
      want: wanted.length ? `${wanted.join("\n")}\n` : "",
      tags: exampleTags(source),
    });
  }

  return {
    id: `${sourcePath}#${owner}@${block.delimiterLine}`,
    owner,
    line: block.delimiterLine,
    examples,
  };
}

function extractSageDoctests(source, metadata) {
  const sourcePath = metadata.path.replaceAll("\\", "/");
  const sourceLines = source.split("\n");
  const groups = [];

  for (const block of tripleQuotedStrings(source)) {
    if (!/^[ \t]*sage:\s?/m.test(block.content)) continue;
    const owner = ownerAtLine(sourceLines, block.delimiterLine);
    const group = extractExamples(block, sourcePath, owner);
    if (group.examples.length) groups.push(group);
  }

  return {
    schema: SCHEMA,
    generatedBy: "scripts/extract-sage-doctests.cjs",
    source: {
      repository: metadata.repository,
      revision: metadata.revision,
      path: sourcePath,
      sha256: createHash("sha256").update(source).digest("hex"),
      license: metadata.license ?? "unknown",
    },
    summary: {
      groups: groups.length,
      examples: groups.reduce(
        (total, group) => total + group.examples.length,
        0,
      ),
    },
    groups,
  };
}

module.exports = {
  SCHEMA,
  exampleTags,
  extractSageDoctests,
  tripleQuotedStrings,
};
