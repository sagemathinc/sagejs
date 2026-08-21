function normalizedRange(value, length) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(length, Math.trunc(number)));
}

function lineBounds(source, position) {
  const start = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const next = source.indexOf("\n", position);
  return [start, next < 0 ? source.length : next];
}

function markerCell(source, position) {
  const lines = source.split("\n");
  let offset = 0;
  let activeLine = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const end = offset + lines[index].length + (index + 1 < lines.length ? 1 : 0);
    if (position <= end) {
      activeLine = index;
      break;
    }
    offset = end;
  }
  const marker = /^\s*#\s*%%(?:\s|$)/;
  let first = activeLine;
  while (first > 0 && !marker.test(lines[first])) first -= 1;
  if (!marker.test(lines[first])) first = 0;
  else first += 1;
  let last = activeLine + 1;
  while (last < lines.length && !marker.test(lines[last])) last += 1;
  return lines.slice(first, last).join("\n").trim();
}

function paragraphCell(source, position) {
  const [lineStart, lineEnd] = lineBounds(source, position);
  let start = lineStart;
  let end = lineEnd;
  while (start > 0) {
    const previousEnd = start - 1;
    const previousStart = source.lastIndexOf("\n", previousEnd - 1) + 1;
    if (source.slice(previousStart, previousEnd).trim() === "") break;
    start = previousStart;
  }
  while (end < source.length) {
    const nextStart = end + 1;
    const nextEndIndex = source.indexOf("\n", nextStart);
    const nextEnd = nextEndIndex < 0 ? source.length : nextEndIndex;
    if (source.slice(nextStart, nextEnd).trim() === "") break;
    end = nextEnd;
  }
  return source.slice(start, end).trim();
}

/** Select the source used by the public run-selection, run-cell and run-all controls. */
export function executionSource(source, {
  mode = "all",
  selectionStart = 0,
  selectionEnd = selectionStart,
} = {}) {
  if (typeof source !== "string") throw new TypeError("source must be a string");
  const start = normalizedRange(selectionStart, source.length);
  const end = normalizedRange(selectionEnd, source.length);
  if (mode === "all") return source;
  if (mode === "selection") {
    if (start !== end) return source.slice(Math.min(start, end), Math.max(start, end));
    const [lineStart, lineEnd] = lineBounds(source, start);
    return source.slice(lineStart, lineEnd);
  }
  if (mode !== "cell") throw new TypeError(`unknown execution mode ${JSON.stringify(mode)}`);
  if (/^\s*#\s*%%(?:\s|$)/m.test(source)) return markerCell(source, start);
  return paragraphCell(source, start);
}
