"use strict";

function manifestBoundArtifacts(prepared, label) {
  if (!Array.isArray(prepared?.artifacts) || prepared.artifacts.length === 0) {
    throw new Error(`${label} did not return its prepared artifact specifications`);
  }
  const names = [];
  for (const specification of prepared.artifacts) {
    if (typeof specification !== "string") {
      throw new Error(`${label} returned a non-string artifact specification`);
    }
    const separator = specification.indexOf("=");
    if (separator < 1 || separator === specification.length - 1) {
      throw new Error(`${label} returned an invalid artifact specification`);
    }
    names.push(specification.slice(0, separator));
  }
  if (new Set(names).size !== names.length) {
    throw new Error(`${label} returned duplicate artifact names`);
  }
  const manifestNames = prepared.manifest?.bindings?.artifacts?.map((artifact) => artifact.name);
  if (!Array.isArray(manifestNames) ||
      JSON.stringify([...names].sort()) !== JSON.stringify([...manifestNames].sort())) {
    throw new Error(`${label} artifacts differ from its capability manifest bindings`);
  }
  return [...prepared.artifacts];
}

module.exports = { manifestBoundArtifacts };
