"use strict";

/**
 * Analyze the independently parsed Python files which form the generated
 * Sage.js base library.
 *
 * Each file is a real lexical module.  A name owned by exactly one module is
 * also published through the historical shared compiler facade so existing
 * generated code can continue to use its direct binding.  Repeated private
 * implementation names remain module-local; repeated public names are almost
 * certainly an architectural mistake and fail the build.
 */
function analyzeBaselibModules(modules) {
  const owners = new Map();
  for (const module of modules) {
    for (const name of module.exports) {
      const entries = owners.get(name) ?? [];
      entries.push(module);
      owners.set(name, entries);
    }
  }

  const duplicatePrivate = new Map();
  const duplicatePublic = new Map();
  const facadeNames = [];
  for (const [name, entries] of owners) {
    if (entries.length === 1) {
      facadeNames.push(name);
    } else if (name.startsWith("_") || name.startsWith("ρσ_")) {
      duplicatePrivate.set(name, entries.map((entry) => entry.filename));
    } else {
      duplicatePublic.set(name, entries.map((entry) => entry.filename));
    }
  }

  if (duplicatePublic.size > 0) {
    const details = [...duplicatePublic]
      .map(([name, filenames]) => `${name}: ${filenames.join(", ")}`)
      .join("; ");
    throw new Error(`duplicate public baselib symbols: ${details}`);
  }

  // A module which owns one of the repeated private names resolves it to its
  // own lexical binding.  A third module referring to that name would have no
  // principled owner, so reject it instead of depending on concatenation
  // order.
  for (const module of modules) {
    const ownExports = new Set(module.exports);
    for (const name of module.references) {
      if (duplicatePrivate.has(name) && !ownExports.has(name)) {
        throw new Error(
          `ambiguous private baselib reference ${module.filename}:${name}; ` +
            `owned by ${duplicatePrivate.get(name).join(", ")}`,
        );
      }
    }
  }

  facadeNames.sort();
  return { owners, facadeNames, duplicatePrivate };
}

function moduleId(filename) {
  if (!filename.endsWith(".py")) {
    throw new Error(`baselib module is not Python source: ${filename}`);
  }
  return `sagejs._baselib.${filename.slice(0, -3)}`;
}

module.exports = { analyzeBaselibModules, moduleId };
