import type { Span } from './syntax/syntax-tree'

export const DIAGNOSTIC_CODE = {
  unknownField: 'unknownField',
  invalidValue: 'invalidValue',
  unknownToken: 'unknownToken',
  unsupportedOperator: 'unsupportedOperator',
  negatedGroup: 'negatedGroup',
  unclosedQuote: 'unclosedQuote',
  unbalancedParenthesis: 'unbalancedParenthesis',
  nestingTooDeep: 'nestingTooDeep',
  emptyRange: 'emptyRange',
} as const

export type DiagnosticCode = (typeof DIAGNOSTIC_CODE)[keyof typeof DIAGNOSTIC_CODE]

/**
 * An `error` marks a part that filters nothing. A `warning` marks text that is read and filters, but maybe not as
 * meant.
 */
export const DIAGNOSTIC_SEVERITY = {
  error: 'error',
  warning: 'warning',
} as const

export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITY)[keyof typeof DIAGNOSTIC_SEVERITY]

/** A problem in the query text. It carries no message, so the app words it from `code`. */
export interface Diagnostic extends Span {
  code: DiagnosticCode
  severity: DiagnosticSeverity
}

const SEVERITY_BY_CODE: Record<DiagnosticCode, DiagnosticSeverity> = {
  unknownField: DIAGNOSTIC_SEVERITY.error,
  invalidValue: DIAGNOSTIC_SEVERITY.error,
  unknownToken: DIAGNOSTIC_SEVERITY.error,
  unsupportedOperator: DIAGNOSTIC_SEVERITY.error,
  negatedGroup: DIAGNOSTIC_SEVERITY.error,
  unclosedQuote: DIAGNOSTIC_SEVERITY.warning,
  unbalancedParenthesis: DIAGNOSTIC_SEVERITY.warning,
  nestingTooDeep: DIAGNOSTIC_SEVERITY.warning,
  emptyRange: DIAGNOSTIC_SEVERITY.warning,
}

export function createDiagnostic(code: DiagnosticCode, span: Span): Diagnostic {
  return { code, severity: SEVERITY_BY_CODE[code], from: span.from, to: span.to }
}
