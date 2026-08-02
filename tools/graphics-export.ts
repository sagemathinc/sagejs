import { writeFileSync } from "fs";
import { extname, join, resolve } from "path";
import { spawnSync } from "child_process";
import { isSingleExecutable, readPlotlySource } from "./resources";

export const PLOTLY_MIME = "application/vnd.plotly.v1+json";

interface PlotlyDisplay {
  mime: string;
  data: unknown;
}

interface GraphicsSaveOptions {
  width?: unknown;
  height?: unknown;
  scale?: unknown;
  format?: unknown;
}

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

function numericOption(
  options: GraphicsSaveOptions,
  name: "width" | "height" | "scale",
): number | undefined {
  const value = options?.[name];
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`${name} must be a positive number`);
  }
  return number;
}

function imageOptions(
  options: GraphicsSaveOptions,
  format: string,
): Record<string, number | string> {
  const answer: Record<string, number | string> = { format };
  for (const name of ["width", "height", "scale"] as const) {
    const value = numericOption(options, name);
    if (value !== undefined) answer[name] = value;
  }
  return answer;
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
): Buffer {
  if (isSingleExecutable()) {
    throw new Error(
      "PNG/SVG graphics export is not yet bundled into the single " +
        "executable; save as HTML or JSON, or use the npm distribution",
    );
  }
  const helper = join(__dirname, "plotly-image-renderer.js");
  const input = stringify({
    figure,
    options: imageOptions(options, format),
  });
  const rendered = spawnSync(process.execPath, [helper], {
    input,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (rendered.error) throw rendered.error;
  if (rendered.status !== 0) {
    const detail = rendered.stderr.toString("utf8").trim();
    throw new Error(
      detail ||
        `Plotly image renderer exited with status ${rendered.status}`,
    );
  }
  return rendered.stdout;
}

export function saveGraphic(
  graphic: unknown,
  filenameValue: unknown,
  options: GraphicsSaveOptions = {},
): unknown {
  const filename = resolve(String(filenameValue));
  const figure = figureFromGraphic(graphic);
  let format = String(options?.format ?? extname(filename).slice(1))
    .toLowerCase();
  if (format === "jpg") format = "jpeg";
  if (!format) {
    throw new Error(
      "graphics filename must have an extension or specify format",
    );
  }

  if (format === "json") {
    writeFileSync(filename, `${stringify(figure, 2)}\n`);
  } else if (format === "html" || format === "htm") {
    writeFileSync(filename, standaloneHtml(figure));
  } else if (["png", "jpeg", "webp", "svg"].includes(format)) {
    writeFileSync(filename, renderImage(figure, format, options));
  } else {
    throw new Error(
      `unsupported graphics format ${JSON.stringify(format)}; ` +
        "use png, jpeg, webp, svg, html, or json",
    );
  }
  return graphic;
}

export function installNodeGraphicsSaveHook(): void {
  global.__sagejs_graphics_save_hook__ = saveGraphic;
}
