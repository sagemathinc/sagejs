import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

export type ChromiumDiscoverySource =
  | "environment"
  | "conventional-path"
  | "command";

export interface ChromiumDiscovery {
  available: boolean;
  executablePath?: string;
  source?: ChromiumDiscoverySource;
  configuredBy?: string;
  reason?: "configured-path-missing" | "not-found";
}

export interface ChromiumDiscoveryOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (filename: string) => boolean;
  commandPath?: (command: string, platform: NodeJS.Platform) => string | undefined;
}

const CONFIGURED_PATHS = [
  "SAGEJS_CHROMIUM_PATH",
  "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
  "BROWSER_PATH",
] as const;

function defaultCommandPath(
  command: string,
  platform: NodeJS.Platform,
): string | undefined {
  try {
    const utility = platform === "win32" ? "where" : "which";
    const output = execFileSync(utility, [command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}

function joinWindows(root: string | undefined, suffix: string): string | undefined {
  if (!root) return undefined;
  return `${root.replace(/[\\/]+$/, "")}\\${suffix}`;
}

function conventionalPaths(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Array<string | undefined> {
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }
  if (platform !== "win32") return [];
  const programFiles = env.PROGRAMFILES ?? env.ProgramFiles;
  const programFilesX86 =
    env["PROGRAMFILES(X86)"] ?? env["ProgramFiles(x86)"];
  const localAppData = env.LOCALAPPDATA ?? env.LocalAppData;
  return [
    joinWindows(
      localAppData,
      "Google\\Chrome\\Application\\chrome.exe",
    ),
    joinWindows(
      programFiles,
      "Google\\Chrome\\Application\\chrome.exe",
    ),
    joinWindows(
      programFilesX86,
      "Google\\Chrome\\Application\\chrome.exe",
    ),
    joinWindows(
      programFiles,
      "Microsoft\\Edge\\Application\\msedge.exe",
    ),
    joinWindows(
      programFilesX86,
      "Microsoft\\Edge\\Application\\msedge.exe",
    ),
  ];
}

function commandCandidates(platform: NodeJS.Platform): string[] {
  if (platform === "win32") {
    return ["chrome", "msedge", "chromium"];
  }
  if (platform === "darwin") {
    return ["google-chrome", "chromium", "msedge"];
  }
  return [
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "microsoft-edge",
    "microsoft-edge-stable",
  ];
}

/** Discover a locally installed browser without launching it. */
export function discoverChromium(
  options: ChromiumDiscoveryOptions = {},
): ChromiumDiscovery {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const commandPath = options.commandPath ?? defaultCommandPath;

  for (const name of CONFIGURED_PATHS) {
    const candidate = env[name];
    if (!candidate) continue;
    if (exists(candidate)) {
      return {
        available: true,
        executablePath: candidate,
        source: "environment",
        configuredBy: name,
      };
    }
    return {
      available: false,
      configuredBy: name,
      reason: "configured-path-missing",
    };
  }

  for (const candidate of conventionalPaths(platform, env)) {
    if (candidate && exists(candidate)) {
      return {
        available: true,
        executablePath: candidate,
        source: "conventional-path",
      };
    }
  }

  for (const command of commandCandidates(platform)) {
    const candidate = commandPath(command, platform);
    if (candidate && exists(candidate)) {
      return {
        available: true,
        executablePath: candidate,
        source: "command",
      };
    }
  }

  return { available: false, reason: "not-found" };
}
