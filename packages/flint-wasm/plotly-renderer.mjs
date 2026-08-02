export const PLOTLY_MIME = "application/vnd.plotly.v1+json";

/**
 * Render a Sage.js rich display with an existing Plotly.js implementation.
 *
 * Plotly is injected instead of imported so the mathematical kernel stays
 * independent of a particular renderer bundle.
 */
export async function renderSageDisplay(
  element,
  display,
  plotly = globalThis.Plotly,
) {
  if (display?.mime !== PLOTLY_MIME) {
    throw new TypeError(
      `unsupported Sage.js display type ${JSON.stringify(display?.mime)}`,
    );
  }
  if (!plotly || typeof plotly.react !== "function") {
    throw new Error("Plotly.js is required to render this Sage.js display");
  }
  const figure = display.data;
  const style = element?.style;
  if (style) {
    const width = Number(figure?.layout?.width);
    const height = Number(figure?.layout?.height);
    if (Number.isFinite(width) && width > 0) style.width = `${width}px`;
    if (Number.isFinite(height) && height > 0) style.height = `${height}px`;
    style.maxWidth = "100%";
  }
  await plotly.react(
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
  return element;
}

function imageFormat(filename, explicitFormat) {
  let format = String(
    explicitFormat ??
      String(filename).split(".").pop() ??
      "png",
  ).toLowerCase();
  if (format === "jpg") format = "jpeg";
  if (!["png", "jpeg", "webp", "svg"].includes(format)) {
    throw new Error(
      `unsupported browser graphics format ${JSON.stringify(format)}`,
    );
  }
  return format;
}

/**
 * Render a rich display offscreen and return a Plotly image data URL.
 */
export async function sageDisplayToImage(
  display,
  options = {},
  plotly = globalThis.Plotly,
) {
  if (!plotly || typeof plotly.toImage !== "function") {
    throw new Error("Plotly.js image export is unavailable");
  }
  const element = document.createElement("div");
  element.style.cssText =
    "position:fixed;left:-100000px;top:0;background:white";
  document.body.append(element);
  try {
    await renderSageDisplay(element, display, plotly);
    const format = imageFormat(options.filename ?? "", options.format);
    const imageOptions = { format };
    for (const name of ["width", "height", "scale"]) {
      if (options[name] !== undefined) {
        imageOptions[name] = Number(options[name]);
      }
    }
    return await plotly.toImage(element, imageOptions);
  } finally {
    if (typeof plotly.purge === "function") plotly.purge(element);
    element.remove();
  }
}

/**
 * Render and download a rich display using the filename requested by Sage.
 */
export async function downloadSageDisplay(
  display,
  filename,
  options = {},
  plotly = globalThis.Plotly,
) {
  const href = await sageDisplayToImage(
    display,
    { ...options, filename },
    plotly,
  );
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = String(filename).split(/[\\/]/).pop() || "sagejs-plot.png";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  return href;
}

export function clearSageDisplay(element, plotly = globalThis.Plotly) {
  if (plotly && typeof plotly.purge === "function") {
    plotly.purge(element);
  }
  element.replaceChildren();
}
