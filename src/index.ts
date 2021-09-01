import { swapPop } from 'swappop';
import { every } from './utils/every';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Interface *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export type From<T> = (this: void, value: T, index: number, obset: ObSet<T>) => any;

export type Listeners<T> = {
  readonly [key in SetOperation]: Set<SetEventListener<T>>;
};

export type MaybeListeners<T> = {
  [key in SetOperation]?: Set<SetEventListener<T>>;
};

export type ObSetOptions = {
  readonly freeUnusedResources: boolean;
};

export type OnceOptions = Omit<OnOptions, 'once'>;

export type OnOptions = {
  readonly once?: boolean;
};

export type Predicate<T> = (this: void, value: T, index: number, obset: ObSet<T>) => boolean;

export type SetEvent<T> = {
  readonly operation: SetOperation;
  readonly value: T;
};

export type SetEventListener<T> = (this: void, event: SetEvent<T>, obset: ObSet<T>) => void;

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

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Scoped Globals *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const DEFAULT_OPTIONS: ObSetOptions = {
  freeUnusedResources: true,
} as const;

const SET_OPERATIONS = every<SetOperation>({
  add: '',
  delete: '',
  empty: '',
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Implementation *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class ObSet<T> extends Set<T> implements SetEventTarget<T> {
  private readonly oneTimeListeners: SetEventListener<T>[] = [];

  private readonly options: ObSetOptions;

  private readonly operationListeners: Listeners<T> = {
    add: new Set<SetEventListener<T>>(),
    delete: new Set<SetEventListener<T>>(),
    empty: new Set<SetEventListener<T>>(),
  } as const;

  private readonly valueListeners: Map<T, MaybeListeners<T>> = new Map<T, MaybeListeners<T>>();

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

  /** NOTE: maximizes compatibility. */
  addEventListener = this.on;

  override clear(this: this): this {
    for (const value of this) {
      this.delete(value);
    }

    return this;
  }

  clone(this: this): ObSet<T> {
    const clone = new ObSet<T>(this, this.options);

    // Copy operationListeners
    for (const operation of SET_OPERATIONS) {
      for (const listener of this.operationListeners[operation]) {
        clone.operationListeners[operation].add(listener);
      }
    }

    // Copy valueListeners
    for (const [value, listener] of this.valueListeners) {
      clone.valueListeners.set(value, listener);
    }

    // Copy oneTimeListeners
    for (const listener of this.oneTimeListeners) {
      clone.oneTimeListeners.push(listener);
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

    if (this.size) return this;

    const setEvent: SetEvent<T> = {
      operation: 'empty',
      value: event.value,
    } as const;

    for (const listener of this.operationListeners.empty) {
      listener(setEvent, this);
    }

    return this;
  }

  private deleteOneTimeListener(this: this, listener: SetEventListener<T> | SetEventListener<T>): this {
    const listenerIndex = this.oneTimeListeners.indexOf(listener);

    if (listenerIndex !== -1) {
      swapPop(this.oneTimeListeners, listenerIndex);
    }

    return this;
  }

  private dispatchEvent(this: this, event: SetEvent<T>): this {
    const { operation, value } = event;

    const anyListeners = this.operationListeners[operation];

    for (const listener of anyListeners) {
      listener(event, this);

      if (!this.oneTimeListeners.includes(listener)) continue;

      anyListeners.delete(listener);
      this.deleteOneTimeListener(listener);
    }

    const eventListeners = this.valueListeners.get(value)?.[operation];

    if (!eventListeners) return this;

    for (const listener of eventListeners) {
      listener(event, this);

      if (!this.oneTimeListeners.includes(listener)) continue;

      eventListeners.delete(listener);
      this.deleteOneTimeListener(listener);
    }

    return this;
  }

  every(this: this, predicate: (this: void, value: T, index: number, set: this) => boolean): boolean {
    let i = 0;

    for (const value of this) {
      if (!predicate(value, i++, this)) return false;
    }

    return true;
  }

  filter<U extends T>(this: this, predicate: (this: void, value: T, index: number, set: this) => value is U): readonly U[];
  filter(this: this, predicate: (this: void, value: T, index: number, set: this) => boolean): readonly T[];
  filter<U extends T>(this: this, predicate: (this: void, value: T, index: number, set: this) => boolean): readonly T[] | readonly U[] {
    const filtered: T[] = [];

    let i = 0;

    for (const value of this) {
      if (predicate(value, i++, this)) filtered.push(value);
    }

    return filtered;
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

  hasEvery(this: this, ...values: readonly T[]): boolean {
    for (const value of values) {
      if (!this.has(value)) return false;
    }

    return true;
  }

  hasSome(this: this, ...values: readonly T[]): boolean {
    for (const value of values) {
      if (this.has(value)) return true;
    }

    return false;
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

  map<U extends From<T>, V extends ReturnType<U>>(this: this, into: U): readonly V[] {
    const mapped: V[] = [];

    let i = 0;

    for (const value of this) {
      mapped.push(into(value, i++, this));
    }

    return mapped;
  }

  on(this: this, operation: SetOperation, listener: SetEventListener<T>, options?: OnOptions): this;
  on(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: OnOptions): this;
  on(this: this, operation: SetOperation, valueOrListener: T | SetEventListener<T>, optionsOrListener?: SetEventListener<T> | OnOptions, options?: OnOptions): this {
    return options ?? typeof optionsOrListener === 'function'
      ? this.onValue(operation, valueOrListener as T, optionsOrListener as SetEventListener<T>, options)
      : this.onOperation(operation, valueOrListener as SetEventListener<T>, optionsOrListener);
  }

  once(this: this, operation: SetOperation, listener: SetEventListener<T>, options?: OnceOptions): this;
  once(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: OnceOptions): this;
  once(this: this, operation: SetOperation, valueOrListener: T | SetEventListener<T>, optionsOrListener?: SetEventListener<T> | OnceOptions, options?: OnceOptions): this {
    return options ?? typeof optionsOrListener === 'function'
      ? this.onValue(operation, valueOrListener as T, optionsOrListener as SetEventListener<T>, { ...options, once: true })
      : this.onOperation(operation, valueOrListener as SetEventListener<T>, { ...optionsOrListener, once: true });
  }

  private onOperation(this: this, operation: SetOperation, listener: SetEventListener<T>, options?: OnOptions): this {
    this.operationListeners[operation].add(listener);

    if (options?.once) this.oneTimeListeners.push(listener);

    return this;
  }

  private onValue(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: OnOptions): this {
    const operationListeners = this.valueListeners.get(value) ?? this.initOperationListenersFor(value);

    const eventListeners = operationListeners[operation] ?? this.initEventListenersFor(operation, operationListeners);

    eventListeners.add(listener);

    if (options?.once) this.oneTimeListeners.push(listener);

    return this;
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

  some(this: this, predicate: Predicate<T>): boolean {
    let i = 0;

    for (const value of this) {
      if (predicate(value, i++, this)) return true;
    }

    return false;
  }

  xor(this: this, a: T, b: T): boolean {
    return this.has(a) !== this.has(b);
  }
}
