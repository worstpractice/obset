// credits goes to https://stackoverflow.com/a/50375286
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

// Converts union to overloaded function
type UnionToOverload<U> = UnionToIntersection<U extends any ? (f: U) => void : never>;

type PopUnion<U> = UnionToOverload<U> extends (a: infer A) => void ? A : never;

type IsUnion<T> = readonly [T] extends readonly [UnionToIntersection<T>] ? false : true;

type UnionToArray<T, A extends readonly unknown[] = readonly []> = IsUnion<T> extends true ? UnionToArray<Exclude<T, PopUnion<T>>, readonly [PopUnion<T>, ...A]> : readonly [T, ...A];

export type Every<T extends string> = readonly [...UnionToArray<T>];
