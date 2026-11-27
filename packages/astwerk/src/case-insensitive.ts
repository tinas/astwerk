export function equalsIgnoringCase(a: string, b: string): boolean {
  return a.toLowerCase() == b.toLowerCase()
}

export function startsWithIgnoringCase(text: string, prefix: string): boolean {
  return text.toLowerCase().startsWith(prefix.toLowerCase())
}
