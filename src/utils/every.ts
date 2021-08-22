import type { WarnIfMissing } from '../typings/warnIfMissing.js';

export const every = <T extends string | number>(allKeysIncluded: WarnIfMissing<T>) => {
  return Object.keys(allKeysIncluded);
};
