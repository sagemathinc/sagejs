import {
  arrowSegmentGeometryOperations,
  arrowSegmentGeometryProofGaps,
  ArrowSegmentGeometryRecognition,
} from "./model";

function sourceRegion(node: any): {
  filename: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
} {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function lexicalName(compiler: any, node: any): string | null {
  return node instanceof compiler.AST_SymbolRef &&
      node.python_lexical_binding === true &&
      typeof node.name === "string" && node.name.length > 0
    ? node.name
    : null;
}

function exactCallArguments(node: any, count: number): boolean {
  return Array.isArray(node?.args) && node.args.length === count &&
    !node.args.starargs && !node.args.kwargs?.length &&
    !node.args.kwarg_items?.length;
}

function builtinCall(
  compiler: any,
  node: any,
  name: string,
  count: number,
): boolean {
  return node instanceof compiler.AST_Call && exactCallArguments(node, count) &&
    node.expression instanceof compiler.AST_SymbolRef &&
    node.expression.name === name &&
    node.expression.python_identifier !== false &&
    node.expression.python_lexical_binding === false &&
    node.expression.python_resolution_provenance === "module";
}

function integerLiteral(
  compiler: any,
  node: any,
  value: string,
): boolean {
  return node instanceof compiler.AST_Call &&
    node.expression instanceof compiler.AST_SymbolRef &&
    node.expression.name === "Integer" && exactCallArguments(node, 1) &&
    node.args[0] instanceof compiler.AST_String &&
    node.args[0].value === value;
}

function symbol(compiler: any, node: any, name: string): boolean {
  return lexicalName(compiler, node) === name;
}

function binary(
  compiler: any,
  node: any,
  operator: string,
  left: (value: any) => boolean,
  right: (value: any) => boolean,
): boolean {
  return node instanceof compiler.AST_Binary &&
    node.operator === operator && node.native_operator !== true &&
    left(node.left) && right(node.right);
}

function simpleBody(compiler: any, node: any): any | null {
  return node instanceof compiler.AST_SimpleStatement ? node.body : null;
}

function lexicalReferences(
  compiler: any,
  value: any,
  names: ReadonlySet<string>,
): boolean {
  const seen = new Set<any>();
  const visit = (node: any): boolean => {
    if (!node || typeof node !== "object" || seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(visit);
    if (!(node instanceof compiler.AST_Node)) return false;
    if (node instanceof compiler.AST_SymbolRef &&
        node.python_lexical_binding === true && names.has(node.name)) return true;
    for (const [key, child] of Object.entries(node)) {
      if (["start", "end", "scope", "thedef", "imports", "globals", "classes",
        "baselib", "optimization_ir", "optimization_region"].includes(key) ||
          typeof child === "function") continue;
      if (visit(child)) return true;
    }
    return false;
  };
  return visit(value);
}

function freshOutputBeforeLoop(
  compiler: any,
  ownerBody: any[],
  outerIndex: number,
  name: string,
): boolean {
  let assignmentIndex = -1;
  for (let index = outerIndex - 1; index >= 0; index -= 1) {
    const statement = simpleBody(compiler, ownerBody[index]);
    if (statement instanceof compiler.AST_AnnotatedAssignment &&
        lexicalName(compiler, statement.target) === name) {
      if (!(statement.value instanceof compiler.AST_Array) ||
          statement.value.elements?.length !== 0) return false;
      assignmentIndex = index;
      break;
    }
    if (statement instanceof compiler.AST_Assign &&
        statement.operator === "=" && statement.native_operator !== true &&
        lexicalName(compiler, statement.left) === name) {
      if (!(statement.right instanceof compiler.AST_Array) ||
          statement.right.elements?.length !== 0) return false;
      assignmentIndex = index;
      break;
    }
  }
  if (assignmentIndex < 0) return false;
  const nameSet = new Set([name]);
  return ownerBody.slice(assignmentIndex + 1, outerIndex).every((statement) =>
    !lexicalReferences(compiler, statement, nameSet));
}

function symbolAssignment(
  compiler: any,
  statement: any,
): { name: string; value: any } | null {
  const assignment = simpleBody(compiler, statement);
  const name = assignment instanceof compiler.AST_Assign &&
      assignment.operator === "=" && assignment.native_operator !== true
    ? lexicalName(compiler, assignment.left)
    : null;
  return name ? { name, value: assignment.right } : null;
}

function pairAssignment(
  compiler: any,
  statement: any,
): { names: readonly [string, string]; values: readonly [any, any] } | null {
  const assignment = simpleBody(compiler, statement);
  if (!(assignment instanceof compiler.AST_Assign) ||
      assignment.operator !== "=" || assignment.native_operator === true ||
      !(assignment.left instanceof compiler.AST_Seq) ||
      !(assignment.right instanceof compiler.AST_Seq)) return null;
  const left = lexicalName(compiler, assignment.left.car);
  const right = lexicalName(compiler, assignment.left.cdr);
  if (!left || !right || left === right) return null;
  return {
    names: [left, right],
    values: [assignment.right.car, assignment.right.cdr],
  };
}

function itemAt(
  compiler: any,
  node: any,
  sequenceName: string,
  indexName: string,
): boolean {
  return node instanceof compiler.AST_ItemAccess && node.assignment == null &&
    symbol(compiler, node.expression, sequenceName) &&
    symbol(compiler, node.property, indexName);
}

function floatOf(
  compiler: any,
  node: any,
  valueName: string,
): boolean {
  return builtinCall(compiler, node, "float", 1) &&
    symbol(compiler, node.args[0], valueName);
}

function mathHypot(
  compiler: any,
  node: any,
  first: (value: any) => boolean,
  second: (value: any) => boolean,
): boolean {
  return node instanceof compiler.AST_Call && exactCallArguments(node, 2) &&
    node.expression instanceof compiler.AST_Dot &&
    node.expression.property === "hypot" &&
    lexicalName(compiler, node.expression.expression) !== null &&
    node.expression.expression.python_resolution_provenance === "module" &&
    first(node.args[0]) && second(node.args[1]);
}

function enumeratedLoop(
  compiler: any,
  node: any,
): { indexName: string; valueName: string; sequenceName: string } | null {
  if (!(node instanceof compiler.AST_ForIn) || node.alternative != null ||
      !(node.init instanceof compiler.AST_Array) ||
      node.init.elements?.length !== 2 ||
      !builtinCall(compiler, node.object, "enumerate", 1)) return null;
  const indexName = lexicalName(compiler, node.init.elements[0]);
  const valueName = lexicalName(compiler, node.init.elements[1]);
  const sequenceName = lexicalName(compiler, node.object.args[0]);
  if (!indexName || !valueName || !sequenceName ||
      new Set([indexName, valueName, sequenceName]).size !== 3) return null;
  return { indexName, valueName, sequenceName };
}

function oneContinue(compiler: any, node: any): boolean {
  return node instanceof compiler.AST_BlockStatement &&
    node.body?.length === 1 && node.body[0] instanceof compiler.AST_Continue;
}

function nullSkip(
  compiler: any,
  node: any,
  firstName: string,
  secondName: string,
): boolean {
  return node instanceof compiler.AST_If && node.alternative == null &&
    binary(
      compiler,
      node.condition,
      "||",
      (left) => binary(
        compiler,
        left,
        "===",
        (value) => symbol(compiler, value, firstName),
        (value) => value instanceof compiler.AST_Null,
      ),
      (right) => binary(
        compiler,
        right,
        "===",
        (value) => symbol(compiler, value, secondName),
        (value) => value instanceof compiler.AST_Null,
      ),
    ) && oneContinue(compiler, node.body);
}

function zeroSkip(
  compiler: any,
  node: any,
  magnitudeName: string,
): string | null {
  if (!(node instanceof compiler.AST_If) || node.alternative != null ||
      !oneContinue(compiler, node.body) ||
      !(node.condition instanceof compiler.AST_Binary) ||
      node.condition.operator !== "||") return null;
  const left = node.condition.left;
  const right = node.condition.right;
  if (!binary(
    compiler,
    left,
    "==",
    (value) => symbol(compiler, value, magnitudeName),
    (value) => integerLiteral(compiler, value, "0"),
  ) || !(right instanceof compiler.AST_Binary) || right.operator !== "==" ||
      !integerLiteral(compiler, right.right, "0")) return null;
  return lexicalName(compiler, right.left);
}

function normalizedDelta(
  compiler: any,
  node: any,
  componentName: string,
  maximumName: string,
): string | null {
  if (!(node instanceof compiler.AST_Binary) || node.operator !== "*" ||
      !(node.left instanceof compiler.AST_Binary) ||
      node.left.operator !== "/" ||
      !floatOf(compiler, node.left.left, componentName) ||
      !symbol(compiler, node.left.right, maximumName)) return null;
  return lexicalName(compiler, node.right);
}

function dividedByTwo(
  compiler: any,
  node: any,
  name: string,
): boolean {
  return binary(
    compiler,
    node,
    "/",
    (value) => symbol(compiler, value, name),
    (value) => integerLiteral(compiler, value, "2"),
  );
}

function pivotCoordinates(
  compiler: any,
  node: any,
  xName: string,
  yName: string,
  dxName: string,
  dyName: string,
): { pivotName: string; x0Name: string; y0Name: string } | null {
  if (!(node instanceof compiler.AST_If) ||
      !(node.alternative instanceof compiler.AST_If)) return null;
  const tip = node.alternative;
  if (!(tip.alternative instanceof compiler.AST_BlockStatement) ||
      !binary(
        compiler,
        node.condition,
        "==",
        () => true,
        (value) => value instanceof compiler.AST_String &&
          value.value === "middle",
      ) || !binary(
        compiler,
        tip.condition,
        "==",
        () => true,
        (value) => value instanceof compiler.AST_String && value.value === "tip",
      )) return null;
  const pivotName = lexicalName(compiler, node.condition.left);
  if (!pivotName || !symbol(compiler, tip.condition.left, pivotName)) return null;
  const middle = node.body?.body?.length === 1
    ? pairAssignment(compiler, node.body.body[0])
    : null;
  const tipPair = tip.body?.body?.length === 1
    ? pairAssignment(compiler, tip.body.body[0])
    : null;
  const tail = tip.alternative.body?.length === 1
    ? pairAssignment(compiler, tip.alternative.body[0])
    : null;
  if (!middle || !tipPair || !tail ||
      JSON.stringify(middle.names) !== JSON.stringify(tipPair.names) ||
      JSON.stringify(middle.names) !== JSON.stringify(tail.names)) return null;
  const [middleX, middleY] = middle.values;
  const [tipX, tipY] = tipPair.values;
  const [tailX, tailY] = tail.values;
  if (!binary(
        compiler,
        middleX,
        "-",
        (value) => floatOf(compiler, value, xName),
        (value) => dividedByTwo(compiler, value, dxName),
      ) || !binary(
        compiler,
        middleY,
        "-",
        (value) => floatOf(compiler, value, yName),
        (value) => dividedByTwo(compiler, value, dyName),
      ) || !binary(
        compiler,
        tipX,
        "-",
        (value) => floatOf(compiler, value, xName),
        (value) => symbol(compiler, value, dxName),
      ) || !binary(
        compiler,
        tipY,
        "-",
        (value) => floatOf(compiler, value, yName),
        (value) => symbol(compiler, value, dyName),
      ) || !floatOf(compiler, tailX, xName) ||
      !floatOf(compiler, tailY, yName)) return null;
  return {
    pivotName,
    x0Name: middle.names[0],
    y0Name: middle.names[1],
  };
}

function endpointAssignment(
  compiler: any,
  statement: any,
  x0Name: string,
  y0Name: string,
  dxName: string,
  dyName: string,
): { x1Name: string; y1Name: string } | null {
  const pair = pairAssignment(compiler, statement);
  if (!pair || !binary(
        compiler,
        pair.values[0],
        "+",
        (value) => symbol(compiler, value, x0Name),
        (value) => symbol(compiler, value, dxName),
      ) || !binary(
        compiler,
        pair.values[1],
        "+",
        (value) => symbol(compiler, value, y0Name),
        (value) => symbol(compiler, value, dyName),
      )) return null;
  return { x1Name: pair.names[0], y1Name: pair.names[1] };
}

function extendTuple(
  compiler: any,
  statement: any,
  values: readonly ((value: any) => boolean)[],
): string | null {
  const call = simpleBody(compiler, statement);
  if (!(call instanceof compiler.AST_Call) || !exactCallArguments(call, 1) ||
      !(call.expression instanceof compiler.AST_Dot) ||
      call.expression.property !== "extend" ||
      !(call.args[0] instanceof compiler.AST_Array) ||
      call.args[0].is_tuple !== true ||
      call.args[0].elements?.length !== values.length) return null;
  const outputName = lexicalName(compiler, call.expression.expression);
  if (!outputName || !values.every((matches, index) =>
    matches(call.args[0].elements[index]))) return null;
  return outputName;
}

function multiplication3(
  compiler: any,
  node: any,
  first: (value: any) => boolean,
  secondName: string,
  thirdName: string,
): boolean {
  return binary(
    compiler,
    node,
    "*",
    (left) => binary(
      compiler,
      left,
      "*",
      first,
      (value) => symbol(compiler, value, secondName),
    ),
    (value) => symbol(compiler, value, thirdName),
  );
}

function headGeometry(
  compiler: any,
  node: any,
  names: {
    u: string;
    v: string;
    magnitude: string;
    dx: string;
    dy: string;
    x1: string;
    y1: string;
    xOutput: string;
    yOutput: string;
  },
): boolean {
  if (!(node instanceof compiler.AST_If) || node.alternative != null ||
      !(node.condition instanceof compiler.AST_Binary) ||
      node.condition.operator !== "&&" || node.body?.body?.length !== 8) {
    return false;
  }
  const widthTest = node.condition.left;
  const lengthTest = node.condition.right;
  if (!(widthTest instanceof compiler.AST_Binary) || widthTest.operator !== ">" ||
      !(lengthTest instanceof compiler.AST_Binary) || lengthTest.operator !== ">" ||
      !integerLiteral(compiler, widthTest.right, "0") ||
      !integerLiteral(compiler, lengthTest.right, "0")) return false;
  const headWidth = lexicalName(compiler, widthTest.left);
  const headLength = lexicalName(compiler, lengthTest.left);
  if (!headWidth || !headLength || headWidth === headLength) return false;
  const body = node.body.body;
  const units = pairAssignment(compiler, body[0]);
  if (!units || !binary(
        compiler,
        units.values[0],
        "/",
        (value) => floatOf(compiler, value, names.u),
        (value) => symbol(compiler, value, names.magnitude),
      ) || !binary(
        compiler,
        units.values[1],
        "/",
        (value) => floatOf(compiler, value, names.v),
        (value) => symbol(compiler, value, names.magnitude),
      )) return false;
  const backX = symbolAssignment(compiler, body[1]);
  const backY = symbolAssignment(compiler, body[2]);
  if (!backX || !backY || !binary(
        compiler,
        backX.value,
        "-",
        (value) => symbol(compiler, value, names.x1),
        (value) => binary(
          compiler,
          value,
          "*",
          (part) => symbol(compiler, part, names.dx),
          (part) => symbol(compiler, part, headLength),
        ),
      ) || !binary(
        compiler,
        backY.value,
        "-",
        (value) => symbol(compiler, value, names.y1),
        (value) => binary(
          compiler,
          value,
          "*",
          (part) => symbol(compiler, part, names.dy),
          (part) => symbol(compiler, part, headLength),
        ),
      )) return false;
  const arrowLength = symbolAssignment(compiler, body[3]);
  const sideX = symbolAssignment(compiler, body[4]);
  const sideY = symbolAssignment(compiler, body[5]);
  if (!arrowLength || !mathHypot(
        compiler,
        arrowLength.value,
        (value) => symbol(compiler, value, names.dx),
        (value) => symbol(compiler, value, names.dy),
      ) || !sideX || !multiplication3(
        compiler,
        sideX.value,
        (value) => value instanceof compiler.AST_UnaryPrefix &&
          value.operator === "-" && symbol(compiler, value.expression, units.names[1]),
        arrowLength.name,
        headWidth,
      ) || !sideY || !multiplication3(
        compiler,
        sideY.value,
        (value) => symbol(compiler, value, units.names[0]),
        arrowLength.name,
        headWidth,
      )) return false;
  const xOutput = extendTuple(compiler, body[6], [
    (value) => binary(
      compiler,
      value,
      "+",
      (part) => symbol(compiler, part, backX.name),
      (part) => symbol(compiler, part, sideX.name),
    ),
    (value) => symbol(compiler, value, names.x1),
    (value) => binary(
      compiler,
      value,
      "-",
      (part) => symbol(compiler, part, backX.name),
      (part) => symbol(compiler, part, sideX.name),
    ),
    (value) => value instanceof compiler.AST_Null,
  ]);
  const yOutput = extendTuple(compiler, body[7], [
    (value) => binary(
      compiler,
      value,
      "+",
      (part) => symbol(compiler, part, backY.name),
      (part) => symbol(compiler, part, sideY.name),
    ),
    (value) => symbol(compiler, value, names.y1),
    (value) => binary(
      compiler,
      value,
      "-",
      (part) => symbol(compiler, part, backY.name),
      (part) => symbol(compiler, part, sideY.name),
    ),
    (value) => value instanceof compiler.AST_Null,
  ]);
  return xOutput === names.xOutput && yOutput === names.yOutput;
}

function rowValidation(
  compiler: any,
  node: any,
  uRowName: string,
  vRowName: string,
): boolean {
  const exactListTest = (value: any, rowName: string): boolean =>
    value instanceof compiler.AST_UnaryPrefix && value.operator === "!" &&
    binary(
      compiler,
      value.expression,
      "instanceof",
      (left) => symbol(compiler, left, rowName),
      (right) => right instanceof compiler.AST_SymbolRef &&
        right.name === "list" && right.python_lexical_binding === false,
    );
  const thrown = node?.body?.body?.[0];
  const error = thrown instanceof compiler.AST_Throw ? thrown.value : null;
  return node instanceof compiler.AST_If && node.alternative == null &&
    binary(
      compiler,
      node.condition,
      "||",
      (value) => exactListTest(value, uRowName),
      (value) => exactListTest(value, vRowName),
    ) && node.body instanceof compiler.AST_BlockStatement &&
    node.body.body?.length === 1 && error instanceof compiler.AST_New &&
    exactCallArguments(error, 1) &&
    error.expression instanceof compiler.AST_SymbolRef &&
    error.expression.name === "TypeError" &&
    error.expression.python_lexical_binding === false &&
    error.expression.python_resolution_provenance === "module" &&
    error.args[0] instanceof compiler.AST_String;
}

/**
 * Recognize the exact semantic grid-geometry shape without consulting a file
 * path, function name, or application name.  This records syntax and lexical
 * relationships only; every identity, representation, effect, and restart
 * property required by a lowering remains an explicit proof gap.
 */
export function recognizeArrowSegmentGeometryProgram(
  compiler: any,
  node: any,
  ancestors: readonly any[],
): ArrowSegmentGeometryRecognition {
  const inner = enumeratedLoop(compiler, node);
  if (!inner || node.body?.body?.length !== 12) {
    return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  }
  const outerLoop = [...ancestors].reverse().find((ancestor) =>
    ancestor instanceof compiler.AST_ForIn
  );
  const outer = enumeratedLoop(compiler, outerLoop);
  const outerBody = outerLoop?.body?.body;
  if (!outer || !Array.isArray(outerBody) || outerBody.length !== 4 ||
      outerBody[3] !== node) {
    return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  }
  const uRow = symbolAssignment(compiler, outerBody[0]);
  const vRow = symbolAssignment(compiler, outerBody[1]);
  if (!uRow || !vRow || !itemAt(
        compiler,
        uRow.value,
        lexicalName(compiler, uRow.value?.expression) ?? "",
        outer.indexName,
      ) || !itemAt(
        compiler,
        vRow.value,
        lexicalName(compiler, vRow.value?.expression) ?? "",
        outer.indexName,
      ) || !rowValidation(compiler, outerBody[2], uRow.name, vRow.name)) {
    return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  }
  const uGridName = lexicalName(compiler, uRow.value.expression);
  const vGridName = lexicalName(compiler, vRow.value.expression);
  if (!uGridName || !vGridName || uGridName === vGridName) {
    return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  }

  const body = node.body.body;
  const u = symbolAssignment(compiler, body[0]);
  const v = symbolAssignment(compiler, body[1]);
  if (!u || !v || u.name === v.name ||
      !itemAt(compiler, u.value, uRow.name, inner.indexName) ||
      !itemAt(compiler, v.value, vRow.name, inner.indexName) ||
      !nullSkip(compiler, body[2], u.name, v.name)) {
    return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  }
  const magnitude = symbolAssignment(compiler, body[3]);
  if (!magnitude || !mathHypot(
        compiler,
        magnitude.value,
        (value) => floatOf(compiler, value, u.name),
        (value) => floatOf(compiler, value, v.name),
      )) return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  const maximumName = zeroSkip(compiler, body[4], magnitude.name);
  const dx = symbolAssignment(compiler, body[5]);
  const dy = symbolAssignment(compiler, body[6]);
  if (!maximumName || !dx || !dy || dx.name === dy.name) {
    return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  }
  const extentName = normalizedDelta(
    compiler,
    dx.value,
    u.name,
    maximumName,
  );
  if (!extentName || normalizedDelta(
        compiler,
        dy.value,
        v.name,
        maximumName,
      ) !== extentName) {
    return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  }
  const pivot = pivotCoordinates(
    compiler,
    body[7],
    inner.valueName,
    outer.valueName,
    dx.name,
    dy.name,
  );
  if (!pivot) return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  const endpoint = endpointAssignment(
    compiler,
    body[8],
    pivot.x0Name,
    pivot.y0Name,
    dx.name,
    dy.name,
  );
  if (!endpoint) {
    return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  }
  const xOutputName = extendTuple(compiler, body[9], [
    (value) => symbol(compiler, value, pivot.x0Name),
    (value) => symbol(compiler, value, endpoint.x1Name),
    (value) => value instanceof compiler.AST_Null,
  ]);
  const yOutputName = extendTuple(compiler, body[10], [
    (value) => symbol(compiler, value, pivot.y0Name),
    (value) => symbol(compiler, value, endpoint.y1Name),
    (value) => value instanceof compiler.AST_Null,
  ]);
  if (!xOutputName || !yOutputName || xOutputName === yOutputName ||
      !headGeometry(compiler, body[11], {
        u: u.name,
        v: v.name,
        magnitude: magnitude.name,
        dx: dx.name,
        dy: dy.name,
        x1: endpoint.x1Name,
        y1: endpoint.y1Name,
        xOutput: xOutputName,
        yOutput: yOutputName,
      })) return { recognized: false, reason: "not-arrow-segment-geometry-shape" };

  const roleNames = [
    inner.indexName, inner.valueName, inner.sequenceName,
    outer.indexName, outer.valueName, outer.sequenceName,
    uGridName, vGridName, uRow.name, vRow.name, u.name, v.name,
    magnitude.name, maximumName, dx.name, dy.name, extentName,
    pivot.pivotName, pivot.x0Name, pivot.y0Name,
    endpoint.x1Name, endpoint.y1Name, xOutputName, yOutputName,
  ];
  if (new Set(roleNames).size !== roleNames.length) {
    return { recognized: false, reason: "not-arrow-segment-geometry-shape" };
  }
  const ownerFunction = [...ancestors].reverse().find((ancestor) =>
    ancestor instanceof compiler.AST_Function
  );
  const ownerBody = ownerFunction?.body;
  const outerIndex = Array.isArray(ownerBody) ? ownerBody.indexOf(outerLoop) : -1;
  const loopTargets = new Set([
    outer.indexName, outer.valueName, inner.indexName, inner.valueName,
  ]);
  if (outerIndex < 0 ||
      !freshOutputBeforeLoop(compiler, ownerBody, outerIndex, xOutputName) ||
      !freshOutputBeforeLoop(compiler, ownerBody, outerIndex, yOutputName) ||
      ownerBody.slice(outerIndex + 1).some((statement: any) =>
        lexicalReferences(compiler, statement, loopTargets))) {
    return { recognized: false, reason: "not-transactionally-private-output-shape" };
  }
  return {
    recognized: true,
    outerLoop,
    operands: {
      iterable: outerLoop.object,
      xSequence: node.object.args[0],
      ySequence: outerLoop.object.args[0],
      uGrid: uRow.value.expression,
      vGrid: vRow.value.expression,
      maximum: body[4].condition.right.left,
      extent: dx.value.right,
      pivot: body[7].condition.left,
      headLength: body[11].condition.right.left,
      headWidth: body[11].condition.left.left,
      hypot: magnitude.value.expression,
      xOutput: body[9].body.expression.expression,
      yOutput: body[10].body.expression.expression,
    },
    program: {
      version: 1,
      kind: "closed-transactional-rectangular-binary64-dataflow",
      variant: "arrow-segment-stream",
      traversalKind: "nested-enumerated-parallel-grid-rows",
      requiredContext: "enclosing-outer-row-loop",
      selectionUnit: "two-level-transactional-loop-program",
      primaryRegionKind: "fused-outer-loop",
      hotChildRegionKind: "profiled-inner-loop",
      hotChildSource: sourceRegion(node),
      publicationKind: "paired-segment-stream-candidate",
      xSequenceName: inner.sequenceName,
      ySequenceName: outer.sequenceName,
      uGridName,
      vGridName,
      xOutputName,
      yOutputName,
      pivotName: pivot.pivotName,
      operations: [...arrowSegmentGeometryOperations()],
      proofGaps: [...arrowSegmentGeometryProofGaps()],
    },
  };
}
