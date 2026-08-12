/**
 * High-resolution execution timing shared by the REPL, kernel, and generated
 * `%time` statements.
 *
 * Compilation and result formatting deliberately live outside this module's
 * execution boundary. Lazy initialization performed while user code runs is
 * recorded as a nested tree so a cold timing remains honest without charging
 * subsequent calls for work they did not perform.
 */

export interface CpuTiming {
  userMs: number;
  systemMs: number;
  totalMs: number;
}

export interface InitializationTiming {
  label: string;
  wallMs: number;
  children: InitializationTiming[];
}

export interface ExecutionTiming {
  wallMs: number;
  cpu?: CpuTiming;
  initialization: InitializationTiming[];
}

export interface TimeitOptions {
  /** Number of executions in each measured run. Calibrated when omitted. */
  number?: number;
  /** Number of measured runs. */
  repeat?: number;
}

export interface TimeitResult {
  number: number;
  repeat: number;
  /** Total wall time of each measured run, in milliseconds. */
  runsMs: number[];
  /** Arithmetic mean wall time per execution, in milliseconds. */
  meanMs: number;
  /** Population standard deviation per execution, in milliseconds. */
  standardDeviationMs: number;
  /** The untimed warmup, including any lazy initialization it triggered. */
  warmup: ExecutionTiming;
}

export interface TimeitPolicy {
  /** High-resolution monotonic clock returning milliseconds. */
  now?: () => number;
  /** Minimum wall time sought by automatic loop calibration. */
  calibrationTargetMs?: number;
  /** Hard bound on automatic calibration. */
  maximumNumber?: number;
}

export interface TimeitDirective {
  source: string;
  options: TimeitOptions;
}

export interface TimingHookOptions {
  /** Override calibration only for a controlled embedding or deterministic test. */
  timeitPolicy?: TimeitPolicy;
}

const DEFAULT_TIMEIT_REPEAT = 7;
const DEFAULT_TIMEIT_CALIBRATION_TARGET_MS = 200;
const DEFAULT_TIMEIT_MAXIMUM_NUMBER = 100_000_000;

interface CpuSnapshot {
  user: number;
  system: number;
}

interface MutableInitializationTiming extends InitializationTiming {
  startedAt: number;
  finished: boolean;
}

class TimingCollector {
  readonly startedAt = highResolutionNow();
  readonly cpuStartedAt = cpuSnapshot();
  readonly initialization: MutableInitializationTiming[] = [];
  readonly initializationStack: MutableInitializationTiming[] = [];
  finished = false;

  beginInitialization(label: string): MutableInitializationTiming {
    const span: MutableInitializationTiming = {
      label,
      wallMs: 0,
      children: [],
      startedAt: highResolutionNow(),
      finished: false,
    };
    const parent = this.initializationStack.at(-1);
    if (parent) parent.children.push(span);
    else this.initialization.push(span);
    this.initializationStack.push(span);
    return span;
  }

  finishInitialization(span: MutableInitializationTiming): void {
    if (span.finished) return;
    span.wallMs = Math.max(0, highResolutionNow() - span.startedAt);
    span.finished = true;
    const index = this.initializationStack.lastIndexOf(span);
    if (index >= 0) this.initializationStack.splice(index, 1);
  }

  finish(): ExecutionTiming {
    if (this.finished) {
      throw new Error("execution timing has already finished");
    }
    this.finished = true;
    while (this.initializationStack.length > 0) {
      this.finishInitialization(this.initializationStack.at(-1)!);
    }
    const wallMs = Math.max(0, highResolutionNow() - this.startedAt);
    const cpuFinishedAt = cpuSnapshot();
    let cpu: CpuTiming | undefined;
    if (this.cpuStartedAt && cpuFinishedAt) {
      const userMs = Math.max(
        0,
        (cpuFinishedAt.user - this.cpuStartedAt.user) / 1_000,
      );
      const systemMs = Math.max(
        0,
        (cpuFinishedAt.system - this.cpuStartedAt.system) / 1_000,
      );
      cpu = { userMs, systemMs, totalMs: userMs + systemMs };
    }
    return {
      wallMs,
      cpu,
      initialization: this.initialization.map(freezeInitializationTiming),
    };
  }
}

export interface ExecutionTimingToken {
  readonly collector: TimingCollector;
  readonly previous?: TimingCollector;
  finished: boolean;
}

export interface InitializationTimingToken {
  readonly collector: TimingCollector;
  readonly span: MutableInitializationTiming;
}

let activeCollector: TimingCollector | undefined;

function highResolutionNow(): number {
  const hostPerformance = Reflect.get(globalThis, "performance");
  const now = hostPerformance && Reflect.get(hostPerformance, "now");
  return typeof now === "function"
    ? Number(Reflect.apply(now, hostPerformance, []))
    : Date.now();
}

function checkedPositiveInteger(
  value: string,
  option: "number" | "repeat",
): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new TypeError(`%timeit ${option} must be a positive integer`);
  }
  const answer = Number(value);
  if (!Number.isSafeInteger(answer) || answer <= 0) {
    throw new RangeError(`%timeit ${option} must be a positive safe integer`);
  }
  return answer;
}

/** Parse the interactive `%timeit` prefix without changing body semantics. */
export function parseTimeitDirective(
  source: string,
): TimeitDirective | undefined {
  const prefix = source.match(/^[ \t]*%timeit(?:[ \t]+|$)/);
  if (!prefix) return undefined;
  let rest = source.slice(prefix[0].length);
  const options: TimeitOptions = {};

  while (rest.length > 0) {
    const separator = rest.match(/^--(?:[ \t]+|$)/);
    if (separator) {
      rest = rest.slice(separator[0].length);
      break;
    }
    const long = rest.match(
      /^--(number|repeat)(?:=|[ \t]+)([^ \t\r\n]+)(?:[ \t]+|$)/,
    );
    if (long) {
      const key = long[1] as "number" | "repeat";
      options[key] = checkedPositiveInteger(long[2], key);
      rest = rest.slice(long[0].length);
      continue;
    }
    const compact = rest.match(/^-([nr])([0-9]+)(?:[ \t]+|$)/);
    if (compact) {
      const key = compact[1] === "n" ? "number" : "repeat";
      options[key] = checkedPositiveInteger(compact[2], key);
      rest = rest.slice(compact[0].length);
      continue;
    }
    const split = rest.match(/^-([nr])[ \t]+([^ \t\r\n]+)(?:[ \t]+|$)/);
    if (split) {
      const key = split[1] === "n" ? "number" : "repeat";
      options[key] = checkedPositiveInteger(split[2], key);
      rest = rest.slice(split[0].length);
      continue;
    }
    if (/^-(?:[A-Za-z]|-[A-Za-z])/.test(rest)) {
      throw new TypeError(`unsupported or incomplete %timeit option in ${rest}`);
    }
    break;
  }

  if (!rest.trim()) throw new TypeError("%timeit requires a statement");
  return { source: rest, options };
}

type TimeitStage = "warmup" | "calibration" | "samples" | "done";

class TimeitController {
  readonly repeat: number;
  readonly now: () => number;
  readonly target: number;
  readonly maximumNumber: number;
  readonly runsMs: number[] = [];
  number: number;
  stage: TimeitStage = "warmup";
  warmup?: ExecutionTiming;
  warmupToken?: ExecutionTimingToken;
  batchStartedAt?: number;

  constructor(options: TimeitOptions, policy: TimeitPolicy) {
    this.repeat = options.repeat ?? DEFAULT_TIMEIT_REPEAT;
    if (!Number.isSafeInteger(this.repeat) || this.repeat <= 0) {
      throw new RangeError("%timeit repeat must be a positive safe integer");
    }
    if (
      options.number !== undefined &&
      (!Number.isSafeInteger(options.number) || options.number <= 0)
    ) {
      throw new RangeError("%timeit number must be a positive safe integer");
    }
    this.number = options.number ?? 1;
    this.now = policy.now ?? highResolutionNow;
    this.target = policy.calibrationTargetMs ??
      DEFAULT_TIMEIT_CALIBRATION_TARGET_MS;
    this.maximumNumber = policy.maximumNumber ??
      DEFAULT_TIMEIT_MAXIMUM_NUMBER;
    if (!(this.target >= 0) || !Number.isFinite(this.target)) {
      throw new RangeError(
        "%timeit calibration target must be finite and nonnegative",
      );
    }
    if (
      !Number.isSafeInteger(this.maximumNumber) ||
      this.maximumNumber <= 0
    ) {
      throw new RangeError(
        "%timeit maximum number must be a positive safe integer",
      );
    }
    if (options.number !== undefined) this.stageAfterWarmup = "samples";
  }

  private stageAfterWarmup: TimeitStage = "calibration";

  beginBatch(): number | undefined {
    if (this.stage === "done") return undefined;
    if (this.batchStartedAt !== undefined) {
      throw new Error("%timeit batch is already active");
    }
    if (this.stage === "warmup") {
      this.warmupToken = startExecutionTiming();
    }
    this.batchStartedAt = this.now();
    return this.stage === "warmup" ? 1 : this.number;
  }

  finishBatch(): void {
    if (this.batchStartedAt === undefined) {
      throw new Error("%timeit has no active batch");
    }
    const elapsed = Math.max(0, this.now() - this.batchStartedAt);
    this.batchStartedAt = undefined;
    if (this.stage === "warmup") {
      this.warmup = finishExecutionTiming(this.warmupToken!);
      this.warmupToken = undefined;
      this.stage = this.stageAfterWarmup;
      return;
    }
    if (this.stage === "calibration") {
      if (elapsed >= this.target || this.number >= this.maximumNumber) {
        this.stage = "samples";
      } else {
        this.number = Math.min(this.maximumNumber, this.number * 10);
      }
      return;
    }
    this.runsMs.push(elapsed);
    if (this.runsMs.length >= this.repeat) this.stage = "done";
  }

  abort(): void {
    if (this.warmupToken && !this.warmupToken.finished) {
      finishExecutionTiming(this.warmupToken);
    }
    this.warmupToken = undefined;
    this.batchStartedAt = undefined;
    this.stage = "done";
  }

  result(): TimeitResult {
    if (this.stage !== "done" || !this.warmup) {
      throw new Error("%timeit has not completed");
    }
    const perLoopMs = this.runsMs.map((elapsed) => elapsed / this.number);
    const meanMs =
      perLoopMs.reduce((sum, value) => sum + value, 0) / this.repeat;
    const variance = perLoopMs.reduce(
      (sum, value) => sum + (value - meanMs) ** 2,
      0,
    ) / this.repeat;
    return {
      number: this.number,
      repeat: this.repeat,
      runsMs: [...this.runsMs],
      meanMs,
      standardDeviationMs: Math.sqrt(variance),
      warmup: this.warmup,
    };
  }
}

/**
 * Benchmark a precompiled batch executor.
 *
 * `runBatch(number)` must execute the already-compiled statement exactly
 * `number` times. Compilation therefore stays outside warmup, calibration,
 * and samples. One warmup execution occurs before calibration and samples so
 * normal lazy module/native initialization is not silently counted as steady
 * state work.
 */
export function runTimeit(
  runBatch: (number: number) => void,
  options: TimeitOptions = {},
  policy: TimeitPolicy = {},
): TimeitResult {
  const controller = new TimeitController(options, policy);
  try {
    let number: number | undefined;
    while ((number = controller.beginBatch()) !== undefined) {
      runBatch(number);
      controller.finishBatch();
    }
  } catch (error) {
    controller.abort();
    throw error;
  }
  return controller.result();
}

function cpuSnapshot(): CpuSnapshot | undefined {
  const hostProcess = Reflect.get(globalThis, "process");
  const cpuUsage = hostProcess && Reflect.get(hostProcess, "cpuUsage");
  if (typeof cpuUsage !== "function") return undefined;
  const value = Reflect.apply(cpuUsage, hostProcess, []);
  return value &&
      typeof value.user === "number" &&
      typeof value.system === "number"
    ? { user: value.user, system: value.system }
    : undefined;
}

function freezeInitializationTiming(
  span: MutableInitializationTiming,
): InitializationTiming {
  return {
    label: span.label,
    wallMs: span.wallMs,
    children: span.children.map((child) =>
      freezeInitializationTiming(child as MutableInitializationTiming)
    ),
  };
}

/** Begin an execution-only timing boundary. */
export function startExecutionTiming(): ExecutionTimingToken {
  const token: ExecutionTimingToken = {
    collector: new TimingCollector(),
    previous: activeCollector,
    finished: false,
  };
  activeCollector = token.collector;
  return token;
}

/** Finish a boundary created by `startExecutionTiming`. */
export function finishExecutionTiming(
  token: ExecutionTimingToken,
): ExecutionTiming {
  if (token.finished) throw new Error("execution timing token is already closed");
  token.finished = true;
  if (activeCollector === token.collector) activeCollector = token.previous;
  return token.collector.finish();
}

/** Time one synchronous execution and restore the previous nested collector. */
export function measureExecution<T>(callback: () => T): {
  value: T;
  timing: ExecutionTiming;
} {
  const token = startExecutionTiming();
  try {
    const value = callback();
    return { value, timing: finishExecutionTiming(token) };
  } catch (error) {
    finishExecutionTiming(token);
    throw error;
  }
}

/** Begin a lazy-initialization span when an execution timing is active. */
export function beginInitializationTiming(
  label: string,
): InitializationTimingToken | undefined {
  if (!activeCollector) return undefined;
  return {
    collector: activeCollector,
    span: activeCollector.beginInitialization(label),
  };
}

/** Finish a span returned by `beginInitializationTiming`. */
export function finishInitializationTiming(
  token: InitializationTimingToken | undefined,
): void {
  token?.collector.finishInitialization(token.span);
}

/** Record one synchronous lazy-initialization operation. */
export function measureInitialization<T>(label: string, callback: () => T): T {
  const token = beginInitializationTiming(label);
  try {
    return callback();
  } finally {
    finishInitializationTiming(token);
  }
}

function formatMilliseconds(value: number): string {
  return `${value.toFixed(3)}ms`;
}

function formatSignificant(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.max(0, 2 - magnitude);
  return value.toFixed(decimals);
}

function timeitUnit(milliseconds: number): {
  label: "ns" | "µs" | "ms" | "s";
  scale: number;
} {
  if (milliseconds < 0.001) return { label: "ns", scale: 1_000_000 };
  if (milliseconds < 1) return { label: "µs", scale: 1_000 };
  if (milliseconds < 1_000) return { label: "ms", scale: 1 };
  return { label: "s", scale: 0.001 };
}

function formatInitializationLines(
  spans: readonly InitializationTiming[],
  depth: number,
): string[] {
  const lines: string[] = [];
  for (const span of spans) {
    lines.push(
      `${"  ".repeat(depth)}${span.label}: ${formatMilliseconds(span.wallMs)}`,
    );
    lines.push(...formatInitializationLines(span.children, depth + 1));
  }
  return lines;
}

/** Format timing output using Sage's CPU-plus-wall shape. */
export function formatExecutionTiming(timing: ExecutionTiming): string {
  const lines: string[] = [];
  if (timing.cpu) {
    lines.push(
      `CPU times: user ${formatMilliseconds(timing.cpu.userMs)}, ` +
        `sys: ${formatMilliseconds(timing.cpu.systemMs)}, ` +
        `total: ${formatMilliseconds(timing.cpu.totalMs)}`,
    );
  }
  lines.push(`Wall time: ${formatMilliseconds(timing.wallMs)}`);
  if (timing.initialization.length > 0) {
    const total = timing.initialization.reduce(
      (sum, span) => sum + span.wallMs,
      0,
    );
    lines.push(`Initialization: ${formatMilliseconds(total)}`);
    lines.push(...formatInitializationLines(timing.initialization, 1));
  }
  return lines.join("\n");
}

/** Format a calibrated result using the familiar IPython `%timeit` shape. */
export function formatTimeitResult(result: TimeitResult): string {
  const unit = timeitUnit(result.meanMs);
  const mean = formatSignificant(result.meanMs * unit.scale);
  const displayDeviation =
    result.standardDeviationMs <= Math.abs(result.meanMs) * 1e-12
      ? 0
      : result.standardDeviationMs;
  const deviation = formatSignificant(
    displayDeviation * unit.scale,
  );
  const loopWord = result.number === 1 ? "loop" : "loops";
  const runWord = result.repeat === 1 ? "run" : "runs";
  const lines = [
    `${mean} ${unit.label} ± ${deviation} ${unit.label} per loop ` +
      `(mean ± std. dev. of ${result.repeat} ${runWord}, ` +
      `${result.number.toLocaleString("en-US")} ${loopWord} each)`,
  ];
  if (result.warmup.initialization.length > 0) {
    const total = result.warmup.initialization.reduce(
      (sum, span) => sum + span.wallMs,
      0,
    );
    lines.push(`Initialization (warmup only): ${formatMilliseconds(total)}`);
    lines.push(...formatInitializationLines(result.warmup.initialization, 1));
  }
  return lines.join("\n");
}

/**
 * Install hooks used by compiler-emitted `%time` and `%timeit` statements.
 *
 * The returned cleanup restores any prior host hooks, which matters for test
 * workers that create more than one isolated evaluator in the same realm.
 */
export function installTimingHooks(
  target: Record<PropertyKey, unknown>,
  write: (text: string) => void,
  hookOptions: TimingHookOptions = {},
): () => void {
  const startName = "__sagejs_timing_start__";
  const finishName = "__sagejs_timing_finish__";
  const timeitStartName = "__sagejs_timeit_start__";
  const timeitBeginName = "__sagejs_timeit_begin__";
  const timeitEndName = "__sagejs_timeit_end__";
  const timeitFinishName = "__sagejs_timeit_finish__";
  const timeitAbortName = "__sagejs_timeit_abort__";
  const timeitNames = [
    timeitStartName,
    timeitBeginName,
    timeitEndName,
    timeitFinishName,
    timeitAbortName,
  ];
  const previousStart = Reflect.getOwnPropertyDescriptor(target, startName);
  const previousFinish = Reflect.getOwnPropertyDescriptor(target, finishName);
  const previousTimeit = new Map(
    timeitNames.map((name) => [
      name,
      Reflect.getOwnPropertyDescriptor(target, name),
    ]),
  );
  Reflect.set(target, startName, startExecutionTiming);
  Reflect.set(target, finishName, (token: ExecutionTimingToken) => {
    const timing = finishExecutionTiming(token);
    write(formatExecutionTiming(timing));
    return timing;
  });
  Reflect.set(target, timeitStartName, (rawOptions?: TimeitOptions) => {
    const timeitOptions = rawOptions ?? {};
    return new TimeitController(
      {
        number: timeitOptions.number ?? undefined,
        repeat: timeitOptions.repeat ?? undefined,
      },
      hookOptions.timeitPolicy ?? {},
    );
  });
  Reflect.set(target, timeitBeginName, (controller: TimeitController) =>
    controller.beginBatch() ?? 0
  );
  Reflect.set(target, timeitEndName, (controller: TimeitController) =>
    controller.finishBatch()
  );
  Reflect.set(target, timeitFinishName, (controller: TimeitController) => {
    write(formatTimeitResult(controller.result()));
  });
  Reflect.set(target, timeitAbortName, (controller: TimeitController) =>
    controller.abort()
  );
  return () => {
    if (previousStart) Reflect.defineProperty(target, startName, previousStart);
    else Reflect.deleteProperty(target, startName);
    if (previousFinish) Reflect.defineProperty(target, finishName, previousFinish);
    else Reflect.deleteProperty(target, finishName);
    for (const name of timeitNames) {
      const descriptor = previousTimeit.get(name);
      if (descriptor) Reflect.defineProperty(target, name, descriptor);
      else Reflect.deleteProperty(target, name);
    }
  };
}
