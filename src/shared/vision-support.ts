const CLOUD_IMAGE_SUPPORT: Array<[RegExp, boolean]> = [
  [/^claude-3-5-haiku/, false],
  [/^claude-/, true],

  [/^gpt-5/, true],
  [/^o[34]-mini/, true],
  [/^o[34]/, true],
  [/^o1-mini/, false],
  [/^o1/, true],
  [/^gpt-4\.1/, true],
  [/^gpt-4o/, true],
  [/^gpt-4-turbo/, true],
  [/^gpt-4-32k/, false],
  [/^gpt-4/, false],
  [/^gpt-3\.5/, false],

  [/^gemini-/, true]
]

const CLOUD_PDF_SUPPORT: Array<[RegExp, boolean]> = [
  [/^claude-3-5-haiku/, false],
  [/^claude-3-haiku/, false],
  [/^claude-3-opus/, false],
  [/^claude-/, true],

  [/^gpt-5/, true],
  [/^gpt-4\.1/, true],
  [/^gpt-4o/, true],
  [/^gpt-/, false],
  [/^o[134]/, false],

  [/^gemini-/, true]
]

function lookup(table: Array<[RegExp, boolean]>, modelName: string): boolean | undefined {
  const name = modelName.toLowerCase()
  for (const [pattern, supported] of table) {
    if (pattern.test(name)) return supported
  }
  return undefined
}

export function lookupCloudVisionSupport(modelName: string): boolean | undefined {
  return lookup(CLOUD_IMAGE_SUPPORT, modelName)
}

export function lookupCloudPdfSupport(modelName: string): boolean | undefined {
  return lookup(CLOUD_PDF_SUPPORT, modelName)
}
