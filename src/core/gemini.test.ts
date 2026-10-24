import { describe, it, expect, vi } from 'vitest';
import { GeminiClassifier, type Generate } from './gemini';
import type { GenerateContentResponse } from '@google/genai';
const image = { base64: '/9j/AAAA', mimeType: 'image/jpeg' as const };
const response = (text: string) => ({ text }) as GenerateContentResponse;
describe('Gemini adapter', () => {
  it('explains missing configuration', async () => {
    await expect(new GeminiClassifier('', 'model').classify(image)).rejects.toThrow(
      'key is missing',
    );
  });
  it.each(['paper', 'plastic', 'trash', 'unknown'])(
    'validates %s and sends one inline JPEG with cancellation and no retries',
    async (category) => {
      const generate = vi
        .fn<Generate>()
        .mockResolvedValue(
          response(JSON.stringify({ category, itemName: 'Item', reason: 'Visible material.' })),
        );
      const signal = new AbortController().signal;
      expect(
        (await new GeminiClassifier('secret', 'chosen-model', generate).classify(image, signal))
          .category,
      ).toBe(category === 'unknown' ? 'trash' : category);
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate.mock.calls[0][0]).toMatchObject({
        model: 'chosen-model',
        config: { abortSignal: signal, httpOptions: { retryOptions: { attempts: 1 } } },
        contents: [
          {
            parts: [
              { text: expect.any(String) },
              { inlineData: { data: image.base64, mimeType: 'image/jpeg' } },
            ],
          },
        ],
      });
    },
  );
  it.each([
    '',
    'no json',
    '{"category":"metal"}',
    JSON.stringify({ category: 'paper', itemName: 'Item', reason: 'Reason', extra: true }),
    JSON.stringify({ category: 'paper', itemName: 'x'.repeat(101), reason: 'Reason' }),
  ])('rejects invalid output', async (text) => {
    await expect(
      new GeminiClassifier('key', 'model', vi.fn().mockResolvedValue(response(text))).classify(
        image,
      ),
    ).rejects.toThrow('invalid result');
  });
  it('rejects a blocked result', async () => {
    await expect(
      new GeminiClassifier(
        'key',
        'model',
        vi.fn().mockResolvedValue({ promptFeedback: { blockReason: 'SAFETY' } }),
      ).classify(image),
    ).rejects.toThrow('blocked');
  });
  it.each([401, 403, 404, 429, 500])('sanitizes provider errors (%s)', async (status) => {
    const adapter = new GeminiClassifier(
      'secret',
      'model',
      vi.fn().mockRejectedValue({ status, message: 'secret image payload', request: image }),
    );
    await expect(adapter.classify(image)).rejects.toThrow(/Gemini/);
    try {
      await adapter.classify(image);
    } catch (error) {
      expect(String(error)).not.toMatch(/secret|payload|AAAA/);
    }
  });
});

it.each([408, 504])('identifies provider deadline errors (%s)', async (status) => {
  const adapter = new GeminiClassifier(
    'key',
    'gemini-3.8-flash',
    vi.fn().mockRejectedValue({ status, message: 'private-provider-data' }),
  );
  await expect(adapter.classify(image)).rejects.toThrow('request deadline');
});
it('requests low thinking effort for Gemini 3 without changing the model', async () => {
  const generate = vi
    .fn<Generate>()
    .mockResolvedValue(
      response(
        JSON.stringify({ category: 'unknown', itemName: 'No item', reason: 'Empty frame.' }),
      ),
    );
  await new GeminiClassifier('key', 'gemini-3.8-flash', generate).classify(image);
  expect(generate.mock.calls[0][0]).toMatchObject({
    model: 'gemini-3.8-flash',
    config: { thinkingConfig: { thinkingLevel: 'LOW' } },
  });
});

it('restricts the requested schema to three bins and routes uncertainty to trash', async () => {
  const generate = vi
    .fn<Generate>()
    .mockResolvedValue(
      response(
        JSON.stringify({
          category: 'unknown',
          itemName: 'Unclear object',
          reason: 'Please rescan.',
        }),
      ),
    );
  const result = await new GeminiClassifier('key', 'model', generate).classify(image);
  expect(result).toMatchObject({ category: 'trash', reason: expect.stringContaining('fallback') });
  expect(result.reason).not.toMatch(/rescan/i);
  const schema = generate.mock.calls[0][0].config?.responseJsonSchema as {
    properties: { category: { enum: string[] } };
  };
  expect(schema.properties.category.enum).toEqual(['trash', 'paper', 'plastic']);
});
