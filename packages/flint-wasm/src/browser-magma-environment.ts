export function readMagmaSource(filename: string): never {
  throw new Error(
    `Magma load/attach cannot read ${filename} in the browser sandbox`,
  );
}

export function homeDirectory(): string {
  return "/";
}

export function currentWorkingDirectory(): string {
  return "/";
}
