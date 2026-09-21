export interface ClassGroupArtifactReceipt {
  bytes: number;
  sha256: string;
}

export interface ClassGroupCoreOptions {
  artifact: string | URL;
  receipt: ClassGroupArtifactReceipt;
  worker?: string | URL;
  WorkerConstructor?: typeof Worker;
}

export class ClassGroupCoreInterruptedError extends Error {}
export class ClassGroupCoreClosedError extends Error {}

export class ClassGroupCoreSession {
  readonly handle: number;
  readonly openReceipt: unknown;
  query(idealIntegralBasisRows: unknown, resources: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
  close(options?: { signal?: AbortSignal }): Promise<void>;
}

export class ClassGroupCoreService {
  constructor(options: ClassGroupCoreOptions);
  readonly generation: number;
  ready(): Promise<this>;
  invoke(request: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
  open(completionRequest: unknown, options?: { signal?: AbortSignal }): Promise<ClassGroupCoreSession | unknown>;
  diagnostics(): Promise<unknown>;
  interrupt(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createClassGroupCore(options: ClassGroupCoreOptions): Promise<ClassGroupCoreService>;
