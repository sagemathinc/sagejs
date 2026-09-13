import { createSageCellController } from "./cell-controller.mjs";

export const DEFAULT_CELL_SESSION_LIMITS = Object.freeze({
  liveSessions: 16,
  sharedSessions: 8,
});

const SHARED_NAME = /^[A-Za-z0-9._:-]{1,128}$/;

function positiveLimit(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function normalizedLanguage(value) {
  if (value !== "sage" && value !== "python") {
    throw new TypeError("cell session language must be 'sage' or 'python'");
  }
  return value;
}

/** Create an instance-scoped pool suitable for tests or an isolated host. */
export function createCellSessionPool({
  controllerFactory = createSageCellController,
  limits: requestedLimits = DEFAULT_CELL_SESSION_LIMITS,
} = {}) {
  if (typeof controllerFactory !== "function") {
    throw new TypeError("cell session controller factory must be a function");
  }
  const limits = Object.freeze({
    liveSessions: positiveLimit(
      requestedLimits.liveSessions ?? DEFAULT_CELL_SESSION_LIMITS.liveSessions,
      "live session limit",
    ),
    sharedSessions: positiveLimit(
      requestedLimits.sharedSessions ?? DEFAULT_CELL_SESSION_LIMITS.sharedSessions,
      "shared session limit",
    ),
  });
  if (limits.sharedSessions > limits.liveSessions) {
    throw new RangeError("shared session limit cannot exceed the live session limit");
  }

  const records = new Set();
  const shared = new Map();

  function createRecord({
    name,
    language,
    downloadGraphics,
    renderWidgetOutput,
  }) {
    if (records.size >= limits.liveSessions) {
      throw new RangeError(
        `Sage.js Cell exceeds the ${limits.liveSessions} live-session limit`,
      );
    }
    const record = {
      activeOwner: undefined,
      closed: false,
      language,
      name,
      references: 0,
      tail: Promise.resolve(),
      widgetOwner: undefined,
    };
    record.controller = controllerFactory({
      sessionOptions: language === "python" ? { mode: "python" } : {},
      renderWidgetOutput: (outputItem, destination) =>
        renderWidgetOutput(record.widgetOwner, outputItem, destination),
      onGraphicsSave: (request) => {
        if (!record.activeOwner) {
          throw new Error("graphics export has no active Sage.js Cell owner");
        }
        return downloadGraphics(record.activeOwner, request);
      },
    });
    records.add(record);
    if (name) shared.set(name, record);
    return record;
  }

  function acquire({
    name,
    language = "sage",
    owner,
    downloadGraphics,
    renderWidgetOutput,
  } = {}) {
    language = normalizedLanguage(language);
    if (owner === undefined) throw new TypeError("cell session owner is required");
    if (typeof downloadGraphics !== "function") {
      throw new TypeError("cell graphics download handler must be a function");
    }
    if (typeof renderWidgetOutput !== "function") {
      throw new TypeError("cell widget output renderer must be a function");
    }
    if (name !== undefined && name !== null && !SHARED_NAME.test(name)) {
      throw new TypeError(
        "shared Sage.js Cell session names use 1–128 letters, digits, dots, underscores, colons, or hyphens",
      );
    }
    name = name || undefined;
    let record = name ? shared.get(name) : undefined;
    if (record && record.language !== language) {
      throw new TypeError(
        `shared Sage.js Cell session ${JSON.stringify(name)} already uses ${record.language} mode`,
      );
    }
    if (!record) {
      if (name && shared.size >= limits.sharedSessions) {
        throw new RangeError(
          `Sage.js Cell exceeds the ${limits.sharedSessions} named-session limit`,
        );
      }
      record = createRecord({
        name,
        language,
        downloadGraphics,
        renderWidgetOutput,
      });
    }
    record.references += 1;
    let released = false;

    async function run(source, options) {
      if (released || record.closed) throw new Error("Sage.js Cell session lease is closed");
      const previous = record.tail.catch(() => undefined);
      let finish;
      record.tail = new Promise((resolve) => { finish = resolve; });
      await previous;
      if (released || record.closed) {
        finish();
        throw new Error("Sage.js Cell session lease is closed");
      }
      record.activeOwner = owner;
      try {
        return await record.controller.run(source, options);
      } finally {
        record.activeOwner = undefined;
        finish();
      }
    }

    return Object.freeze({
      controller: record.controller,
      language,
      name,
      ready: () => record.controller.ready(),
      async renderWidget(data, destination) {
        record.widgetOwner = owner;
        return record.controller.widgetHost.render(data, destination);
      },
      run,
      async release() {
        if (released) return false;
        released = true;
        record.references -= 1;
        if (record.references !== 0) return false;
        record.closed = true;
        records.delete(record);
        if (name) shared.delete(name);
        await record.controller.dispose();
        return true;
      },
    });
  }

  return Object.freeze({
    acquire,
    stats() {
      return Object.freeze({
        limits,
        liveSessions: records.size,
        sharedSessions: shared.size,
        sessions: Object.freeze([...records].map((record) => Object.freeze({
          busy: record.activeOwner !== undefined,
          language: record.language,
          name: record.name,
          references: record.references,
        }))),
      });
    },
  });
}

const defaultPool = createCellSessionPool();

export function acquireSageCellSession(options) {
  return defaultPool.acquire(options);
}

export function sageCellSessionStats() {
  return defaultPool.stats();
}
