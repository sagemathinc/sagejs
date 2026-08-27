export {
  SageSession,
  SageSessionClosedError,
  SageSessionInterruptedError,
  SageSessionTimeoutError,
  createSage,
} from "./dist/tools/kernel";

export interface SageCompiler {
  [name: string]: unknown;
}

export function createCompiler(options?: unknown): SageCompiler;
