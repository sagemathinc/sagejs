"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const oracle = require("./fixtures/pq-trees-sage-10.9.json");

const ROOT = path.resolve(__dirname, "..");

async function repr(session, source) {
  return (await session.evaluate(source)).repr;
}

async function matches(session, expression, expected) {
  const encoded = JSON.stringify(JSON.stringify(expected));
  assert.equal(await repr(session, `(${expression}) == json.loads(${encoded})`), "True");
}

const PRELUDE = [
  "import itertools, json",
  "from sage.graphs.pq_trees import P, PQ, Q, reorder_sets",
  "def canonical_leaf(value):",
  "    return sorted(value)",
  "def canonical_tree(value):",
  "    if isinstance(value, PQ):",
  "        return ['P' if isinstance(value, P) else 'Q', [canonical_tree(x) for x in value]]",
  "    return canonical_leaf(value)",
  "def canonical_ordering(value):",
  "    return [canonical_leaf(x) for x in value]",
  "def contiguous(ordering, value):",
  "    indices = [i for i, leaf in enumerate(ordering) if value in leaf]",
  "    return not indices or indices == list(range(indices[0], indices[-1] + 1))",
  "def captured(function):",
  "    try:",
  "        return {'status': 'passed', 'value': function()}",
  "    except Exception as error:",
  "        return {'status': 'exception', 'type': type(error).__name__, 'message': str(error)}",
].join("\n");

test("PQ-tree selected surface matches pinned Sage 10.9 facts", { timeout: 120_000 }, async () => {
  const session = await createSage({ mode: "python" });
  try {
    await session.evaluate(PRELUDE);
    assert.equal(
      await repr(
        session,
        "[P.__name__, PQ.__name__, Q.__name__, callable(reorder_sets), " +
          "all(hasattr(PQ, x) for x in ['reverse','flatten','ordering','number_of_children','simplify']), " +
          "all(hasattr(P, x) for x in ['set_contiguous','cardinality','orderings']), " +
          "all(hasattr(Q, x) for x in ['set_contiguous','cardinality','orderings'])]",
      ),
      "['P', 'PQ', 'Q', True, True, True, True]",
    );

    await session.evaluate(
      "nested=Q([[1,2],[2,3],P([[2,4],[2,8],[2,9]])]); nested_before=canonical_ordering(nested.ordering()); nested.reverse(); nested_after=canonical_ordering(nested.ordering())",
    );
    await matches(session, "{'before': nested_before, 'afterReverse': nested_after}", oracle.facts.nested);

    await session.evaluate(
      "duplicate=P([[1,2],[2,1],[3]]); identity_leaf={4,5}; identity_tree=P([identity_leaf])",
    );
    await matches(
      session,
      "{'duplicateChildCount': duplicate.number_of_children(), 'duplicateOrdering': canonical_ordering(duplicate.ordering()), 'setIdentityPreserved': next(iter(identity_tree)) is identity_leaf}",
      oracle.facts.construction,
    );

    await session.evaluate(
      "simplify_p=P([[2,4],[1,2],[0,8],[0,5]]); simplify_q=Q([[2,4],[1,2],[0,8],[0,5]])",
    );
    await matches(
      session,
      "{'pRight': [canonical_tree(x) for x in simplify_p.simplify(0,right=True)], 'qRight': [canonical_tree(x) for x in simplify_q.simplify(0,right=True)], 'invalid': captured(lambda: simplify_p.simplify(0))}",
      oracle.facts.simplify,
    );
    await matches(
      session,
      "canonical_tree(Q([P([[2,4],[2,8],[2,9]])]).flatten())",
      oracle.facts.flatten,
    );

    await session.evaluate(
      "p_card=P([[0,3],[1,2],[2,3],[2,4],[4,0],[2,8],[2,9]]); p_before=p_card.cardinality(); p_status=list(p_card.set_contiguous(3)); p_after=p_card.cardinality(); p_orders=P([[1],[2],[3]])",
    );
    await matches(
      session,
      "{'cardinalityBefore': p_before, 'status': p_status, 'cardinalityAfter': p_after, 'orderings': [canonical_ordering(x) for x in p_orders.orderings()]}",
      oracle.facts.p,
    );

    await session.evaluate(
      "q_orders=Q([[1],[2],[3]]); q_constraint=Q([[2,3],Q([[3,0],[3,1]]),Q([[4,0],[4,5]])]); q_status=list(q_constraint.set_contiguous(0))",
    );
    await matches(
      session,
      "{'cardinality': q_orders.cardinality(), 'orderings': [canonical_ordering(x) for x in q_orders.orderings()], 'status': q_status, 'treeAfterConstraint': canonical_tree(q_constraint)}",
      oracle.facts.q,
    );

    await session.evaluate(
      "p_constraints=P([[0,1],[1,2],[2,3],[3,0]]); p_statuses=[list(p_constraints.set_contiguous(v)) for v in [0,1,2]]",
    );
    await matches(
      session,
      "{'pStatuses': p_statuses, 'pImpossible': captured(lambda: p_constraints.set_contiguous(3)), 'qImpossible': captured(lambda: Q([[0,1],[1,2],[2,0]]).set_contiguous(0))}",
      oracle.facts.constraints,
    );

    await session.evaluate(
      "reorder_input=[{0,1,2},{1,2,3},{2,3,4},{3,4,5}]; reorder_output=reorder_sets([reorder_input[i] for i in [2,0,3,1]])",
    );
    await matches(
      session,
      "{'output': canonical_ordering(reorder_output), 'allValuesContiguous': all(contiguous(reorder_output,v) for v in set().union(*reorder_input)), 'identitySetPreserved': {id(x) for x in reorder_output} == {id(x) for x in reorder_input}, 'impossible': captured(lambda: reorder_sets([{0,1},{1,2},{0,2}])), 'zero': reorder_sets([]), 'oneIdentity': (lambda x: reorder_sets(x) is x)([{1}]), 'twoIdentity': (lambda x: reorder_sets(x) is x)([{1},{2}])}",
      oracle.facts.reorder,
    );
  } finally {
    await session.close();
  }
});

test("PQ-tree exhaustive small-family result agrees with brute force", { timeout: 120_000 }, async () => {
  const session = await createSage({ mode: "python" });
  try {
    await session.evaluate(PRELUDE);
    await session.evaluate(
      [
        "leaves=[set(x) for size in range(1,4) for x in itertools.combinations(range(3),size)]",
        "cases=satisfiable=rejected=0",
        "all_matched=True",
        "for size in range(1,5):",
        "    for indices in itertools.combinations(range(len(leaves)),size):",
        "        family=[set(leaves[i]) for i in indices]",
        "        brute=any(all(contiguous(ordering,value) for value in {0,1,2}) for ordering in itertools.permutations(family))",
        "        result=captured(lambda: reorder_sets(family))",
        "        cases += 1",
        "        if brute:",
        "            satisfiable += 1",
        "            all_matched = all_matched and result['status']=='passed' and all(contiguous(result['value'],v) for v in {0,1,2})",
        "        else:",
        "            rejected += 1",
        "            all_matched = all_matched and result['status']=='exception' and result['message']=='Impossible'",
      ].join("\n"),
    );
    await matches(
      session,
      "{'groundSetSize': 3, 'maximumFamilySize': 4, 'cases': cases, 'satisfiable': satisfiable, 'rejected': rejected, 'allMatched': all_matched}",
      oracle.exhaustiveInvariant,
    );
  } finally {
    await session.close();
  }
});

test("PQ-tree public module works in Sage mode", async () => {
  const session = await createSage({ mode: "sage" });
  try {
    await session.evaluate(PRELUDE);
    await session.evaluate("sage_mode_ordering=reorder_sets([{0,1},{1,2},{2,3}])");
    assert.equal(
      await repr(
        session,
        "all(contiguous(sage_mode_ordering, value) for value in {0,1,2,3})",
      ),
      "True",
    );
  } finally {
    await session.close();
  }
});

test("PQ-tree implementation remains provider-free ordinary Python", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/lib/sage/graphs/pq_trees.py"), "utf8");
  assert.match(source, /from __future__ import annotations/);
  assert.doesNotMatch(source, /\b(?:subprocess|ctypes|cypari|singular|sage\.libs|sagejs\.runtime)\b/);
  assert.doesNotMatch(source, /@native|#\s*globals|verbatim/);
  assert.deepEqual(
    [...source.matchAll(/^from ([\w.]+) import/gm)].map((match) => match[1]),
    ["__future__", "itertools", "typing"],
  );
});
