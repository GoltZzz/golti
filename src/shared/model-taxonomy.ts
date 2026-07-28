import { ModelFamily, ModelSizeTier } from './types'

const FAMILY_PATTERNS: [RegExp, ModelFamily][] = [
  [/codellama/, 'codellama'],
  [/starcoder/, 'starcoder'],
  [/devstral/, 'devstral'],
  [/deepseek/, 'deepseek'],
  [/command-?[ar]/, 'command-r'],
  [/smollm/, 'smollm'],
  [/internlm/, 'internlm'],
  [/hermes/, 'hermes'],
  [/nomic/, 'nomic'],
  [/falcon/, 'falcon'],
  [/kimi/, 'kimi'],
  [/glm|chatglm/, 'glm'],
  [/gemma/, 'gemma'],
  [/qwen|qwq/, 'qwen'],
  [/phi/, 'phi'],
  [/mistral|mixtral|magistral|ministral/, 'mistral'],
  [/llama|llava/, 'llama'],
  [/(^|[^a-z])yi([^a-z]|$)/, 'yi']
]

export function mapFamily(name: string, modelFamily?: string): ModelFamily {
  const haystack = `${name} ${modelFamily ?? ''}`.toLowerCase()
  for (const [pattern, family] of FAMILY_PATTERNS) {
    if (pattern.test(haystack)) return family
  }
  return 'other'
}

export function sizeTierFor(parameterBillions: number): ModelSizeTier {
  if (parameterBillions < 3) return 'tiny'
  if (parameterBillions < 10) return 'small'
  if (parameterBillions < 20) return 'medium'
  if (parameterBillions < 70) return 'large'
  if (parameterBillions < 100) return 'xl'
  if (parameterBillions < 500) return 'xxl'
  return 'datacenter'
}
