/** Install platform-independent Python wheels for the Sage.js runtime. */

import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join, posix } from "path";
import { unzipSync } from "fflate";
import { sitePackagesDirectory } from "./utils";

type PypiFile = {
  filename: string;
  packagetype: string;
  url: string;
  digests?: { sha256?: string };
  yanked?: boolean;
};

type PypiResponse = {
  info: {
    name: string;
    version: string;
    requires_dist?: string[] | null;
  };
  urls: PypiFile[];
};

type InstallOptions = {
  target: string;
  indexUrl: string;
  dependencies: boolean;
  installed: Set<string>;
};

function normalizedName(name: string): string {
  return name.toLowerCase().replaceAll(/[_.-]+/g, "-");
}

function parseRequirement(requirement: string): {
  name: string;
  version?: string;
  marker?: string;
} {
  const [requirementText, marker] = requirement.split(/\s*;\s*/, 2);
  const match = requirementText.trim().match(
    /^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(?:\(\s*)?(?:==\s*([^,\s)]+))?/,
  );
  if (!match) throw new Error(`unsupported requirement ${JSON.stringify(requirement)}`);
  return { name: match[1], version: match[2], marker };
}

function versionPair(value: string): [number, number] {
  const match = value.match(/^(\d+)(?:\.(\d+))?/);
  return [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0)];
}

function compareVersion(left: string, operator: string, right: string): boolean {
  const a = versionPair(left);
  const b = versionPair(right);
  const order = a[0] - b[0] || a[1] - b[1];
  if (operator === "==") return order === 0;
  if (operator === "!=") return order !== 0;
  if (operator === ">=") return order >= 0;
  if (operator === "<=") return order <= 0;
  if (operator === ">") return order > 0;
  if (operator === "<") return order < 0;
  return true;
}

/** Evaluate the common environment markers without executing package text. */
function markerApplies(marker?: string): boolean {
  if (!marker) return true;
  if (/\bextra\s*(?:==|!=|in|not in)/.test(marker)) return false;
  const clauses = marker.split(/\s+and\s+/i);
  for (const clause of clauses) {
    const version = clause.match(
      /\bpython_(?:full_)?version\s*(==|!=|>=|<=|>|<)\s*['"]([^'"]+)['"]/,
    );
    if (version && !compareVersion("3.14", version[1], version[2])) return false;
    const implementation = clause.match(
      /\b(?:implementation_name|platform_python_implementation)\s*(==|!=)\s*['"]([^'"]+)['"]/,
    );
    if (implementation) {
      const expected = implementation[2].toLowerCase();
      const equal = expected === "sagejs";
      if ((implementation[1] === "==") !== equal) return false;
    }
    const sysPlatform = clause.match(
      /\bsys_platform\s*(==|!=)\s*['"]([^'"]+)['"]/,
    );
    if (sysPlatform) {
      const actual = process.platform === "win32" ? "win32" :
        process.platform === "darwin" ? "darwin" : "linux";
      const equal = actual === sysPlatform[2];
      if ((sysPlatform[1] === "==") !== equal) return false;
    }
  }
  return true;
}

function wheelPythonTag(filename: string): string | undefined {
  return filename.match(/-([^-]+)-none-any\.whl$/i)?.[1];
}

function compatibleWheel(files: PypiFile[]): PypiFile {
  const candidates = files.filter((file) => {
    const tag = wheelPythonTag(file.filename);
    if (file.packagetype !== "bdist_wheel" || file.yanked || !tag) return false;
    return tag.split(".").some((value) => value === "py3" || value === "py2.py3");
  });
  candidates.sort((left, right) => left.filename.localeCompare(right.filename));
  if (!candidates.length) {
    throw new Error(
      "no compatible pure-Python wheel (py3-none-any) is published",
    );
  }
  return candidates[0];
}

function safeWheelPath(name: string): string {
  const normalized = name.replaceAll("\\", "/");
  if (
    normalized.includes("\0") || normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized)
  ) throw new Error(`unsafe wheel member ${JSON.stringify(name)}`);
  const cleaned = posix.normalize(normalized);
  if (cleaned === ".." || cleaned.startsWith("../")) {
    throw new Error(`unsafe wheel member ${JSON.stringify(name)}`);
  }
  const purelib = cleaned.match(/^[^/]+\.data\/purelib\/(.+)$/);
  return purelib ? purelib[1] : cleaned;
}

function extractWheel(data: Uint8Array, target: string): string[] {
  const archive = unzipSync(data);
  const written: string[] = [];
  mkdirSync(target, { recursive: true });
  for (const [member, contents] of Object.entries(archive)) {
    if (member.endsWith("/")) continue;
    const relative = safeWheelPath(member);
    // Wheel scripts are wrappers for CPython and are not meaningful here.
    if (/^[^/]+\.data\/(?:scripts|headers)\//.test(relative)) continue;
    const destination = join(target, ...relative.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
    written.push(relative);
  }
  return written;
}

async function pypiMetadata(
  requirement: ReturnType<typeof parseRequirement>,
  indexUrl: string,
): Promise<PypiResponse> {
  const suffix = requirement.version
    ? `${encodeURIComponent(requirement.name)}/${encodeURIComponent(requirement.version)}`
    : encodeURIComponent(requirement.name);
  const response = await fetch(`${indexUrl.replace(/\/$/, "")}/${suffix}/json`);
  if (!response.ok) {
    throw new Error(`package metadata request failed: HTTP ${response.status}`);
  }
  return await response.json() as PypiResponse;
}

async function installRequirement(text: string, options: InstallOptions): Promise<void> {
  const requirement = parseRequirement(text);
  if (!markerApplies(requirement.marker)) return;
  const key = normalizedName(requirement.name);
  if (options.installed.has(key)) return;
  options.installed.add(key);

  const metadata = await pypiMetadata(requirement, options.indexUrl);
  const wheel = compatibleWheel(metadata.urls);
  process.stdout.write(`Collecting ${metadata.info.name}==${metadata.info.version}\n`);
  const response = await fetch(wheel.url);
  if (!response.ok) throw new Error(`wheel download failed: HTTP ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  const expected = wheel.digests?.sha256;
  const actual = createHash("sha256").update(data).digest("hex");
  if (expected && actual !== expected) {
    throw new Error(`SHA-256 mismatch for ${wheel.filename}`);
  }

  if (options.dependencies) {
    for (const dependency of metadata.info.requires_dist ?? []) {
      if (markerApplies(parseRequirement(dependency).marker)) {
        await installRequirement(dependency, options);
      }
    }
  }
  const files = extractWheel(data, options.target);
  const manifestDir = join(options.target, ".sagejs-installed");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    join(manifestDir, `${key}.json`),
    JSON.stringify({
      name: metadata.info.name,
      version: metadata.info.version,
      wheel: wheel.filename,
      sha256: actual,
      files,
    }, null, 2) + "\n",
  );
  process.stdout.write(`Installed ${metadata.info.name}==${metadata.info.version}\n`);
}

function listInstalled(target: string): void {
  const directory = join(target, ".sagejs-installed");
  if (!existsSync(directory)) return;
  for (const filename of readdirSync(directory).sort()) {
    if (!filename.endsWith(".json")) continue;
    const value = JSON.parse(readFileSync(join(directory, filename), "utf8"));
    process.stdout.write(`${value.name} ${value.version}\n`);
  }
}

function uninstall(name: string, target: string): void {
  const key = normalizedName(name);
  const manifest = join(target, ".sagejs-installed", `${key}.json`);
  if (!existsSync(manifest)) throw new Error(`${name} is not installed by Sage.js`);
  const value = JSON.parse(readFileSync(manifest, "utf8"));
  for (const relative of value.files ?? []) {
    rmSync(join(target, ...safeWheelPath(relative).split("/")), { force: true });
  }
  rmSync(manifest, { force: true });
  process.stdout.write(`Uninstalled ${value.name}==${value.version}\n`);
}

export async function runPackageCli(argv: {
  files: string[];
  target?: string;
  index_url?: string;
  no_deps?: boolean;
}): Promise<void> {
  const [command, ...requirements] = argv.files;
  const target = argv.target || sitePackagesDirectory();
  if (command === "path") {
    process.stdout.write(target + "\n");
    return;
  }
  if (command === "list") {
    listInstalled(target);
    return;
  }
  if (command === "uninstall") {
    if (!requirements.length) throw new Error("pip uninstall requires a package");
    for (const name of requirements) uninstall(name, target);
    return;
  }
  if (command !== "install" || !requirements.length) {
    throw new Error("usage: sagejs pip <install|uninstall|list|path> [packages]");
  }
  const options: InstallOptions = {
    target,
    indexUrl: argv.index_url || "https://pypi.org/pypi",
    dependencies: !argv.no_deps,
    installed: new Set(),
  };
  for (const requirement of requirements) {
    await installRequirement(requirement, options);
  }
}
