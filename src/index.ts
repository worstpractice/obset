import { swapPop } from 'swappop';
import { every } from './utils/every.js';
import { isEmpty } from './utils/isEmpty.js';
import { unreachable } from './utils/unreachable.js';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Interface *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export type Listeners<T> = {
  readonly [key in SetOperation]: Set<SetEventListener<T>>;
};

export type MaybeListeners<T> = {
  [key in SetOperation]?: Set<SetEventListener<T>>;
};

export type ObSetOptions = {
  readonly freeUnusedResources?: boolean;
} & (
  | {
      readonly capacity: number;
      readonly replacementPolicy: ReplacementPolicy;
    }
  | {
      readonly capacity?: never;
      readonly replacementPolicy?: never;
    }
);

type ObSetStoredOptions = {
  readonly [key in keyof ObSetOptions]-?: ObSetOptions[key];
};

export type OnceOptions = Omit<OnOptions, 'once'>;

export type OnOptions = {
  readonly once?: boolean;
};

// prettier-ignore
export type ReplacementPolicy =
  | 'FIFO'
  | 'LIFO'

export type SetEventListener<T> = (this: void, value: T, operation: SetOperation, obset: ObSet<T>) => void;

// prettier-ignore
export type SetOperation =
  | 'add'
  | 'empty'
  | 'full'
  | 'remove'

export type ObSetProps<T> = {
  readonly initialValues?: Iterable<T>;
  readonly options?: ObSetOptions;
  readonly overrides?: {
    readonly toJSON?: (this: ObSet<T>, key?: string) => string | object;
  };
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Scoped Globals *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const SET_OPERATIONS = every<SetOperation>({
  add: true,
  empty: true,
  full: true,
  remove: true,
} as const);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// * Implementation *
////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class ObSet<T> extends Set<T> {
  get isFull(): boolean {
    if (this.isEmpty) return false;

    const { capacity } = this.options;

    if (!capacity) return false;

    return this.size < capacity;
  }

  get isEmpty(): boolean {
    return !this.size;
  }

  /** @internal */
  private leastRecentlyAdded?: T;

  /** @internal */
  private mostRecentlyAdded?: T;

  /** @internal */
  private readonly oneTimeListeners: SetEventListener<T>[] = [];

  /** @internal */
  private readonly options: ObSetStoredOptions;

  /** @internal */
  private readonly operationListeners: Listeners<T> = {
    add: new Set<SetEventListener<T>>(),
    empty: new Set<SetEventListener<T>>(),
    full: new Set<SetEventListener<T>>(),
    remove: new Set<SetEventListener<T>>(),
  } as const;

  readonly toJSON: (this: this, key?: string) => string | object;

  /** @internal */
  private readonly valueListeners: Map<T, MaybeListeners<T>> = new Map<T, MaybeListeners<T>>();

  constructor(props?: never);
  constructor(props: ObSetProps<T>);
  constructor({ initialValues, overrides, options }: ObSetProps<T> = {}) {
    super(); /** NOTE: passing `initialValues` directly to `super()` results in an infinite loop. (＃°Д°) */

    this.options = {
      capacity: Number.POSITIVE_INFINITY,
      freeUnusedResources: true,
      replacementPolicy: 'FIFO',
      ...options,
    } as const;

    if (initialValues) {
      for (const value of initialValues) {
        if (this.isEmpty) this.leastRecentlyAdded = value;

        super.add(value);

        this.mostRecentlyAdded = value;
      }
    }

    this.toJSON = overrides?.toJSON ?? this.defaultToJSON;
  }

  override add(this: this, value: T): this {
    if (this.has(value)) return this;

    if (this.isFull) return this.replace(value);

    if (this.isEmpty) this.leastRecentlyAdded = value;

    super.add(value);
    this.mostRecentlyAdded = value;
    this.dispatchEvent('add', value);

    return this.isFull ? this.dispatchEvent('full', value) : this;
  }

  /** @internal */
  private defaultToJSON(this: this): readonly T[] {
    return [...this] as const;
  }

  /** @internal */
  private replace(this: this, value: T): this {
    const { replacementPolicy } = this.options;

    switch (replacementPolicy) {
      case 'FIFO': {
        this.delete(this.leastRecentlyAdded as T);
        break;
      }

      case 'LIFO': {
        this.delete(this.mostRecentlyAdded as T);
        break;
      }

      default: {
        unreachable(replacementPolicy);
      }
    }

    return this.add(value);
  }

  override clear(this: this): this {
    for (const value of this) {
      this.delete(value);
    }

    return this;
  }

  clone(this: this): ObSet<T> {
    const clone = new ObSet<T>({ initialValues: this, options: this.options });

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

  /** Alias for `remove`. */ // @ts-expect-error the base method we are overriding isn't chainable (returning a boolean instead of `this`).
  override delete(this: this, value: T): this {
    if (!this.has(value)) return this;

    super.delete(value);
    this.dispatchEvent('remove', value);

    return this.isEmpty ? this.dispatchEvent('empty', value) : this;
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

  every(this: this, predicate: (this: void, value: T, index: number, obset: this) => boolean): boolean {
    let i = 0;

    for (const value of this) {
      if (!predicate(value, i++, this)) return false;
    }

    return true;
  }

  filter<U extends T>(this: this, predicate: (this: void, value: T, index: number, obset: this) => value is U): readonly U[];
  filter(this: this, predicate: (this: void, value: T, index: number, obset: this) => boolean): readonly T[];
  filter<U extends T>(this: this, predicate: (this: void, value: T, index: number, obset: this) => boolean): readonly T[] | readonly U[] {
    const filtered: T[] = [];

    let i = 0;

    for (const value of this) {
      if (predicate(value, i++, this)) {
        filtered.push(value);
      }
    }

    return filtered;
  }

  find<U extends T>(this: this, predicate: (this: void, value: T, index: number, obset: this) => value is U): U | undefined;
  find(this: this, predicate: (this: void, value: T, index: number, obset: this) => boolean): T | undefined;
  find<U extends T>(this: this, predicate: (this: void, value: T, index: number, obset: this) => boolean): T | U | undefined {
    let i = 0;

    for (const value of this) {
      if (predicate(value, i++, this)) return value;
    }

    return undefined;
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
  private freeUnusedResourcesIn(this: this, operationListeners: MaybeListeners<T>, value: T): void {
    const withoutListeners: readonly SetOperation[] = this.findOperationsWithoutListenersIn(operationListeners);

    // Free any sets without listeners
    for (const operation of withoutListeners) {
      operationListeners[operation] = undefined;
    }

    if (isEmpty(operationListeners)) return;

    // Free any values without sets
    this.valueListeners.delete(value);
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

  map<U>(this: this, into: (this: void, value: T, index: number, obset: this) => U): readonly U[] {
    const mapped: U[] = [];

    let i = 0;

    for (const value of this) {
      mapped.push(into(value, i++, this));
    }

    return mapped;
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

  /** Alias for `delete`. */
  remove(this: this, value: T): this {
    return this.delete(value);
  }

  /** Alias for `removeEventListener`. */
  off(this: this, operation: SetOperation, value: T, listener: SetEventListener<T>): this {
    const operationListeners = this.valueListeners.get(value);

    if (!operationListeners) return this;

    const eventListeners = operationListeners[operation];

    if (!eventListeners) return this;

    eventListeners.delete(listener);
    this.deleteOneTimeListener(listener);

    if (this.options.freeUnusedResources) this.freeUnusedResourcesIn(operationListeners, value);

    return this;
  }

  some(this: this, predicate: (this: void, value: T, index: number, obset: this) => boolean): boolean {
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
