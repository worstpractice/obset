export const unreachable = (nope: never): never => {
  throw new RangeError(`Unhandled case: ${nope}`);
};
