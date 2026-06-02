import { ModelMode, ModelClient } from '../core/types.js';
import { MockModelClient } from './mockClient.js';
import { OpenAiModelClient } from './openaiClient.js';

export function createModelClient(mode: ModelMode, model?: string): ModelClient {
  if (mode === 'openai') {
    return new OpenAiModelClient(model);
  }
  return new MockModelClient();
}
