import { swapPop } from 'swappop';
import type { Every } from './typings/Every.js';
import { isEmpty } from './utils/isEmpty.js';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Interface *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Scoped Globals *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const SET_OPERATIONS: Every<SetOperation> = [
  //,
  'add',
  'empty',
  'remove',
] as const;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Implementation *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export class ObSet<T> {
  /** @internal */
  private readonly backingStore: T[] = [];

  get values(): readonly T[] {
    return this.backingStore;
  }

  get isEmpty(): boolean {
    return !this.size;
  }

  get size(): number {
    return this.backingStore.length;
  }

  /** @internal */
  private readonly oneTimeListeners: SetEventListener<T>[] = [];

  /** @internal */
  private readonly operationListeners: Listeners<T> = {
    add: new Set<SetEventListener<T>>(),
    empty: new Set<SetEventListener<T>>(),
    remove: new Set<SetEventListener<T>>(),
  } as const;

  /** @internal */
  private readonly valueListeners: Map<T, MaybeListeners<T>> = new Map<T, MaybeListeners<T>>();

  constructor(initialValues?: Iterable<T>) {
    if (initialValues) {
      for (const value of initialValues) {
        // push directly instead of calling `this.add` during construction (as there cannot yet be any listeners)
        this.backingStore.push(value);
      }
    }
  }

  [Symbol.iterator]() {
    return this.backingStore[Symbol.iterator]();
  }

  add(this: this, value: T): this {
    if (this.has(value)) return this;

    this.backingStore.push(value);
    this.dispatchEvent('add', value);

    return this;
  }

  clear(this: this): this {
    for (const value of this) {
      this.remove(value);
    }

    return this;
  }

  clone(this: this): ObSet<T> {
    const clone = new ObSet<T>(this);

    for (const operation of SET_OPERATIONS) {
      for (const listener of this.operationListeners[operation]) {
        clone.operationListeners[operation].add(listener);
      }
    }

    for (const [value, listener] of this.valueListeners) {
      clone.valueListeners.set(value, listener);
    }

    for (const listener of this.oneTimeListeners) {
      clone.oneTimeListeners.push(listener);
    }

    return clone;
  }

  /** @internal */
  private deleteOneTimeListener(this: this, listener: SetEventListener<T> | SetEventListener<T>): this {
    const listenerIndex = this.oneTimeListeners.indexOf(listener);

    if (listenerIndex !== -1) {
      swapPop(this.oneTimeListeners, listenerIndex);
    }

    return this;
  }

  /** @internal */
  private dispatchEvent(this: this, operation: SetOperation, value: T): this {
    const operationListeners = this.operationListeners[operation];

    for (const listener of operationListeners) {
      listener(value, operation, this);

      if (!this.oneTimeListeners.includes(listener)) continue;

      operationListeners.delete(listener);
      this.deleteOneTimeListener(listener);
    }

    const eventListeners = this.valueListeners.get(value)?.[operation];

    if (!eventListeners) return this;

    for (const listener of eventListeners) {
      listener(value, operation, this);

      if (!this.oneTimeListeners.includes(listener)) continue;

      eventListeners.delete(listener);
      this.deleteOneTimeListener(listener);
    }

    return this;
  }

  every<S extends T>(predicate: (this: this, value: T, index: number, values: readonly T[]) => value is S): this is readonly S[];
  every(predicate: (this: this, value: T, index: number, values: readonly T[]) => unknown): boolean {
    return this.backingStore.every(predicate, this);
  }

  filter<S extends T>(predicate: (this: this, value: T, index: number, values: readonly T[]) => value is S): readonly S[];
  filter(predicate: (this: this, value: T, index: number, values: readonly T[]) => unknown): readonly T[] {
    return this.backingStore.filter(predicate, this);
  }

  find<S extends T>(predicate: (this: this, value: T, index: number, values: readonly T[]) => value is S): S | undefined;
  find(predicate: (this: this, value: T, index: number, obj: T[]) => unknown): T | undefined {
    return this.backingStore.find(predicate, this);
  }

  findIndex(predicate: (this: this, value: T, index: number, values: readonly T[]) => unknown): number {
    return this.backingStore.findIndex(predicate, this);
  }

  /** @internal */
  private findOperationsWithoutListenersIn(this: this, operationListeners: MaybeListeners<T>): readonly SetOperation[] {
    const operationSetPairs = Object.entries(operationListeners);

    const operationsWithoutListeners: SetOperation[] = [];
    [].find;
    for (const [operation, { size }] of operationSetPairs) {
      if (size) continue;

      operationsWithoutListeners.push(operation);
    }

    return operationsWithoutListeners;
  }

  /** NOTE: keeps memory usage as low as possible, at the cost of some extra cleanup work.
   *
   * See: https://en.wikipedia.org/wiki/Space%E2%80%93time_tradeoff */
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
    return this.backingStore.includes(value);
  }

  hasEvery(this: this, ...values: readonly T[]): boolean {
    for (const value of values) {
      if (!this.has(value)) {
        return false;
      }
    }

    return true;
  }

  hasSome(this: this, ...values: readonly T[]): boolean {
    for (const value of values) {
      if (this.has(value)) {
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

  map<U>(callbackfn: (this: this, value: T, index: number, values: readonly T[]) => U): readonly U[] {
    return this.backingStore.map(callbackfn, this);
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
    this.operationListeners[operation].add(listener);

    if (options?.once) this.oneTimeListeners.push(listener);

    return this;
  }

  /** @internal */
  private onValue(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>, options?: OnOptions): this {
    const operationListeners = this.valueListeners.get(value) ?? this.initOperationListenersFor(value);

    const eventListeners = operationListeners[operation] ?? this.initEventListenersFor(operation, operationListeners);

    eventListeners.add(listener);

    if (options?.once) this.oneTimeListeners.push(listener);

    return this;
  }

  /** Alias for `removeEventListener`. */
  off(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>): this {
    const operationListeners = this.valueListeners.get(value);

    if (!operationListeners) return this;

    const eventListeners = operationListeners[operation];

    if (!eventListeners) return this;

    eventListeners.delete(listener);
    this.deleteOneTimeListener(listener);

    return this.freeUnusedResourcesIn(operationListeners, value);
  }

  remove(this: this, value: T): this {
    const index = this.backingStore.indexOf(value);

    if (index === -1) return this;

    swapPop(this.backingStore, index);
    this.dispatchEvent('remove', value);

    return this.isEmpty ? this.dispatchEvent('empty', value) : this;
  }

  some(predicate: (this: this, value: T, index: number, values: readonly T[]) => unknown): boolean {
    return this.backingStore.some(predicate, this);
  }

  toJSON(this: this): readonly T[] {
    return this.backingStore;
  }

  xor(this: this, a: T, b: T): boolean {
    return this.has(a) !== this.has(b);
  }
}
