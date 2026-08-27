import product from "../sagejs-version.json";

export interface SagejsVersionInfo {
  readonly schema: string;
  readonly name: string;
  readonly version: string;
  readonly release_date: string;
  readonly platform: string;
}

export function releasePlatformName(value: NodeJS.Platform): string {
  switch (value) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      return value;
  }
}

export function createSagejsVersionInfo(
  platform = releasePlatformName(process.platform),
  architecture = process.arch,
): Readonly<SagejsVersionInfo> {
  if (typeof platform !== "string" || platform.length === 0) {
    throw new TypeError("Sage.js version platform must be a nonempty string");
  }
  if (typeof architecture !== "string" || architecture.length === 0) {
    throw new TypeError("Sage.js version architecture must be a nonempty string");
  }
  return Object.freeze({
    ...product,
    platform: `${platform}-${architecture}`,
  });
}

export const SAGEJS_VERSION_INFO = createSagejsVersionInfo();
