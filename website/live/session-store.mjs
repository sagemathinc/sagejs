import { DEFAULT_LIMITS, utf8Size } from "./resource-policy.mjs";

export const WORKSPACE_SCHEMA = "org.sagejs.web/workspace-v1";
const STORAGE_KEY = "sagejs.web.workspaces.v1";

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function randomId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.every((value) => value === 0)) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function newWorkspace({ title = "Untitled worksheet", source = "" } = {}) {
  const now = new Date().toISOString();
  return {
    schema: WORKSPACE_SCHEMA,
    id: randomId(),
    title: String(title).slice(0, 120),
    source: String(source),
    createdAt: now,
    updatedAt: now,
  };
}

export function validateWorkspace(value, limits = DEFAULT_LIMITS) {
  if (!value || typeof value !== "object" || value.schema !== WORKSPACE_SCHEMA) {
    throw new TypeError("unsupported Sage.js worksheet format");
  }
  if (typeof value.id !== "string" || !/^[a-z0-9-]{8,80}$/i.test(value.id)) {
    throw new TypeError("worksheet id is invalid");
  }
  if (typeof value.title !== "string" || typeof value.source !== "string") {
    throw new TypeError("worksheet title and source must be strings");
  }
  if (utf8Size(value.source) > limits.savedSourceBytes) {
    throw new RangeError("worksheet source exceeds the local-storage limit");
  }
  return {
    schema: WORKSPACE_SCHEMA,
    id: value.id,
    title: value.title.slice(0, 120) || "Untitled worksheet",
    source: value.source,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

export class WorkspaceStore {
  constructor(storage = defaultStorage(), limits = DEFAULT_LIMITS) {
    this.storage = storage;
    this.limits = limits;
  }

  list() {
    if (!this.storage) return [];
    let decoded;
    try {
      decoded = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
    if (!Array.isArray(decoded)) return [];
    const valid = [];
    for (const item of decoded) {
      try { valid.push(validateWorkspace(item, this.limits)); } catch { /* ignore corrupt local entries */ }
    }
    return valid.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  save(workspace) {
    if (!this.storage) throw new Error("local worksheet storage is unavailable");
    const valid = validateWorkspace({ ...workspace, updatedAt: new Date().toISOString() }, this.limits);
    const others = this.list().filter((item) => item.id !== valid.id);
    this.storage.setItem(STORAGE_KEY, JSON.stringify([valid, ...others].slice(0, this.limits.savedSessions)));
    return valid;
  }

  remove(id) {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.list().filter((item) => item.id !== id)));
  }
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(encoded) {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded)) throw new TypeError("shared source is malformed");
  const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (value) => value.charCodeAt(0));
}

export function encodeSharedSource(source, limits = DEFAULT_LIMITS) {
  const bytes = new TextEncoder().encode(String(source));
  if (bytes.byteLength > limits.shareBytes) throw new RangeError("source is too large for a shareable URL");
  return base64UrlEncode(bytes);
}

export function decodeSharedSource(encoded, limits = DEFAULT_LIMITS) {
  const bytes = base64UrlDecode(String(encoded));
  if (bytes.byteLength > limits.shareBytes) throw new RangeError("shared source exceeds the URL limit");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
