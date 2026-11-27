export type OfType<Union extends { type: string }, Type extends Union['type']> = Union extends unknown
  ? Type extends Union['type']
    ? Union
    : never
  : never
