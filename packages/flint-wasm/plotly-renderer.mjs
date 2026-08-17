export const PLOTLY_MIME = "application/vnd.plotly.v1+json";

const BROWSER_IMAGE_FORMATS = ["png", "jpeg", "webp", "svg"];

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
  const name = String(filename);
  const extension = name.includes(".") ? name.split(".").pop() : undefined;
  let format = String(explicitFormat ?? (extension || "png")).toLowerCase();
  if (format === "jpg") format = "jpeg";
  if (!BROWSER_IMAGE_FORMATS.includes(format)) {
    throw new Error(
      `unsupported browser graphics format ${JSON.stringify(format)}`,
    );
  }
  return format;
}

function percentEncodedBytes(value) {
  const bytes = [];
  let plain = "";
  const flushPlain = () => {
    if (!plain) return;
    for (const value of new TextEncoder().encode(plain)) bytes.push(value);
    plain = "";
  };
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "%") {
      plain += value[index];
      continue;
    }
    flushPlain();
    if (
      index + 2 >= value.length ||
      !/^[0-9a-f]{2}$/i.test(value.slice(index + 1, index + 3))
    ) {
      throw new TypeError("image data URL contains an invalid percent escape");
    }
    bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
    index += 2;
  }
  flushPlain();
  return new Uint8Array(bytes);
}

function imageDataUrlBytes(url) {
  if (typeof url !== "string" || !url.startsWith("data:")) {
    throw new TypeError("Plotly image export did not return a data URL");
  }
  const separator = url.indexOf(",");
  if (separator < 0) {
    throw new TypeError("Plotly image data URL has no payload separator");
  }
  const metadata = url.slice(5, separator);
  const payload = url.slice(separator + 1);
  if (!payload) throw new TypeError("Plotly image data URL has an empty payload");
  const isBase64 = metadata
    .split(";")
    .some((value) => value.toLowerCase() === "base64");
  if (!isBase64) return percentEncodedBytes(payload);

  const encodedBytes = percentEncodedBytes(payload);
  for (const value of encodedBytes) {
    if (value > 0x7f) {
      throw new TypeError("base64 image data URL contains a non-ASCII byte");
    }
  }
  let encoded = new TextDecoder().decode(encodedBytes);
  encoded = encoded.replace(/[\t\n\f\r ]/g, "");
  if (
    encoded.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) ||
    (encoded.indexOf("=") >= 0 && encoded.indexOf("=") < encoded.length - 2)
  ) {
    throw new TypeError("image data URL contains invalid base64");
  }
  if (typeof globalThis.atob !== "function") {
    throw new Error("base64 decoding is unavailable in this environment");
  }
  let decoded;
  try {
    decoded = globalThis.atob(encoded);
  } catch {
    throw new TypeError("image data URL contains invalid base64");
  }
  const answer = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    answer[index] = decoded.charCodeAt(index);
  }
  return answer;
}

/**
 * Report whether this browser has the Plotly operations needed for image export.
 */
export function browserGraphicsExportCapabilities(
  plotly = globalThis.Plotly,
) {
  const missing = [];
  if (!plotly || typeof plotly.react !== "function") missing.push("react");
  if (!plotly || typeof plotly.toImage !== "function") missing.push("toImage");
  const available = missing.length === 0;
  return {
    backend: "plotly-browser",
    available,
    formats: available ? [...BROWSER_IMAGE_FORMATS] : [],
    dataUrl: available,
    bytes: available,
    missing,
  };
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
 * Render a rich display offscreen and return its encoded image bytes.
 */
export async function sageDisplayToImageBytes(
  display,
  options = {},
  plotly = globalThis.Plotly,
) {
  return imageDataUrlBytes(
    await sageDisplayToImage(display, options, plotly),
  );
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
