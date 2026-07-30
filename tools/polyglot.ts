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
    /^[\t ]*%%([A-Za-z]+)[\t ]*(?:(\r?\n)|$)/,
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
