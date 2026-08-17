import { chromium } from "playwright-core";
import { discoverChromium } from "./chromium-discovery";

interface RenderRequest {
  figure: {
    data?: unknown[];
    layout?: Record<string, unknown>;
    config?: Record<string, unknown>;
    frames?: unknown[];
  };
  options: {
    format: "png" | "jpeg" | "webp" | "svg";
    width?: number;
    height?: number;
    scale?: number;
  };
}

function chromiumPath(): string {
  const discovery = discoverChromium();
  if (discovery.executablePath) return discovery.executablePath;
  throw new Error(
    "PNG/SVG graphics export requires Chrome, Chromium, or Edge. Install a browser or set SAGEJS_CHROMIUM_PATH to its executable; HTML and JSON export do not require a browser.",
  );
}

function decodeDataUrl(value: string): Buffer {
  const comma = value.indexOf(",");
  if (comma < 0 || !value.startsWith("data:")) {
    throw new Error("Plotly returned an invalid image data URL");
  }
  const metadata = value.slice(0, comma);
  const data = value.slice(comma + 1);
  return metadata.endsWith(";base64")
    ? Buffer.from(data, "base64")
    : Buffer.from(decodeURIComponent(data), "utf8");
}

async function readRequest(): Promise<RenderRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main(): Promise<void> {
  const request = await readRequest();
  const layout = request.figure?.layout ?? {};
  const width = Number(
    request.options?.width ?? Reflect.get(layout, "width") ?? 800,
  );
  const height = Number(
    request.options?.height ?? Reflect.get(layout, "height") ?? 600,
  );
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: {
        width: Math.max(1, Math.ceil(width)),
        height: Math.max(1, Math.ceil(height)),
      },
    });
    await context.route("**/*", (route) => route.abort("blockedbyclient"));
    const page = await context.newPage();
    await page.setContent(
      '<!doctype html><html><body style="margin:0">' +
        '<div id="plot"></div></body></html>',
    );
    await page.addScriptTag({
      path: require.resolve("plotly.js-dist-min/plotly.min.js"),
    });
    const dataUrl = await page.evaluate(
      async ({ figure, options }) => {
        const plotly = Reflect.get(globalThis, "Plotly");
        const element = document.getElementById("plot");
        await plotly.newPlot(
          element,
          figure.data ?? [],
          figure.layout ?? {},
          figure.config ?? {},
        );
        if (
          Array.isArray(figure.frames) &&
          figure.frames.length > 0 &&
          typeof plotly.addFrames === "function"
        ) {
          await plotly.addFrames(element, figure.frames);
        }
        return plotly.toImage(element, options);
      },
      {
        figure: request.figure,
        options: {
          ...request.options,
          width,
          height,
        },
      },
    );
    process.stdout.write(decodeDataUrl(dataUrl));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
