import { writeFileSync } from "fs";
import { extname, join, resolve } from "path";
import { spawnSync } from "child_process";
import { discoverChromium } from "./chromium-discovery";
import {
  createNodeGraphicsExportCapabilities,
  GRAPHICS_EXPORT_LIMITS,
  GraphicsExportCapabilities,
  GraphicsExportError,
  GraphicsImageOptions,
  normalizeGraphicsExportFormat,
  requireGraphicsExportFormat,
  validateGraphicsImageRequest,
} from "./graphics-export-contract";
import { isSingleExecutable, readPlotlySource } from "./resources";

export const PLOTLY_MIME = "application/vnd.plotly.v1+json";

interface PlotlyDisplay {
  mime: string;
  data: unknown;
}

type GraphicsSaveOptions = GraphicsImageOptions;

let plotlySource: string | undefined;

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== "bigint") return value;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value.toString();
}

function stringify(value: unknown, space?: number): string {
  return JSON.stringify(value, jsonReplacer, space);
}

function figureFromGraphic(graphic: unknown): unknown {
  if (
    graphic === null ||
    (typeof graphic !== "object" && typeof graphic !== "function")
  ) {
    throw new TypeError("save() requires a graphics object");
  }
  const method = Reflect.get(graphic, "_rich_repr_");
  if (typeof method !== "function") {
    throw new TypeError("save() requires a graphics object");
  }
  const display = Reflect.apply(method, graphic, []) as PlotlyDisplay;
  if (
    display === null ||
    typeof display !== "object" ||
    Reflect.get(display, "mime") !== PLOTLY_MIME ||
    !Reflect.has(display, "data")
  ) {
    throw new TypeError("graphics object did not produce a Plotly figure");
  }
  return Reflect.get(display, "data");
}

function standaloneHtml(figure: unknown): string {
  const fallbackFilename = isSingleExecutable()
    ? ""
    : require.resolve("plotly.js-dist-min/plotly.min.js");
  plotlySource ??= readPlotlySource(
    fallbackFilename,
  );
  const figureJson = stringify(figure)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sage.js graphic</title>
<style>html,body,#sagejs-plot{width:100%;height:100%;margin:0}</style>
</head>
<body>
<div id="sagejs-plot"></div>
<script>${plotlySource}</script>
<script>
const figure = ${figureJson};
Promise.resolve(Plotly.newPlot(
  document.getElementById("sagejs-plot"),
  figure.data || [],
  figure.layout || {},
  figure.config || {}
)).then(() => {
  if (Array.isArray(figure.frames) && figure.frames.length && Plotly.addFrames) {
    return Plotly.addFrames(document.getElementById("sagejs-plot"), figure.frames);
  }
});
</script>
</body>
</html>
`;
}

function renderImage(
  figure: unknown,
  format: string,
  options: GraphicsSaveOptions,
  capabilities: GraphicsExportCapabilities,
): Buffer {
  requireGraphicsExportFormat(format, capabilities);
  const discovery = discoverChromium();
  const preliminary = validateGraphicsImageRequest(figure, format, options, 0);
  let input = stringify({ figure, options: preliminary });
  const validated = validateGraphicsImageRequest(
    figure,
    format,
    options,
    Buffer.byteLength(input),
  );
  input = stringify({ figure, options: validated });
  validateGraphicsImageRequest(
    figure,
    format,
    options,
    Buffer.byteLength(input),
  );
  const helper = join(__dirname, "plotly-image-renderer.js");
  const rendered = spawnSync(process.execPath, [helper], {
    input,
    maxBuffer: GRAPHICS_EXPORT_LIMITS.max_output_bytes,
    timeout: GRAPHICS_EXPORT_LIMITS.timeout_ms,
    env: discovery.executablePath
      ? { ...process.env, SAGEJS_CHROMIUM_PATH: discovery.executablePath }
      : process.env,
  });
  if (rendered.error) {
    const code = (rendered.error as NodeJS.ErrnoException).code;
    if (code === "ETIMEDOUT") {
      throw new GraphicsExportError(
        "SAGEJS_GRAPHICS_EXPORT_TIMEOUT",
        `Static ${format.toUpperCase()} export exceeded the ${GRAPHICS_EXPORT_LIMITS.timeout_ms} ms renderer limit; reduce the plot size or save as HTML or JSON.`,
        {
          format,
          alternatives: ["html", "json"],
          capabilities,
          cause: rendered.error,
        },
      );
    }
    if (code === "ENOBUFS") {
      throw new GraphicsExportError(
        "SAGEJS_GRAPHICS_EXPORT_LIMIT",
        `Static ${format.toUpperCase()} output exceeded the ${GRAPHICS_EXPORT_LIMITS.max_output_bytes}-byte renderer limit; reduce dimensions or scale, or save as HTML or JSON.`,
        {
          format,
          alternatives: ["html", "json"],
          capabilities,
          cause: rendered.error,
        },
      );
    }
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_RENDER_FAILED",
      `Static ${format.toUpperCase()} export could not start: ${rendered.error.message} Save as HTML or JSON, or verify the configured browser.`,
      {
        format,
        alternatives: ["html", "json"],
        capabilities,
        cause: rendered.error,
      },
    );
  }
  if (rendered.status !== 0) {
    const detail = rendered.stderr.toString("utf8").trim();
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_RENDER_FAILED",
      `Static ${format.toUpperCase()} export failed: ${
        detail || `Plotly image renderer exited with status ${rendered.status}`
      } Save as HTML or JSON, or verify the configured browser.`,
      {
        format,
        alternatives: ["html", "json"],
        capabilities,
      },
    );
  }
  if (rendered.stdout.length > GRAPHICS_EXPORT_LIMITS.max_output_bytes) {
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_EXPORT_LIMIT",
      `Static ${format.toUpperCase()} output exceeded the ${GRAPHICS_EXPORT_LIMITS.max_output_bytes}-byte renderer limit; reduce dimensions or scale, or save as HTML or JSON.`,
      { format, alternatives: ["html", "json"], capabilities },
    );
  }
  return rendered.stdout;
}

/** Report Node graphics-export capabilities without launching a browser. */
export function nodeGraphicsExportCapabilities(): GraphicsExportCapabilities {
  return createNodeGraphicsExportCapabilities(
    discoverChromium(),
    isSingleExecutable(),
  );
}

export function saveGraphic(
  graphic: unknown,
  filenameValue: unknown,
  options: GraphicsSaveOptions = {},
): unknown {
  const filename = resolve(String(filenameValue));
  const figure = figureFromGraphic(graphic);
  const format = normalizeGraphicsExportFormat(
    options?.format ?? extname(filename).slice(1),
  );
  const capabilities = nodeGraphicsExportCapabilities();
  if (!format) {
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_FORMAT_UNSUPPORTED",
      "Graphics filename must have an extension or specify format; use PNG, JPEG, WebP, SVG, HTML, or JSON.",
      {
        alternatives: ["png", "jpeg", "webp", "svg", "html", "json"],
        capabilities,
      },
    );
  }
  requireGraphicsExportFormat(format, capabilities);

  if (format === "json") {
    writeFileSync(filename, `${stringify(figure, 2)}\n`);
  } else if (format === "html") {
    writeFileSync(filename, standaloneHtml(figure));
  } else if (["png", "jpeg", "webp", "svg"].includes(format)) {
    writeFileSync(filename, renderImage(figure, format, options, capabilities));
  } else {
    throw new GraphicsExportError(
      "SAGEJS_GRAPHICS_FORMAT_UNSUPPORTED",
      `Unsupported graphics format ${JSON.stringify(format)}. Use PNG, JPEG, WebP, SVG, HTML, or JSON.`,
      { format, capabilities },
    );
  }
  return graphic;
}

export function installNodeGraphicsSaveHook(): void {
  global.__sagejs_graphics_save_hook__ = saveGraphic;
}
