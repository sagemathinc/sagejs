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

/**
 * Install hooks used by compiler-emitted `%time` statements.
 *
 * The returned cleanup restores any prior host hooks, which matters for test
 * workers that create more than one isolated evaluator in the same realm.
 */
export function installTimingHooks(
  target: Record<PropertyKey, unknown>,
  write: (text: string) => void,
): () => void {
  const startName = "__sagejs_timing_start__";
  const finishName = "__sagejs_timing_finish__";
  const previousStart = Reflect.getOwnPropertyDescriptor(target, startName);
  const previousFinish = Reflect.getOwnPropertyDescriptor(target, finishName);
  Reflect.set(target, startName, startExecutionTiming);
  Reflect.set(target, finishName, (token: ExecutionTimingToken) => {
    const timing = finishExecutionTiming(token);
    write(formatExecutionTiming(timing));
    return timing;
  });
  return () => {
    if (previousStart) Reflect.defineProperty(target, startName, previousStart);
    else Reflect.deleteProperty(target, startName);
    if (previousFinish) Reflect.defineProperty(target, finishName, previousFinish);
    else Reflect.deleteProperty(target, finishName);
  };
}
