import type { WarnIfMissing } from '../typings/warnIfMissing.js';

export const createEvery = <T extends string>() => {
  const every = <U extends { readonly [key in T]-?: readonly [key] }>(...allKeysIncluded: readonly [U[keyof U]]) => {
    return Object.keys(allKeysIncluded);
  };

  return every;
};

export const every = <T extends string | number>(allKeysIncluded: WarnIfMissing<T>) => {
  return Object.keys(allKeysIncluded);
};
