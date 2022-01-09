/* eslint-disable guard-for-in */
/* eslint-disable no-unreachable-loop */

export const isEmpty = (obj: object): boolean => {
  for (const _ in obj) return false;

  return true;
};
