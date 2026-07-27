import { readFileSync } from "fs";
import { dirname, resolve } from "path";

const HOME =
  process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"] ?? "/tmp";

function expandUser(filename: string): string {
  return filename.replace(/^~/, HOME);
}

export function parseLoadDirective(
  source: string,
  baseDirectory = process.cwd(),
): { attach: boolean; filename: string } | undefined {
  const stripped = source.trim();
  let command: string | undefined;
  let argument: string | undefined;

  const bare = stripped.match(/^(load|attach)\s+(.+)$/);
  if (bare) {
    command = bare[1];
    argument = bare[2];
  } else {
    const called = stripped.match(
      /^(load|attach)\s*\(\s*(['"])(.*?)\2\s*\)$/,
    );
    if (called) {
      command = called[1];
      argument = called[3];
    }
  }
  if (!command || argument == null) return;

  let filename = argument.trim();
  if (
    filename.length >= 2 &&
    ((filename.startsWith('"') && filename.endsWith('"')) ||
      (filename.startsWith("'") && filename.endsWith("'")))
  ) {
    filename = filename.slice(1, -1);
  }
  return {
    attach: command === "attach",
    filename: resolve(baseDirectory, expandUser(filename)),
  };
}

export function expandSageLoads(
  source: string,
  filename: string,
  activeFiles = new Set<string>(),
): string {
  const absoluteFilename = resolve(filename);
  if (activeFiles.has(absoluteFilename)) {
    throw new Error(`recursive Sage load detected: ${absoluteFilename}`);
  }
  activeFiles.add(absoluteFilename);
  try {
    const baseDirectory = dirname(absoluteFilename);
    return source
      .split("\n")
      .map((line) => {
        // Indented directives have runtime semantics in Sage. Only expand
        // top-level directives during compilation.
        if (/^\s/.test(line)) return line;
        const directive = parseLoadDirective(line, baseDirectory);
        if (!directive) return line;
        const loaded = readFileSync(directive.filename, "utf-8");
        return expandSageLoads(loaded, directive.filename, activeFiles);
      })
      .join("\n");
  } finally {
    activeFiles.delete(absoluteFilename);
  }
}
