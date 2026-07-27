export interface ModelDisplay {
  displayName: string
  paramSize?: string
  quantization?: string
}

export function parseModelDisplay(name: string): ModelDisplay {
  const paramMatch = name.match(/(\d+(?:\.\d+)?[BMKbmk])/)
  const paramSize = paramMatch ? paramMatch[1].toUpperCase() : undefined

  const quantMatch = name.match(/(Q\d+_[Kk]_[MmLlSs]|\bQ\d+_\d+|\bQ\d+_[Kk]|\bQ\d+|\bFP\d+|\bBF\d+)/i)
  const quantization = quantMatch ? quantMatch[1].toUpperCase() : undefined

  let displayName = name
  if (paramMatch) displayName = displayName.replace(paramMatch[0], '')
  if (quantMatch) displayName = displayName.replace(quantMatch[0], '')
  displayName = displayName.replace(/[-_]+/g, ' ').trim()

  return {
    displayName: displayName || name,
    paramSize,
    quantization
  }
}
