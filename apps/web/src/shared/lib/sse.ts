export type SseEvent = { event: string; data: string };

export async function* parseSse(stream: ReadableStream<string>): AsyncGenerator<SseEvent> {
  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk;
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const lines = buffer.slice(0, end).split('\n');
      buffer = buffer.slice(end + 2);
      const field = (name: string) =>
        lines
          .find((line) => line.startsWith(`${name}:`))
          ?.slice(name.length + 1)
          .trimStart();
      yield { event: field('event') ?? 'message', data: field('data') ?? '' };
      end = buffer.indexOf('\n\n');
    }
  }
}
