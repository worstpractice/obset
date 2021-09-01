/* eslint-disable no-unreachable-loop */
/* eslint-disable guard-for-in */

export const isEmpty = (obj: object): boolean => {
  for (const anyKeyWhatsoever in obj) return false;

  return true;
};
