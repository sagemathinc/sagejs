import type { ForeignLanguage } from "./foreign";
import type { SageLanguageMode } from "./kernel-evaluator";

export type SageSourceLanguage = SageLanguageMode | ForeignLanguage;

export interface PolyglotCell {
  language: SageSourceLanguage;
  source: string;
  /** Number of code points removed before the executable source. */
  cursorOffset: number;
  hasMagic: boolean;
}

const LANGUAGE_ALIASES: Readonly<Record<string, SageSourceLanguage>> = {
  sage: "sage",
  python: "python",
  magma: "magma",
  macaulay2: "macaulay2",
  m2: "macaulay2",
  matlab: "matlab",
  maple: "maple",
  wolfram: "wolfram",
  mathematica: "wolfram",
};

export function isSageSourceLanguage(
  value: unknown,
): value is SageSourceLanguage {
  return typeof value === "string" &&
    Object.values(LANGUAGE_ALIASES).includes(value as SageSourceLanguage);
}

/**
 * Select a frontend from a Jupyter-style cell magic.
 *
 * One leading newline replaces the magic so parser line numbers continue to
 * refer to the same line numbers users see in their notebook.
 */
export function parsePolyglotCell(
  source: string,
  defaultLanguage: SageSourceLanguage = "sage",
): PolyglotCell {
  const match = source.match(
    /^[\t ]*%%([A-Za-z][A-Za-z0-9]*)[\t ]*(?:(\r?\n)|$)/,
  );
  if (!match) {
    return {
      language: defaultLanguage,
      source,
      cursorOffset: 0,
      hasMagic: false,
    };
  }
  const requested = match[1].toLowerCase();
  const language = LANGUAGE_ALIASES[requested];
  if (!language) {
    throw new SyntaxError(
      `unknown Sage.js cell language %%${requested}; expected ${
        Object.keys(LANGUAGE_ALIASES).map((name) => `%%${name}`).join(", ")
      }`,
    );
  }
  const replacement = match[2] ? "\n" : "";
  return {
    language,
    source: replacement + source.slice(match[0].length),
    cursorOffset: Array.from(match[0]).length -
      Array.from(replacement).length,
    hasMagic: true,
  };
}

/**
 * Treat a submitted notebook cell as a complete source unit.
 *
 * Magma and Maple require statement terminators in source files, but a user
 * has already terminated the input by submitting the cell. Add a final
 * semicolon on their behalf while preserving an explicit semicolon or Maple
 * colon (which carries output-suppression semantics).
 */
export function prepareSubmittedPolyglotCell(
  cell: PolyglotCell,
): PolyglotCell {
  if (cell.language !== "magma" && cell.language !== "maple") return cell;
  const source = cell.source.trimEnd();
  if (
    !source ||
    source.endsWith(";") ||
    (cell.language === "maple" && source.endsWith(":"))
  ) {
    return cell;
  }
  return {
    ...cell,
    source: `${cell.source}\n;`,
  };
}

/**
 * Support Sage/IPython's ``expression?`` inspection shorthand.
 *
 * Keep this deliberately conservative: only a final dotted identifier is
 * rewritten, so the compiler's existing uses of ``?`` remain untouched.
 */
export function rewriteQuestionMarkHelp(
  source: string,
  language: SageSourceLanguage,
): string {
  if (language !== "sage" && language !== "python") return source;
  const match = source.match(
    /(^|\n)([ \t]*)([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\?\??[ \t]*$/,
  );
  if (!match || match.index === undefined) return source;
  const start = match.index + match[1].length;
  const replacement = `${match[2]}help(${match[3]})`;
  return source.slice(0, start) + replacement;
}
