import type { SageDisplayData } from "./kernel.mjs";

export const PLOTLY_MIME: "application/vnd.plotly.v1+json";

export interface PlotlyRenderer {
  react(
    element: Element,
    data: unknown[],
    layout: object,
    config: object,
  ): Promise<unknown>;
  purge?(element: Element): void;
}

export function renderSageDisplay(
  element: Element,
  display: SageDisplayData,
  plotly?: PlotlyRenderer,
): Promise<Element>;

export function clearSageDisplay(
  element: Element,
  plotly?: PlotlyRenderer,
): void;
