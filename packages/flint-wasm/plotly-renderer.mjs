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
  await plotly.react(
    element,
    figure.data ?? [],
    figure.layout ?? {},
    figure.config ?? {},
  );
  return element;
}

export function clearSageDisplay(element, plotly = globalThis.Plotly) {
  if (plotly && typeof plotly.purge === "function") {
    plotly.purge(element);
  }
  element.replaceChildren();
}
