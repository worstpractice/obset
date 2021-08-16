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
  | "empty"
;

export type Listeners<T> = {
  readonly [key in SetOperation]: Set<SetEventListener<T>>;
};

export type MaybeListeners<T> = {
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

type WarnIfMissingKey = {
  readonly [key in SetOperation]: undefined;
};

const warnIfMissingKey: WarnIfMissingKey = {
  add: undefined,
  delete: undefined,
  empty: undefined,
} as const;

const SET_OPERATIONS = Object.keys(warnIfMissingKey);

export class ObSet<T> extends Set<T> implements SetEventTarget<T> {
  private readonly operationListeners: Listeners<T> = {
    add: new Set<SetEventListener<T>>(),
    delete: new Set<SetEventListener<T>>(),
    empty: new Set<SetEventListener<T>>(),
  } as const;

  private readonly valueListeners: Map<T, MaybeListeners<T>> = new Map<T, MaybeListeners<T>>();

  private readonly options: ObSetOptions;

  private readonly oneTimeListeners: SetEventListener<T>[] = [];

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

  /** NOTE: syntactic sugar. */
  addEventListener = this.onValue;

  override clear(this: this): this {
    for (const value of this) {
      this.delete(value);
    }

    return this;
  }

  clone(this: this): ObSet<T> {
    const clone: ObSet<T> = new ObSet<T>(this, this.options);

    // Copy anyHandlers
    for (const operation of SET_OPERATIONS) {
      for (const handler of this.operationListeners[operation]) {
        clone.operationListeners[operation].add(handler);
      }
    }

    // Copy valueHandlers
    for (const [value, handler] of this.valueListeners) {
      clone.valueListeners.set(value, handler);
    }

    // Copy one-off handlers
    for (const handler of this.oneTimeListeners) {
      clone.oneTimeListeners.push(handler);
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
      const setEvent: SetEvent<T> = {
        operation: 'empty',
        value: event.value,
      } as const;

      for (const listener of this.operationListeners.empty) {
        listener.call(this, setEvent);
      }
    }

    return this;
  }

  private deleteOneTimeListener(this: this, listener: SetEventListener<T> | SetEventListener<T>): void {
    const listenerIndex = this.oneTimeListeners.indexOf(listener);

    if (listenerIndex === -1) return;

    swapPop(this.oneTimeListeners, listenerIndex);
  }

  private dispatchEvent(this: this, event: SetEvent<T>): this {
    const { operation, value } = event;

    const anyListeners = this.operationListeners[operation];

    for (const listener of anyListeners) {
      listener.call(this, event);

      if (!this.oneTimeListeners.includes(listener)) continue;

      anyListeners.delete(listener);
      this.deleteOneTimeListener(listener);
    }

    const eventListeners = this.valueListeners.get(value)?.[operation];

    if (!eventListeners) return this;

    for (const listener of eventListeners) {
      listener.call(this, event);

      if (!this.oneTimeListeners.includes(listener)) continue;

      eventListeners.delete(listener);
      this.deleteOneTimeListener(listener);
    }

    return this;
  }

  private findOperationsWithoutListenersIn(this: this, operationListeners: MaybeListeners<T>): readonly SetOperation[] {
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
  private freeUnusedResourcesIn(this: this, operationListeners: MaybeListeners<T>, value: T): void {
    const withoutListeners: readonly SetOperation[] = this.findOperationsWithoutListenersIn(operationListeners);

    // Free any sets without listeners
    for (const operation of withoutListeners) {
      operationListeners[operation] = undefined;
    }

    if (Object.keys(operationListeners).length) return;

    // Free any values without sets
    this.valueListeners.delete(value);
  }

  private initEventListenersFor(this: this, operation: SetOperation, operationListeners: MaybeListeners<T>): Set<SetEventListener<T>> {
    const eventListeners = new Set<SetEventListener<T>>();

    operationListeners[operation] = eventListeners;

    return eventListeners;
  }

  private initOperationListenersFor(this: this, value: T): MaybeListeners<T> {
    const operationListeners: MaybeListeners<T> = {} as const;

    this.valueListeners.set(value, operationListeners);

    return operationListeners;
  }

  on(this: this, operation: SetOperation, listener: SetEventListener<T>, options?: SetEventListenerOptions): this;
  on(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: SetEventListenerOptions): this;
  on(this: this, ...args: readonly [operation: SetOperation, valueOrListener: T | SetEventListener<T>, listenerOrOptions?: SetEventListener<T> | SetEventListenerOptions, maybeOptions?: SetEventListenerOptions]): this {
    const [operation, valueOrListener, listenerOrOptions, maybeOptions] = args;

    switch (args.length) {
      case 2: {
        const listener = valueOrListener as SetEventListener<T>;
        const options = listenerOrOptions as SetEventListenerOptions | undefined;

        return this.onOperation(operation, listener, options);
      }

      case 3: {
        if (typeof listenerOrOptions === 'function') {
          const value = valueOrListener as T;
          const listener = listenerOrOptions;

          return this.onValue(operation, value, listener, maybeOptions);
        }

        const listener = valueOrListener as SetEventListener<T>;
        const options = listenerOrOptions as SetEventListenerOptions | undefined;

        return this.onOperation(operation, listener, options);
      }

      case 4: {
        const value = valueOrListener as T;
        const listener = listenerOrOptions as SetEventListener<T>;

        return this.onValue(operation, value, listener, maybeOptions);
      }

      default: {
        return this.unreachable(args.length);
      }
    }
  }

  private onOperation(this: this, operation: SetOperation, listener: SetEventListener<T>, options?: SetEventListenerOptions): this {
    this.operationListeners[operation].add(listener);

    if (options?.once) this.oneTimeListeners.push(listener);

    return this;
  }

  private onValue(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: SetEventListenerOptions): this {
    const operationListeners = this.valueListeners.get(value) ?? this.initOperationListenersFor(value);

    const eventListeners = operationListeners[operation] ?? this.initEventListenersFor(operation, operationListeners);

    eventListeners.add(listener);

    if (options?.once) this.oneTimeListeners.push(listener);

    return this;
  }

  once(this: this, operation: SetOperation, listener: SetEventListener<T>, options?: SetEventListenerOptions): this;
  once(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: SetEventListenerOptions): this;
  once(this: this, ...args: readonly [operation: SetOperation, valueOrListener: T | SetEventListener<T>, listenerOrOptions?: SetEventListener<T> | SetEventListenerOptions, maybeOptions?: SetEventListenerOptions]): this {
    const [operation, valueOrListener, listenerOrOptions = {}, maybeOptions = {}] = args;

    if (typeof listenerOrOptions === 'function') {
      const originalOptions = maybeOptions;

      return this.on(
        operation,
        // @ts-expect-error this only errors due to visibility rules for overloads
        valueOrListener,
        listenerOrOptions,
        { ...originalOptions, ...ONCE } as const,
      );
    }

    const originalOptions = listenerOrOptions;

    return this.on(
      operation,
      // @ts-expect-error this only errors due to visibility rules for overloads
      valueOrListener,
      { ...originalOptions, ...ONCE } as const,
    );
  }

  removeEventListener(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>): this {
    const operationListeners = this.valueListeners.get(value);

    if (!operationListeners) return this;

    const eventListeners = operationListeners[operation];

    if (!eventListeners) return this;

    eventListeners.delete(listener);
    this.deleteOneTimeListener(listener);

    if (this.options.freeUnusedResources) this.freeUnusedResourcesIn(operationListeners, value);

    return this;
  }

  private unreachable(length: never): never {
    throw new RangeError(length);
  }
}
