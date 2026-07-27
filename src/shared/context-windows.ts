export const DEFAULT_LOCAL_CONTEXT_TARGET = 32768

const CLOUD_CONTEXT_WINDOWS: Array<[RegExp, number]> = [
  [/^claude-/, 200000],

  [/^gpt-5/, 400000],
  [/^o[34]-mini/, 200000],
  [/^o[134]/, 200000],
  [/^gpt-4\.1/, 1047576],
  [/^gpt-4o/, 128000],
  [/^gpt-4-turbo/, 128000],
  [/^gpt-4-32k/, 32768],
  [/^gpt-4/, 8192],
  [/^gpt-3\.5-turbo/, 16385],

  [/^gemini-2\.5-pro/, 1048576],
  [/^gemini-2\.0-flash/, 1048576],
  [/^gemini-1\.5-pro/, 2097152],
  [/^gemini-1\.5-flash/, 1048576],
  [/^gemini-/, 32768]
]

export function lookupCloudContextWindow(modelName: string): number | undefined {
  const name = modelName.toLowerCase()
  for (const [pattern, window] of CLOUD_CONTEXT_WINDOWS) {
    if (pattern.test(name)) return window
  }
  return undefined
}
