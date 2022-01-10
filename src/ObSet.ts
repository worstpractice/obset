import { ArrayMap } from './ArrayMap.js';
import { isEmpty } from './utils/isEmpty.js';

/////////////////////////////////////////////////////////////////////////////
// * Interface *
/////////////////////////////////////////////////////////////////////////////
export type Listeners<T> = {
  readonly [key in SetOperation]: Set<SetEventListener<T>>;
};

export type MaybeListeners<T> = {
  [key in SetOperation]?: Set<SetEventListener<T>>;
};

export type OnceOptions = Omit<OnOptions, 'once'>;

export type OnOptions = {
  readonly once?: boolean;
};

export type SetEventListener<T> = (this: void, value: T, operation: SetOperation, obset: ObSet<T>) => void;

// prettier-ignore
export type SetOperation =
  | 'add'
  | 'empty'
  | 'remove'

/////////////////////////////////////////////////////////////////////////////
// * Implementation *
/////////////////////////////////////////////////////////////////////////////
export class ObSet<T> {
  get internalArray(): readonly T[] {
    return this.store.internalArray;
  }

  get isEmpty(): boolean {
    return !this.store.size;
  }

  /** @internal */
  private readonly oneTimeListeners: Set<SetEventListener<T>> = new Set<SetEventListener<T>>();

  /** @internal */
  private readonly operationListeners: Listeners<T> = {
    add: new Set<SetEventListener<T>>(),
    empty: new Set<SetEventListener<T>>(),
    remove: new Set<SetEventListener<T>>(),
  } as const;

  /** @internal */
  private readonly valueListeners: Map<T, MaybeListeners<T>> = new Map<T, MaybeListeners<T>>();

  get size(): number {
    return this.store.size;
  }

  /** @internal */
  private readonly store: ArrayMap<T>;

  constructor(...initialValues: readonly T[]) {
    this.store = new ArrayMap<T>(initialValues);
  }

  add(this: this, value: T): this {
    return this.store.add(value) //
      ? this.dispatchEvent('add', value)
      : this;
  }

  /** @internal */
  private notifyListeners(this: this, listeners: Set<SetEventListener<T>>, operation: SetOperation, value: T): this {
    for (const listener of listeners) {
      listener(value, operation, this);

      if (!this.oneTimeListeners.has(listener)) continue;

      listeners.delete(listener);
      this.oneTimeListeners.delete(listener);
    }

    return this;
  }

  /** @internal */
  private dispatchEvent(this: this, operation: SetOperation, value: T): this {
    const operationListeners = this.operationListeners[operation];

    this.notifyListeners(operationListeners, operation, value);

    const eventListeners = this.valueListeners.get(value)?.[operation];

    return eventListeners //
      ? this.notifyListeners(eventListeners, operation, value)
      : this;
  }

  /** @internal */
  private findOperationsWithoutListenersIn(this: this, operationListeners: MaybeListeners<T>): readonly SetOperation[] {
    const operationSetPairs = Object.entries(operationListeners);

    const operationsWithoutListeners: SetOperation[] = [];

    for (const [operation, { size }] of operationSetPairs) {
      if (size) continue;

      operationsWithoutListeners.push(operation);
    }

    return operationsWithoutListeners;
  }

  /** @internal */
  private freeUnusedResourcesIn(this: this, operationListeners: MaybeListeners<T>, value: T): this {
    const withoutListeners: readonly SetOperation[] = this.findOperationsWithoutListenersIn(operationListeners);

    // Free any sets without listeners
    for (const operation of withoutListeners) {
      operationListeners[operation] = undefined;
    }

    if (!isEmpty(operationListeners)) {
      // Free any values without sets
      this.valueListeners.delete(value);
    }

    return this;
  }

  has(this: this, value: T): boolean {
    return this.store.has(value);
  }

  hasEvery(this: this, ...values: readonly T[]): boolean {
    for (let i = 0; i < values.length; i++) {
      if (!this.has(values[i] as T)) {
        return false;
      }
    }

    return true;
  }

  hasSome(this: this, ...values: readonly T[]): boolean {
    for (let i = 0; i < values.length; i++) {
      if (this.has(values[i] as T)) {
        return true;
      }
    }

    return false;
  }

  /** @internal */
  private initEventListenersFor(this: this, operation: SetOperation, operationListeners: MaybeListeners<T>): Set<SetEventListener<T>> {
    const eventListeners = new Set<SetEventListener<T>>();

    operationListeners[operation] = eventListeners;

    return eventListeners;
  }

  /** @internal */
  private initOperationListenersFor(this: this, value: T): MaybeListeners<T> {
    const operationListeners: MaybeListeners<T> = {} as const;

    this.valueListeners.set(value, operationListeners);

    return operationListeners;
  }

  /** Alias for `addEventListener`. */
  on(this: this, operation: SetOperation, listener: SetEventListener<T>, options?: OnOptions): this;
  on(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: OnOptions): this;
  on(this: this, operation: SetOperation, valueOrListener: T | SetEventListener<T>, optionsOrListener?: SetEventListener<T> | OnOptions, options?: OnOptions): this {
    return options ?? typeof optionsOrListener === 'function'
      ? this.onValue(operation, valueOrListener as T, optionsOrListener as SetEventListener<T>, options)
      : this.onOperation(operation, valueOrListener as SetEventListener<T>, optionsOrListener);
  }

  /** Alias for `addEventListener` with the `once` option set to `true`. */
  once(this: this, operation: SetOperation, listener: SetEventListener<T>, options?: OnceOptions): this;
  once(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: OnceOptions): this;
  once(this: this, operation: SetOperation, valueOrListener: T | SetEventListener<T>, optionsOrListener?: SetEventListener<T> | OnceOptions, options?: OnceOptions): this {
    return options ?? typeof optionsOrListener === 'function'
      ? this.onValue(operation, valueOrListener as T, optionsOrListener as SetEventListener<T>, { ...options, once: true } as const)
      : this.onOperation(operation, valueOrListener as SetEventListener<T>, { ...optionsOrListener, once: true } as const);
  }

  /** @internal */
  private onOperation(this: this, operation: SetOperation, listener: SetEventListener<T>, options?: OnOptions): this {
    const operationListeners = this.operationListeners[operation];

    operationListeners.add(listener);

    if (options?.once) this.oneTimeListeners.add(listener);

    return this;
  }

  /** @internal */
  private onValue(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: OnOptions): this {
    const operationListeners = this.valueListeners.get(value) ?? this.initOperationListenersFor(value);

    const eventListeners = operationListeners[operation] ?? this.initEventListenersFor(operation, operationListeners);

    eventListeners.add(listener);

    if (options?.once) this.oneTimeListeners.add(listener);

    return this;
  }

  /** Alias for `removeEventListener`. */
  off(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>): this {
    const operationListeners = this.valueListeners.get(value);

    if (!operationListeners) return this;

    const eventListeners = operationListeners[operation];

    if (!eventListeners) return this;

    eventListeners.delete(listener);
    this.oneTimeListeners.delete(listener);

    return this.freeUnusedResourcesIn(operationListeners, value);
  }

  remove(this: this, value: T): this {
    // prettier-ignore
    this.store.remove(value)
      && this.dispatchEvent('remove', value)
      && (this.size || this.dispatchEvent('empty', value));

    return this;
  }

  xor(this: this, a: T, b: T): boolean {
    return this.has(a) !== this.has(b);
  }
}
