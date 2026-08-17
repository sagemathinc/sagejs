import { writeFileSync } from "fs";
import { extname, resolve } from "path";
import { discoverChromium } from "./chromium-discovery";
import {
  createNodeGraphicsExportCapabilities,
  GraphicsExportCapabilities,
  GraphicsExportError,
  GraphicsImageOptions,
  normalizeGraphicsExportFormat,
  requireGraphicsExportFormat,
  validateGraphicsImageRequest,
} from "./graphics-export-contract";
import { SynchronousPlotlyRenderer } from "./plotly-renderer-client";
import { isSingleExecutable, readPlotlySource } from "./resources";

export const PLOTLY_MIME = "application/vnd.plotly.v1+json";

interface PlotlyDisplay {
  mime: string;
  data: unknown;
}

type GraphicsSaveOptions = GraphicsImageOptions;

let plotlySource: string | undefined;
let imageRenderer: SynchronousPlotlyRenderer | undefined;
let imageRendererExecutable: string | undefined;
let lifecycleHooksInstalled = false;

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
  const executablePath = discovery.executablePath!;
  if (!imageRenderer || imageRendererExecutable !== executablePath) {
    imageRenderer?.dispose();
    imageRenderer = new SynchronousPlotlyRenderer({ executablePath });
    imageRendererExecutable = executablePath;
  }
  try {
    return imageRenderer.render(input);
  } catch (error) {
    if (!(error instanceof GraphicsExportError)) throw error;
    const prefix = `[${error.code}] `;
    const detail = error.message.startsWith(prefix)
      ? error.message.slice(prefix.length)
      : error.message;
    throw new GraphicsExportError(error.code, detail, {
      format,
      alternatives: ["html", "json"],
      capabilities,
      cause: error,
    });
  }
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

/** Close the lazy Chromium renderer and release its worker thread. */
export function disposeNodeGraphicsRenderer(): void {
  imageRenderer?.dispose();
  imageRenderer = undefined;
  imageRendererExecutable = undefined;
}

function installRendererLifecycleHooks(): void {
  if (lifecycleHooksInstalled) return;
  lifecycleHooksInstalled = true;
  process.once("beforeExit", disposeNodeGraphicsRenderer);
  process.once("exit", () => {
    imageRenderer?.terminateNow();
    imageRenderer = undefined;
    imageRendererExecutable = undefined;
  });
}

export function installNodeGraphicsSaveHook(): () => void {
  installRendererLifecycleHooks();
  global.__sagejs_graphics_save_hook__ = saveGraphic;
  return () => {
    if (global.__sagejs_graphics_save_hook__ === saveGraphic) {
      delete global.__sagejs_graphics_save_hook__;
    }
    disposeNodeGraphicsRenderer();
  };
}
