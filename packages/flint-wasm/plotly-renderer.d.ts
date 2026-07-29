import type { SageDisplayData } from "./kernel.mjs";

export const PLOTLY_MIME: "application/vnd.plotly.v1+json";

export interface PlotlyRenderer {
  react(
    element: Element,
    data: unknown[],
    layout: object,
    config: object,
  ): Promise<unknown>;
  toImage(
    element: Element,
    options: {
      format: "png" | "jpeg" | "webp" | "svg";
      width?: number;
      height?: number;
      scale?: number;
    },
  ): Promise<string>;
  purge?(element: Element): void;
}

export interface PlotlyImageOptions {
  filename?: string;
  format?: "png" | "jpeg" | "jpg" | "webp" | "svg";
  width?: number;
  height?: number;
  scale?: number;
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

export function sageDisplayToImage(
  display: SageDisplayData,
  options?: PlotlyImageOptions,
  plotly?: PlotlyRenderer,
): Promise<string>;

export function downloadSageDisplay(
  display: SageDisplayData,
  filename: string,
  options?: PlotlyImageOptions,
  plotly?: PlotlyRenderer,
): Promise<string>;
