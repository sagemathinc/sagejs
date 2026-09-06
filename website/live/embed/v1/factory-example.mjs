import { createSageCell } from "./sagejs-cell.mjs";

await createSageCell(document.querySelector("#calculus"), {
  autoEvaluate: true,
  runButtonText: "Update",
  source: `from IPython.display import display

@interact
def powers(n=slider(1, 6, 1, default=2, label='exponent')):
    display((x^n).derivative(x))`,
});
