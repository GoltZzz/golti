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
    reasoning: { type: 'string' },
    aspect: { type: 'string' },
    assumptions: {
      type: 'array',
      items: { type: 'string' }
    },
    type: { type: 'string', enum: ['question', 'summary'] },
    summary: {
      type: 'object',
      properties: {
        decisions: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, value: { type: 'string' } }
          }
        },
        assumptions: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, value: { type: 'string' } }
          }
        },
        tradeoffs: {
          type: 'array',
          items: {
            type: 'object',
            properties: { chosen: { type: 'string' }, over: { type: 'string' }, reason: { type: 'string' } }
          }
        }
      }
    },
    options: {
      type: 'array',
      minItems: 0,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          recommended: { type: 'boolean' },
          recommendedRationale: { type: 'string' }
        },
        required: ['label']
      }
    },
    allowFreeText: { type: 'boolean' },
    multiSelect: { type: 'boolean' }
  },
  required: ['question', 'confidence']
} as const
