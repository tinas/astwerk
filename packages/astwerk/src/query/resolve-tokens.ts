import type { Schema } from '../schema/schema'
import type { ResolveContext } from '../schema/token'
import type { Bound, Query, QueryOf } from './query'

import { findField } from '../schema/schema'
import { isTokenValue } from '../schema/token'
import { rangeCondition } from './query'

type Resolver<Type extends Query['type']> = (query: QueryOf<Type>, scope: ResolveScope) => Query

interface ResolveScope {
  schema: Schema
  context: ResolveContext & { now: Date }
}

const RESOLVE_BY_TYPE: { [Type in Query['type']]: Resolver<Type> } = {
  and: (query, scope) => ({ ...query, children: query.children.map(child => resolveNode(child, scope)) }),
  or: (query, scope) => ({ ...query, children: query.children.map(child => resolveNode(child, scope)) }),
  not: (query, scope) => ({ ...query, child: resolveNode(query.child, scope) }),
  in: (query, scope) => ({ ...query, values: query.values.map(value => resolveValue(value, query.field, scope)) }),
  range: (query, scope) =>
    rangeCondition(
      query.field,
      resolveBound(query.min, query.field, scope),
      resolveBound(query.max, query.field, scope),
    ),
  text: query => query,
  empty: query => query,
  match: query => query,
  invalid: query => query,
}

/** Replaces dynamic values such as `@today` with the values they stand for now, for a backend that needs them. */
export function resolveTokens(query: Query, schema: Schema, context: ResolveContext = {}): Query {
  return resolveNode(query, { schema, context: { ...context, now: context.now ?? new Date() } })
}

function resolveNode(query: Query, scope: ResolveScope): Query {
  const resolver = RESOLVE_BY_TYPE[query.type] as Resolver<Query['type']>
  return resolver(query, scope)
}

function resolveBound(bound: Bound | undefined, field: string, scope: ResolveScope): Bound | undefined {
  return bound && { ...bound, value: resolveValue(bound.value, field, scope) }
}

function resolveValue(value: unknown, field: string, scope: ResolveScope): unknown {
  if (!isTokenValue(value)) return value
  const tokens = findField(scope.schema, field)?.type.tokens ?? {}
  if (!Object.hasOwn(tokens, value.name)) return value
  return tokens[value.name].resolve(value.offset, scope.context)
}
