import { createMagmaFrontend } from "../magma/frontend";
import { createMacaulay2Frontend } from "../macaulay2/frontend";
import { createMapleFrontend } from "../maple/frontend";
import { createMatlabFrontend } from "../matlab/frontend";
import { createWolframFrontend } from "../wolfram/frontend";
import {
  ForeignFrontend,
  ForeignLanguage,
  ForeignSyntaxError,
} from "./types";

export type { ForeignFrontend, ForeignLanguage } from "./types";

export interface LanguageFlags {
  magma?: boolean;
  macaulay2?: boolean;
  m2?: boolean;
  maple?: boolean;
  matlab?: boolean;
  wolfram?: boolean;
  mathematica?: boolean;
}

export function selectedForeignLanguage(
  flags: LanguageFlags,
): ForeignLanguage | undefined {
  const selected: ForeignLanguage[] = [];
  if (flags.magma) selected.push("magma");
  if (flags.macaulay2 || flags.m2) selected.push("macaulay2");
  if (flags.maple) selected.push("maple");
  if (flags.matlab) selected.push("matlab");
  if (flags.wolfram || flags.mathematica) selected.push("wolfram");
  if (selected.length > 1) {
    throw new Error(
      `choose only one foreign language frontend: ${
        selected.join(", ")
      }`,
    );
  }
  return selected[0];
}

export function createForeignFrontend(
  language: ForeignLanguage,
): Promise<ForeignFrontend> {
  switch (language) {
    case "magma":
      return createMagmaFrontend();
    case "macaulay2":
      return createMacaulay2Frontend();
    case "maple":
      return createMapleFrontend();
    case "matlab":
      return createMatlabFrontend();
    case "wolfram":
      return createWolframFrontend();
  }
}

export function isForeignSyntaxError(
  error: unknown,
): error is ForeignSyntaxError {
  return error instanceof SyntaxError &&
    typeof (error as Partial<ForeignSyntaxError>).incomplete === "boolean";
}

export function foreignPrompt(language: ForeignLanguage): string {
  return language === "wolfram" ? "wolfram> " : `${language}> `;
}
