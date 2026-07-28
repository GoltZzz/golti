const MAX_LENGTH = 280

export function presentableErrorMessage(err: unknown): string {
  const raw =
    (err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message ?? '')
      : String(err ?? '')
    ).trim() || 'Something went wrong while generating a response.'

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const looksLikeLog = lines.length > 3 || lines.some((line) => /^\d+\.\d{2}\.\d{3}/.test(line))
  const text = looksLikeLog ? lines[0] : lines.join(' ')

  const flattened = text
    .replace(/```+/g, '')
    .replace(/`/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!flattened) return 'Something went wrong while generating a response.'
  if (flattened.length <= MAX_LENGTH) return flattened
  return `${flattened.slice(0, MAX_LENGTH).trimEnd()}…`
}
