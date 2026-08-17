import type { ChromiumDiscovery } from "./chromium-discovery";

export const GRAPHICS_EXPORT_SCHEMA_VERSION = 1;

export const GRAPHICS_EXPORT_LIMITS = Object.freeze({
  max_dimension: 8192,
  max_scale: 4,
  max_rendered_pixels: 64 * 1024 * 1024,
  max_request_bytes: 64 * 1024 * 1024,
  max_output_bytes: 64 * 1024 * 1024,
  timeout_ms: 30_000,
});

export type GraphicsExportErrorCode =
  | "SAGEJS_GRAPHICS_FORMAT_UNSUPPORTED"
  | "SAGEJS_GRAPHICS_ANIMATION_FRAME_REQUIRED"
  | "SAGEJS_GRAPHICS_ANIMATION_FRAME_INVALID"
  | "SAGEJS_GRAPHICS_BROWSER_UNAVAILABLE"
  | "SAGEJS_GRAPHICS_STATIC_EXPORT_UNAVAILABLE_SEA"
  | "SAGEJS_GRAPHICS_EXPORT_LIMIT"
  | "SAGEJS_GRAPHICS_EXPORT_TIMEOUT"
  | "SAGEJS_GRAPHICS_RENDER_FAILED";

export interface GraphicsExportUnavailable {
  code: GraphicsExportErrorCode;
  message: string;
  remediation: string[];
}

export interface GraphicsExportFormatCapability {
  available: boolean;
  media_type: string;
  backend: "builtin" | "chromium";
  delivery: "filesystem"[];
  animation: "interactive" | "single-frame";
  aliases?: string[];
  caveats: string[];
  unavailable?: GraphicsExportUnavailable;
}

export interface GraphicsExportCapabilities {
  schema_version: 1;
  host: "node";
  formats: Record<string, GraphicsExportFormatCapability>;
  limits: typeof GRAPHICS_EXPORT_LIMITS;
}

export interface GraphicsImageOptions {
  width?: unknown;
  height?: unknown;
  scale?: unknown;
  format?: unknown;
}

export interface ValidatedGraphicsImageRequest {
  format: "png" | "jpeg" | "webp" | "svg";
  width: number;
  height: number;
  scale: number;
}

const BROWSER_FREE_REMEDIATION = [
  "Save as HTML for an interactive standalone plot.",
  "Save as JSON for the renderer-neutral Plotly figure.",
];

const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export class GraphicsExportError extends Error {
  readonly code: GraphicsExportErrorCode;
  readonly format?: string;
  readonly alternatives: string[];
  readonly capabilities?: GraphicsExportCapabilities;

  constructor(
    code: GraphicsExportErrorCode,
    message: string,
    options: {
      format?: string;
      alternatives?: string[];
      capabilities?: GraphicsExportCapabilities;
      cause?: unknown;
    } = {},
  ) {
    super(
      `[${code}] ${message}`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "GraphicsExportError";
    this.code = code;
    this.format = options.format;
    this.alternatives = options.alternatives ?? [];
    this.capabilities = options.capabilities;
  }
}

function staticUnavailable(
  discovery: ChromiumDiscovery,
  singleExecutable: boolean,
): GraphicsExportUnavailable | undefined {
  if (singleExecutable) {
    return {
      code: "SAGEJS_GRAPHICS_STATIC_EXPORT_UNAVAILABLE_SEA",
      message:
        "Static graphics export is not bundled in the Sage.js single executable.",
      remediation: [
        ...BROWSER_FREE_REMEDIATION,
        "Use the Sage.js npm distribution for PNG, JPEG, WebP, or SVG export.",
      ],
    };
  }
  if (discovery.available) return undefined;
  const configured = discovery.configuredBy;
  return {
    code: "SAGEJS_GRAPHICS_BROWSER_UNAVAILABLE",
    message:
      discovery.reason === "configured-path-missing" && configured
        ? `${configured} does not name an existing Chrome, Chromium, or Edge executable.`
        : "No Chrome, Chromium, or Edge executable was found.",
    remediation: [
      ...BROWSER_FREE_REMEDIATION,
      "Install Chrome, Chromium, or Edge, or set SAGEJS_CHROMIUM_PATH to its executable.",
    ],
  };
}

/** Return the Node host's JSON-safe export capabilities without launching a browser. */
export function createNodeGraphicsExportCapabilities(
  discovery: ChromiumDiscovery,
  singleExecutable = false,
): GraphicsExportCapabilities {
  const unavailable = staticUnavailable(discovery, singleExecutable);
  const formats: Record<string, GraphicsExportFormatCapability> = {
    json: {
      available: true,
      media_type: "application/json",
      backend: "builtin",
      delivery: ["filesystem"],
      animation: "interactive",
      caveats: [],
    },
    html: {
      available: true,
      media_type: "text/html",
      backend: "builtin",
      delivery: ["filesystem"],
      animation: "interactive",
      aliases: ["htm"],
      caveats: [],
    },
  };
  for (const format of ["png", "jpeg", "webp", "svg"] as const) {
    formats[format] = {
      available: unavailable === undefined,
      media_type: MEDIA_TYPES[format],
      backend: "chromium",
      delivery: ["filesystem"],
      animation: "single-frame",
      ...(format === "jpeg" ? { aliases: ["jpg"] } : {}),
      caveats:
        format === "svg"
          ? ["WebGL traces, including 3D plots, are rasterized in SVG output."]
          : [],
      ...(unavailable === undefined ? {} : { unavailable }),
    };
  }
  return {
    schema_version: GRAPHICS_EXPORT_SCHEMA_VERSION,
    host: "node",
    formats,
    limits: GRAPHICS_EXPORT_LIMITS,
  };
}

export function normalizeGraphicsExportFormat(value: unknown): string {
  const format = String(value ?? "").toLowerCase();
  if (format === "jpg") return "jpeg";
  if (format === "htm") return "html";
  return format;
}

export function requireGraphicsExportFormat(
  format: string,
  capabilities: GraphicsExportCapabilities,
): GraphicsExportFormatCapability {
  const capability = capabilities.formats[format];
  if (!capability) {
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_FORMAT_UNSUPPORTED",
      `Unsupported graphics format ${JSON.stringify(format)}. Use PNG, JPEG, WebP, SVG, HTML, or JSON.`,
      {
        format,
        alternatives: ["png", "jpeg", "webp", "svg", "html", "json"],
        capabilities,
      },
    );
  }
  if (capability.available) return capability;
  const unavailable = capability.unavailable!;
  throw new GraphicsExportError(
    unavailable.code,
    `${format.toUpperCase()} graphics export is unavailable: ${unavailable.message} ${unavailable.remediation.join(" ")}`,
    {
      format,
      alternatives: ["html", "json"],
      capabilities,
    },
  );
}

function numericValue(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_EXPORT_LIMIT",
      `${name} must be a finite positive number.`,
    );
  }
  return numeric;
}

function layoutDimension(figure: unknown, name: "width" | "height"): unknown {
  if (figure === null || typeof figure !== "object") return undefined;
  const layout = Reflect.get(figure, "layout");
  if (layout === null || typeof layout !== "object") return undefined;
  return Reflect.get(layout, name);
}

/** Validate all static-image resource bounds before Chromium is launched. */
export function validateGraphicsImageRequest(
  figure: unknown,
  format: string,
  options: GraphicsImageOptions,
  serializedRequestBytes: number,
): ValidatedGraphicsImageRequest {
  if (!(format in MEDIA_TYPES)) {
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_FORMAT_UNSUPPORTED",
      `Unsupported static graphics format ${JSON.stringify(format)}.`,
      { format },
    );
  }
  const width = numericValue(
    options.width ?? layoutDimension(figure, "width"),
    800,
    "width",
  );
  const height = numericValue(
    options.height ?? layoutDimension(figure, "height"),
    600,
    "height",
  );
  const scale = numericValue(options.scale, 1, "scale");
  for (const [name, value] of [
    ["width", width],
    ["height", height],
  ] as const) {
    if (value > GRAPHICS_EXPORT_LIMITS.max_dimension) {
      throw new GraphicsExportError(
        "SAGEJS_GRAPHICS_EXPORT_LIMIT",
        `${name} ${value} exceeds the static-export limit of ${GRAPHICS_EXPORT_LIMITS.max_dimension} pixels; reduce the dimensions or save as HTML or JSON.`,
        { format, alternatives: ["html", "json"] },
      );
    }
  }
  if (scale > GRAPHICS_EXPORT_LIMITS.max_scale) {
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_EXPORT_LIMIT",
      `scale ${scale} exceeds the static-export limit of ${GRAPHICS_EXPORT_LIMITS.max_scale}; reduce scale or save as HTML or JSON.`,
      { format, alternatives: ["html", "json"] },
    );
  }
  const renderedPixels = Math.ceil(width * scale) * Math.ceil(height * scale);
  if (renderedPixels > GRAPHICS_EXPORT_LIMITS.max_rendered_pixels) {
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_EXPORT_LIMIT",
      `The requested image has ${renderedPixels} rendered pixels, exceeding the static-export limit of ${GRAPHICS_EXPORT_LIMITS.max_rendered_pixels}; reduce width, height, or scale, or save as HTML or JSON.`,
      { format, alternatives: ["html", "json"] },
    );
  }
  if (serializedRequestBytes > GRAPHICS_EXPORT_LIMITS.max_request_bytes) {
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_EXPORT_LIMIT",
      `The serialized plot requires ${serializedRequestBytes} bytes, exceeding the static-export limit of ${GRAPHICS_EXPORT_LIMITS.max_request_bytes}; reduce the plotted data or save as HTML or JSON.`,
      { format, alternatives: ["html", "json"] },
    );
  }
  return {
    format: format as ValidatedGraphicsImageRequest["format"],
    width,
    height,
    scale,
  };
}
