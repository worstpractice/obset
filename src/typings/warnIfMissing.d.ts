export type WarnIfMissing<T extends PropertyKey> = {
  readonly [key in T]-?: true;
};
