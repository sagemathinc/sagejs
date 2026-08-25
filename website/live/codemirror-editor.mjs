import { indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { EditorState, Prec, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";

const FOUR_SPACES = "    ";

const sageHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "#86a899", fontStyle: "italic" },
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
    color: "#8ee5b8",
    fontWeight: "650",
  },
  {
    tag: [tags.string, tags.character, tags.regexp],
    color: "#f0cf82",
  },
  {
    tag: [tags.number, tags.bool, tags.atom, tags.constant(tags.name)],
    color: "#9fc9f4",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.definition(tags.name),
      tags.className,
      tags.typeName,
    ],
    color: "#d4ed96",
  },
  { tag: [tags.invalid, tags.deleted], color: "#ff9a8e" },
]);

const sageTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#12201a",
      color: "#e9f2ed",
      height: "100%",
    },
    "&.cm-focused": { outline: "3px solid #65b995", outlineOffset: "-3px" },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: ".91rem",
      fontWeight: "500",
      lineHeight: "1.55",
      overflow: "auto",
    },
    ".cm-content": { caretColor: "#d8f36a", padding: "1rem 0" },
    ".cm-line": { padding: "0 1.15rem" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#d8f36a" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#315e4c !important",
    },
    ".cm-gutters": {
      backgroundColor: "#162820",
      border: "none",
      color: "#78998a",
    },
    ".cm-activeLine": { backgroundColor: "#192c24" },
    ".cm-activeLineGutter": { backgroundColor: "#203b2f", color: "#c6ddd2" },
    ".cm-matchingBracket": {
      backgroundColor: "#315e4c",
      outline: "1px solid #79c7a5",
    },
    ".cm-panels": { backgroundColor: "#20342b", color: "#e9f2ed" },
    ".cm-tooltip": {
      backgroundColor: "#f8fbf8",
      border: "1px solid #b8c8bf",
      color: "#17211d",
    },
  },
  { dark: true },
);

function boundedOffset(value, length) {
  const offset = Number(value);
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(length, Math.trunc(offset)));
}

/**
 * Mount CodeMirror while retaining the tiny textarea-like contract used by
 * the worksheet and its browser tests (`value`, selection offsets and input
 * events). Programmatic `value` changes replace the editor state without
 * creating autosave events or cross-workspace undo history.
 */
export function createSourceEditor(parent, { onRun } = {}) {
  if (!(parent instanceof HTMLElement)) {
    throw new TypeError("CodeMirror requires an HTML element parent");
  }

  const run = (mode) => {
    onRun?.(mode);
    return true;
  };
  const extensions = [
    basicSetup,
    python(),
    EditorState.tabSize.of(4),
    indentUnit.of(FOUR_SPACES),
    syntaxHighlighting(sageHighlightStyle),
    sageTheme,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      "aria-labelledby": "source-label",
      "aria-describedby": "editor-help",
      "aria-multiline": "true",
      autocapitalize: "off",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
    }),
    Prec.highest(
      keymap.of([
        { key: "Shift-Enter", preventDefault: true, run: () => run("cell") },
        { key: "Mod-Enter", preventDefault: true, run: () => run("all") },
        indentWithTab,
      ]),
    ),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        parent.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }),
  ];
  const makeState = (doc) => EditorState.create({ doc, extensions });
  const view = new EditorView({ parent, state: makeState("") });

  const selection = () => view.state.selection.main;
  const setSelection = (anchor, head = anchor) => {
    const length = view.state.doc.length;
    view.dispatch({
      selection: {
        anchor: boundedOffset(anchor, length),
        head: boundedOffset(head, length),
      },
      scrollIntoView: true,
      annotations: Transaction.addToHistory.of(false),
    });
  };

  Object.defineProperties(parent, {
    value: {
      configurable: true,
      get: () => view.state.doc.toString(),
      set: (value) => view.setState(makeState(String(value ?? ""))),
    },
    selectionStart: {
      configurable: true,
      get: () => selection().from,
      set: (value) => setSelection(value, selection().to),
    },
    selectionEnd: {
      configurable: true,
      get: () => selection().to,
      set: (value) => setSelection(selection().from, value),
    },
    setSelectionRange: {
      configurable: true,
      value: (start, end = start) => setSelection(start, end),
    },
  });
  parent.dataset.editor = "codemirror6";

  return Object.freeze({
    destroy: () => view.destroy(),
    focus: () => view.focus(),
    getSelection: () => ({ from: selection().from, to: selection().to }),
    getValue: () => view.state.doc.toString(),
    setValue: (value) => {
      parent.value = value;
    },
  });
}

export const SOURCE_INDENT = FOUR_SPACES;
