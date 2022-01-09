import { swapPop } from 'swappop';

export class ArrayMap<T> {
  /** @internal */
  private readonly indexes: Map<T, number> = new Map<T, number>();

  readonly internalArray: readonly T[];

  get size(): number {
    return this.values.length;
  }

  /** @internal */
  private readonly values: T[] = [];

  constructor(initialValues: readonly T[]) {
    this.internalArray = this.values;

    for (let i = 0; i < initialValues.length; i++) {
      this.add(initialValues[i] as T);
    }
  }

  add(this: this, value: T): boolean {
    if (this.indexes.has(value)) return false;

    this.indexes.set(
      //
      value,
      this.values.push(value) - 1,
    );

    return true;
  }

  has(this: this, value: T): boolean {
    return this.indexes.has(value);
  }

  remove(this: this, value: T): boolean {
    const i = this.indexes.get(value);

    if (i === undefined) return false;

    this.indexes.delete(value);
    this.indexes.set(
      //
      this.values[this.values.length - 1] as T,
      i,
    );

    swapPop(this.values, i);

    return true;
  }
}
