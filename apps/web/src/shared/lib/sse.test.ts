import { describe, expect, it } from 'vitest';
import { parseSse, SseEvent } from './sse';

function streamOf(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of parseSse(streamOf(chunks))) events.push(event);
  return events;
}

describe('parseSse', () => {
  it('joins an event split across chunks', async () => {
    await expect(collect(['event: del', 'ta\ndata: {"text":"R', 'ent"}\n', '\n'])).resolves.toEqual(
      [{ event: 'delta', data: '{"text":"Rent"}' }],
    );
  });

  it('reads several events from one chunk, in order', async () => {
    await expect(
      collect(['event: delta\ndata: {"text":"a"}\n\nevent: end\ndata: {"outcome":"complete"}\n\n']),
    ).resolves.toEqual([
      { event: 'delta', data: '{"text":"a"}' },
      { event: 'end', data: '{"outcome":"complete"}' },
    ]);
  });

  it('ignores a trailing partial block when the stream closes', async () => {
    await expect(
      collect(['event: delta\ndata: {"text":"a"}\n\nevent: end\ndata: {"out']),
    ).resolves.toEqual([{ event: 'delta', data: '{"text":"a"}' }]);
  });

  it('defaults the event name to message when the line is absent', async () => {
    await expect(collect(['data: hello\n\n'])).resolves.toEqual([
      { event: 'message', data: 'hello' },
    ]);
  });
});
