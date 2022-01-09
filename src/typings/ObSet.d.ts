import type { ObSet } from '../ObSet.js';

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
