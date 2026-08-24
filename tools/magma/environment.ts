import { readFileSync } from "node:fs";
import { homedir } from "node:os";

export function readMagmaSource(filename: string): string {
  return readFileSync(filename, "utf8");
}

export function homeDirectory(): string {
  return homedir();
}

export function currentWorkingDirectory(): string {
  return process.cwd();
}
