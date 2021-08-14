import { swapPop } from './utils/swapPop.js';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Interface *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export type ObSetOptions = {
  readonly freeUnusedResources: boolean;
};

export type SetEvent<T> = {
  readonly operation: SetOperation;
  readonly value: T;
};

export type SetEventListener<T> = (event: SetEvent<T>) => void;

export type SetEventListenerOptions = {
  readonly once?: boolean;
};

export interface SetEventTarget<T> {
  readonly addEventListener: (this: this, type: SetOperation, value: T, listener: SetEventListener<T>) => this;
  readonly removeEventListener: (this: this, type: SetOperation, value: T, listener: SetEventListener<T>) => this;
}

// prettier-ignore
export type SetOperation =
  | "add"
  | "delete"
;

export type SetOperationEvent<T> = Omit<SetEvent<T>, 'operation'>;

export type SetOperationEventListener<T> = (event: SetOperationEvent<T>) => void;

export type SetOperationEventListeners<T> = {
  readonly [key in SetOperation]: Set<SetOperationEventListener<T>>;
};

export type SetOperationListeners<T> = {
  [key in SetOperation]?: Set<SetEventListener<T>>;
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Implementation *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const ONCE = {
  once: true,
} as const;

const DEFAULT_OPTIONS: ObSetOptions = {
  freeUnusedResources: true,
} as const;

export class ObSet<T> extends Set<T> implements SetEventTarget<T> {
  private readonly onAnyHandlers: SetOperationEventListeners<T> = {
    add: new Set<SetOperationEventListener<T>>(),
    delete: new Set<SetOperationEventListener<T>>(),
  } as const;

  private readonly onEmptyHandlers = new Set<SetOperationEventListener<T>>();

  private readonly onValueHandlers: Map<T, SetOperationListeners<T>> = new Map<T, SetOperationListeners<T>>();

  private readonly options: ObSetOptions;

  private readonly toBeRanOnlyOnce: SetEventListener<T>[] = [];

  constructor(initialValues?: Iterable<T>, options?: ObSetOptions) {
    super();
    this.options = options ?? DEFAULT_OPTIONS;

    if (!initialValues) return this;

    for (const value of initialValues) {
      super.add(value);
    }
  }

  override add(this: this, value: T): this {
    if (this.has(value)) return this;

    super.add(value);

    const event: SetEvent<T> = {
      operation: 'add',
      value,
    } as const;

    this.dispatchEvent(event);

    return this;
  }

  addEventListener(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: SetEventListenerOptions): this {
    const operationListeners = this.onValueHandlers.get(value) ?? this.initOperationListenersFor(value);

    const eventListeners = operationListeners[operation] ?? this.initEventListenersFor(operation, operationListeners);

    eventListeners.add(listener);

    if (options?.once) this.toBeRanOnlyOnce.push(listener);

    return this;
  }

  override clear(this: this): this {
    for (const operation of Object.keys(this.onAnyHandlers)) {
      this.onAnyHandlers[operation].clear();
    }

    this.onEmptyHandlers.clear();

    this.onValueHandlers.clear();

    this.toBeRanOnlyOnce.length = 0;

    super.clear();

    return this;
  }

  clone(this: this): ObSet<T> {
    const clone: ObSet<T> = new ObSet<T>(this, this.options);

    // Copy anyHandlers
    for (const operation of Object.keys(this.onAnyHandlers)) {
      for (const handler of this.onAnyHandlers[operation]) {
        clone.onAnyHandlers[operation].add(handler);
      }
    }

    // Copy emptyHandlers
    for (const handler of this.onEmptyHandlers) {
      clone.onEmptyHandlers.add(handler);
    }

    // Copy valueHandlers
    for (const [value, handler] of this.onValueHandlers) {
      clone.onValueHandlers.set(value, handler);
    }

    // Copy one-off handlers
    for (const handler of this.toBeRanOnlyOnce) {
      clone.toBeRanOnlyOnce.push(handler);
    }

    return clone;
  }

  // @ts-expect-error the base method we are overriding isn't chainable (returning a boolean instead of `this`).
  override delete(this: this, value: T): this {
    if (!this.has(value)) return this;

    super.delete(value);

    const event: SetEvent<T> = {
      operation: 'delete',
      value,
    } as const;

    this.dispatchEvent(event);

    if (!this.size) {
      const operationEvent: SetOperationEvent<T> = {
        value: event.value,
      } as const;

      for (const listener of this.onEmptyHandlers) {
        listener.call(this, operationEvent);
      }
    }

    return this;
  }

  private deleteOneTimeListener(this: this, listener: SetEventListener<T> | SetOperationEventListener<T>): void {
    const listenerIndex = this.toBeRanOnlyOnce.indexOf(listener);

    if (listenerIndex === -1) return;

    swapPop(this.toBeRanOnlyOnce, listenerIndex);
  }

  private dispatchEvent(this: this, event: SetEvent<T>): this {
    const { operation, value } = event;

    const anyListeners = this.onAnyHandlers[operation];

    const operationEvent: SetOperationEvent<T> = {
      value,
    } as const;

    for (const listener of anyListeners) {
      listener.call(this, operationEvent);

      if (!this.toBeRanOnlyOnce.includes(listener)) continue;

      anyListeners.delete(listener);
      this.deleteOneTimeListener(listener);
    }

    const eventListeners = this.onValueHandlers.get(value)?.[operation];

    if (!eventListeners) return this;

    for (const listener of eventListeners) {
      listener.call(this, event);

      if (!this.toBeRanOnlyOnce.includes(listener)) continue;

      eventListeners.delete(listener);
      this.deleteOneTimeListener(listener);
    }

    return this;
  }

  private findOperationsWithoutListenersIn(this: this, operationListeners: SetOperationListeners<T>): readonly SetOperation[] {
    const operationSetPairs = Object.entries(operationListeners);

    const operationsWithoutListeners: SetOperation[] = [];

    for (const [operation, { size }] of operationSetPairs) {
      if (size) continue;

      operationsWithoutListeners.push(operation);
    }

    return operationsWithoutListeners;
  }

  /** NOTE: keeps memory usage as low as possible, at the cost of some extra cleanup work.
   *
   * See: https://en.wikipedia.org/wiki/Space%E2%80%93time_tradeoff */
  private freeUnusedResourcesIn(this: this, operationListeners: SetOperationListeners<T>, value: T): void {
    const withoutListeners: readonly SetOperation[] = this.findOperationsWithoutListenersIn(operationListeners);

    // Free any sets without listeners
    for (const operation of withoutListeners) {
      operationListeners[operation] = undefined;
    }

    if (Object.keys(operationListeners).length) return;

    // Free any values without sets
    this.onValueHandlers.delete(value);
  }

  private initEventListenersFor(this: this, operation: SetOperation, operationListeners: SetOperationListeners<T>): Set<SetEventListener<T>> {
    const eventListeners = new Set<SetEventListener<T>>();

    operationListeners[operation] = eventListeners;

    return eventListeners;
  }

  private initOperationListenersFor(this: this, value: T): SetOperationListeners<T> {
    const operationListeners: SetOperationListeners<T> = {} as const;

    this.onValueHandlers.set(value, operationListeners);

    return operationListeners;
  }

  /** NOTE: syntactic sugar for `addEventListener`. */
  readonly on = this.addEventListener;

  onAny(this: this, operation: SetOperation, listener: SetOperationEventListener<T>): this {
    this.onAnyHandlers[operation].add(listener);

    return this;
  }

  once(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>): this {
    return this.on(operation, value, listener, ONCE);
  }

  onceAny(this: this, operation: SetOperation, listener: SetOperationEventListener<T>): this {
    this.onAnyHandlers[operation].add(listener);

    this.toBeRanOnlyOnce.push(listener);

    return this;
  }

  onEmpty(this: this, listener: SetOperationEventListener<T>): this {
    this.onEmptyHandlers.add(listener);

    return this;
  }

  removeEventListener(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>): this {
    const operationListeners = this.onValueHandlers.get(value);

    if (!operationListeners) return this;

    const eventListeners = operationListeners[operation];

    if (!eventListeners) return this;

    eventListeners.delete(listener);
    this.deleteOneTimeListener(listener);

    if (this.options.freeUnusedResources) this.freeUnusedResourcesIn(operationListeners, value);

    return this;
  }
}
