const WIDGET_VIEW_MIME = "application/vnd.jupyter.widget-view+json";

export const DEFAULT_WIDGET_LIMITS = Object.freeze({
  liveModels: 512,
  liveViews: 512,
});

function normalizedLimits(limits = DEFAULT_WIDGET_LIMITS) {
  const answer = {};
  for (const name of ["liveModels", "liveViews"]) {
    const value = limits[name] ?? DEFAULT_WIDGET_LIMITS[name];
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`widget ${name} limit must be a positive safe integer`);
    }
    answer[name] = value;
  }
  return Object.freeze(answer);
}

function uuid() {
  return globalThis.crypto?.randomUUID?.().replaceAll("-", "") ??
    `sagejs${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function normalizedBuffers(buffers = []) {
  return buffers.map((buffer) => {
    if (buffer instanceof Uint8Array) return buffer;
    if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
    if (ArrayBuffer.isView(buffer)) {
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    throw new TypeError("widget buffers must be ArrayBuffer values or views");
  });
}

function assignBufferPath(root, path, buffer) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new TypeError("widget buffer paths must be nonempty arrays");
  }
  let target = root;
  for (const part of path.slice(0, -1)) {
    if (target === null || typeof target !== "object") {
      throw new TypeError("widget buffer path does not select a container");
    }
    target = target[part];
  }
  target[path.at(-1)] = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
}

function stateWithBuffers(state, paths = [], buffers = []) {
  const answer = structuredClone(state ?? {});
  const normalized = normalizedBuffers(buffers);
  if (paths.length !== normalized.length) {
    throw new TypeError("widget buffer_paths and buffers have different lengths");
  }
  for (let index = 0; index < paths.length; index += 1) {
    assignBufferPath(answer, paths[index], normalized[index]);
  }
  return answer;
}

function jupyterMessage(event, msgId = uuid()) {
  return {
    header: { msg_id: msgId, msg_type: event.type === "close" ? "comm_close" : "comm_msg" },
    parent_header: event.parentId ? { msg_id: event.parentId } : {},
    metadata: event.metadata ?? {},
    content: { comm_id: event.commId, data: event.data ?? {} },
    buffers: normalizedBuffers(event.buffers).map(
      (buffer) => new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    ),
  };
}

/**
 * Bridge a transport-neutral SageSession to the standard Jupyter widget
 * manager. The manager is loaded only after the first widget is displayed.
 */
export function createWidgetHost({
  session,
  loadManager,
  renderOutput,
  limits: requestedLimits,
  onViolation = (error) => console.error(error),
}) {
  const limits = normalizedLimits(requestedLimits);
  const records = new Map();
  const comms = new Map();
  const rejected = new Map();
  const views = new Set();
  let managerPromise;
  let closed = false;

  function modelLimitError() {
    return new RangeError(
      `widget session exceeds the ${limits.liveModels} live-model limit`,
    );
  }

  function viewLimitError() {
    return new RangeError(
      `widget session exceeds the ${limits.liveViews} live-view limit`,
    );
  }

  function rejectModel(event, error) {
    rejected.set(event.commId, error);
    const comm = comms.get(event.commId);
    comm?._close({
      schema: "sagejs.comm-event/v1",
      type: "close",
      commId: event.commId,
      data: {},
      metadata: {},
      buffers: [],
    });
    comms.delete(event.commId);
    records.delete(event.commId);
    destroyViews((view) => view.modelId === event.commId);
    onViolation(error, event);
    void session.comm({
      schema: "sagejs.comm-event/v1",
      type: "close",
      commId: event.commId,
      parentId: event.parentId,
      data: {},
      metadata: {},
      buffers: [],
    }).catch((closeError) => onViolation(closeError, event));
  }

  function recordOpen(event) {
    if (!records.has(event.commId) && records.size >= limits.liveModels) {
      rejectModel(event, modelLimitError());
      return;
    }
    const data = event.data ?? {};
    const state = stateWithBuffers(data.state, data.buffer_paths, event.buffers);
    rejected.delete(event.commId);
    records.set(event.commId, {
      commId: event.commId,
      targetName: event.targetName,
      state,
    });
  }

  function recordUpdate(event) {
    const record = records.get(event.commId);
    const data = event.data ?? {};
    if (!record || (data.method !== "update" && data.method !== "echo_update")) return;
    Object.assign(
      record.state,
      stateWithBuffers(data.state, data.buffer_paths, event.buffers),
    );
  }

  function outputItem(event) {
    if (event.type === "stream") {
      return { output_type: "stream", name: event.name, text: event.text };
    }
    if (event.type === "error") {
      return {
        output_type: "error",
        ename: event.name,
        evalue: event.message,
        traceback: event.traceback ?? [],
      };
    }
    if (event.type === "display_data" || event.type === "update_display_data") {
      const item = {
        output_type: "display_data",
        data: event.data ?? {},
        metadata: event.metadata ?? {},
      };
      if (event.displayId) item.transient = { display_id: event.displayId };
      return item;
    }
    return undefined;
  }

  function publishLocalOutput(record, event) {
    const current = Array.isArray(record.state.outputs)
      ? [...record.state.outputs]
      : [];
    if (event.type === "clear_output") {
      if (event.wait) record.clearOnNext = true;
      else current.length = 0;
    } else {
      if (record.clearOnNext) {
        current.length = 0;
        record.clearOnNext = false;
      }
      const item = outputItem(event);
      if (!item) return;
      if (event.type === "update_display_data" && event.displayId) {
        for (let index = 0; index < current.length; index += 1) {
          if (current[index]?.transient?.display_id === event.displayId) {
            current[index] = item;
          }
        }
      } else if (
        item.output_type === "stream" &&
        current.at(-1)?.output_type === "stream" &&
        current.at(-1)?.name === item.name
      ) {
        current[current.length - 1] = {
          ...current.at(-1),
          text: String(current.at(-1).text ?? "") + String(item.text ?? ""),
        };
      } else {
        current.push(item);
      }
    }
    record.state.outputs = current;
    comms.get(record.commId)?._message({
      schema: "sagejs.comm-event/v1",
      type: "message",
      commId: record.commId,
      parentId: event.parentId,
      data: {
        method: "update",
        state: { outputs: current },
        buffer_paths: [],
      },
      metadata: {},
      buffers: [],
    });
    if (managerPromise) {
      void managerPromise
        .then((activeManager) =>
          typeof activeManager.get_model === "function"
            ? activeManager.get_model(record.commId)
            : undefined)
        .then((model) => {
          // Output capture is owned by the frontend: its display messages do
          // not pass through the widget comm protocol.  Updating the live
          // Backbone model directly therefore mirrors JupyterLab's output
          // area and emits the change event consumed by OutputView.
          model?.set?.("outputs", current);
        })
        .catch((error) => {
          console.error("could not update widget output model", error);
        });
    }
  }

  function handleComm(event) {
    if (closed || event?.schema !== "sagejs.comm-event/v1") return;
    try {
      if (event.type === "open") recordOpen(event);
      else if (event.type === "message") recordUpdate(event);
    } catch (error) {
      rejectModel(event, error);
      return;
    }
    const comm = comms.get(event.commId);
    if (event.type === "message") comm?._message(event);
    if (event.type === "close") {
      comm?._close(event);
      comms.delete(event.commId);
      records.delete(event.commId);
      rejected.delete(event.commId);
      destroyViews((view) => view.modelId === event.commId);
    }
  }

  session.on("comm", handleComm);

  function captureOutput(event) {
    if (event?.schema !== "sagejs.output-event/v1" || !event.parentId) {
      return false;
    }
    let captured = false;
    for (const record of records.values()) {
      if (
        record.state._model_name === "OutputModel" &&
        record.state.msg_id === event.parentId
      ) {
        publishLocalOutput(record, event);
        captured = true;
      }
    }
    return captured;
  }

  function classicComm(commId, targetName) {
    const messageHandlers = new Set();
    const closeHandlers = new Set();
    const send = (type, data = {}, callbacks, metadata = {}, buffers = []) => {
      const msgId = uuid();
      void session.comm({
        schema: "sagejs.comm-event/v1",
        type,
        commId,
        parentId: msgId,
        targetName: type === "open" ? targetName : undefined,
        data: data ?? {},
        metadata: metadata ?? {},
        buffers: normalizedBuffers(buffers),
      }, {
        onEvent: captureOutput,
      }).then(
        () => callbacks?.shell?.reply?.({ content: { status: "ok" } }),
        (error) => callbacks?.shell?.reply?.({
          content: { status: "error", ename: error.name, evalue: error.message },
        }),
      );
      return msgId;
    };
    return {
      comm_id: commId,
      target_name: targetName,
      open(data, callbacks, metadata, buffers) {
        return send("open", data, callbacks, metadata, buffers);
      },
      send(data, callbacks, metadata, buffers) {
        return send("message", data, callbacks, metadata, buffers);
      },
      close(data, callbacks, metadata, buffers) {
        return send("close", data, callbacks, metadata, buffers);
      },
      on_msg(callback) {
        if (typeof callback === "function") messageHandlers.add(callback);
      },
      on_close(callback) {
        if (typeof callback === "function") closeHandlers.add(callback);
      },
      _message(event) {
        const message = jupyterMessage(event);
        for (const callback of messageHandlers) callback(message);
      },
      _close(event) {
        const message = jupyterMessage(event);
        for (const callback of closeHandlers) callback(message);
        messageHandlers.clear();
        closeHandlers.clear();
      },
    };
  }

  const environment = {
    async getSerializedModelState(modelId) {
      const record = records.get(modelId);
      if (!record) return undefined;
      const state = structuredClone(record.state);
      return {
        modelName: state._model_name,
        modelModule: state._model_module,
        modelModuleVersion: state._model_module_version,
        state,
      };
    },
    async openCommChannel({ target_name: targetName, comm_id: requestedId, data, metadata, buffers }) {
      const commId = requestedId || uuid();
      let comm = comms.get(commId);
      if (!comm) {
        comm = classicComm(commId, targetName);
        comms.set(commId, comm);
      }
      if (!records.has(commId) && data !== undefined) {
        await session.comm({
          schema: "sagejs.comm-event/v1",
          type: "open",
          commId,
          targetName,
          data: data ?? {},
          metadata: metadata ?? {},
          buffers: normalizedBuffers(buffers),
        });
      }
      return comm;
    },
    renderOutput,
    async loadClass() {
      return null;
    },
  };

  async function manager() {
    if (closed) throw new Error("widget host is closed");
    managerPromise ??= loadManager().then(({ createWidgetManager }) =>
      createWidgetManager(environment));
    return managerPromise;
  }

  function destroyView(view, message) {
    views.delete(view);
    try {
      view.element.widget?.remove?.();
    } catch (error) {
      onViolation(error, { type: "view-close", commId: view.modelId });
    }
    if (
      message &&
      view.element.ownerDocument &&
      typeof view.element.replaceWith === "function"
    ) {
      const notice = view.element.ownerDocument.createElement("p");
      notice.className = "widget-stale-notice";
      notice.textContent = message;
      view.element.replaceWith(notice);
    } else {
      view.element.remove?.();
    }
  }

  function destroyViews(predicate = () => true, message) {
    for (const view of [...views]) {
      if (predicate(view)) destroyView(view, message);
    }
  }

  function pruneDetachedViews() {
    destroyViews((view) => view.element.isConnected === false);
  }

  return Object.freeze({
    handleComm,
    isWidgetDisplay(data) {
      return data && typeof data === "object" && WIDGET_VIEW_MIME in data;
    },
    captureOutput,
    async render(displayData, destination) {
      const view = displayData?.[WIDGET_VIEW_MIME];
      const modelId = view?.model_id;
      if (typeof modelId !== "string" || !modelId) {
        throw new TypeError("widget view output has no model_id");
      }
      const rejection = rejected.get(modelId);
      if (rejection) throw rejection;
      pruneDetachedViews();
      if (views.size >= limits.liveViews) throw viewLimitError();
      const before = new Set(Array.from(destination?.children ?? []));
      await (await manager()).render(modelId, destination);
      for (const element of Array.from(destination?.children ?? [])) {
        if (!before.has(element)) views.add({ modelId, element });
      }
    },
    clearViews() {
      destroyViews();
    },
    stats() {
      pruneDetachedViews();
      return Object.freeze({
        models: records.size,
        rejectedModels: rejected.size,
        comms: comms.size,
        views: views.size,
        limits,
      });
    },
    reset() {
      destroyViews(
        () => true,
        "This widget belonged to a stopped kernel. Run its input again to restore it.",
      );
      for (const [commId, comm] of comms) {
        comm._close({
          schema: "sagejs.comm-event/v1",
          type: "close",
          commId,
          data: {},
          metadata: {},
          buffers: [],
        });
      }
      records.clear();
      comms.clear();
      rejected.clear();
      managerPromise = undefined;
    },
    close() {
      if (closed) return;
      closed = true;
      session.off("comm", handleComm);
      this.reset();
    },
  });
}

export { WIDGET_VIEW_MIME };
