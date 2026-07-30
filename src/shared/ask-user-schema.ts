/**
 * JSON Schema for an ask-user block, handed to llama.cpp's `response_format` so
 * the sampler physically cannot emit malformed JSON. Constrained output has no
 * fence, which the unfenced fallback in `extractAllAskUser` already accepts.
 */
export const ASK_USER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string', minLength: 1 },
    confidence: { type: 'integer', minimum: 1, maximum: 5 },
    options: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          recommended: { type: 'boolean' }
        },
        required: ['label', 'description']
      }
    },
    allowFreeText: { type: 'boolean' },
    multiSelect: { type: 'boolean' }
  },
  required: ['question', 'confidence', 'options', 'allowFreeText']
} as const
