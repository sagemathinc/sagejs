export interface ClassGroupArtifactReceipt {
  bytes: number;
  sha256: string;
}

export interface ClassGroupCoreOptions {
  artifact?: string | URL;
  receipt?: ClassGroupArtifactReceipt | string | URL;
  worker?: string | URL;
  WorkerConstructor?: typeof Worker;
  signal?: AbortSignal;
}

export class ClassGroupCoreInterruptedError extends Error {}
export class ClassGroupCoreClosedError extends Error {}

export class ClassGroupCoreSession {
  readonly handle: string;
  readonly openReceipt: unknown;
  query(idealIntegralBasisRows: unknown, resources: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
  summary(options?: { signal?: AbortSignal }): Promise<unknown>;
  publication(options?: { signal?: AbortSignal }): Promise<unknown>;
  close(options?: { signal?: AbortSignal }): Promise<void>;
}

export class ClassGroupCoreService {
  constructor(options: ClassGroupCoreOptions);
  readonly generation: number;
  ready(options?: { signal?: AbortSignal }): Promise<this>;
  invoke(request: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
  call(operation: string, payload?: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
  open(completionRequest: unknown, options?: { signal?: AbortSignal }): Promise<ClassGroupCoreSession | unknown>;
  diagnostics(): Promise<unknown>;
  interrupt(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createClassGroupCore(options?: ClassGroupCoreOptions): Promise<ClassGroupCoreService>;
export const defaultClassGroupCoreArtifact: URL;
export const defaultClassGroupCoreReceipt: URL;
