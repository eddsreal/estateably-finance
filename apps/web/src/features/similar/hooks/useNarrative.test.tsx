import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { narrativeStream, NarrativeStream, stubApi } from '../../../test-api-stub';
import { useNarrative } from './useNarrative';

const range = { from: '2026-09-01', to: '2026-09-30' };

function setup(answer: () => Response | { status: number; body: unknown }) {
  const signals: AbortSignal[] = [];
  stubApi({
    'POST /reports/similar/narrative': (_url: URL, init?: RequestInit) => {
      signals.push(init!.signal!);
      return answer();
    },
  });
  const onError = vi.fn<(error: unknown) => void>();
  const hook = renderHook(() => useNarrative({ onError }));
  return { hook, onError, signals };
}

function streaming() {
  let stream!: NarrativeStream;
  const context = setup(() => {
    stream = narrativeStream('abc-123');
    return stream.response;
  });
  return { ...context, stream: () => stream };
}

afterEach(() => vi.unstubAllGlobals());

describe('useNarrative', () => {
  it('appends each delta in order and completes on end, with the correlation id', async () => {
    const { hook, stream } = streaming();
    act(() => void hook.result.current.start(range));
    expect(hook.result.current.status).toBe('streaming');
    await vi.waitFor(() => expect(stream()).toBeDefined());
    act(() => stream().delta('Rent '));
    await vi.waitFor(() => expect(hook.result.current.text).toBe('Rent '));
    act(() => stream().delta('led.'));
    await vi.waitFor(() => expect(hook.result.current.text).toBe('Rent led.'));
    expect(hook.result.current.correlationId).toBe('abc-123');
    act(() => stream().end({ outcome: 'complete' }));
    await vi.waitFor(() => expect(hook.result.current.status).toBe('complete'));
    expect(hook.result.current.reason).toBeUndefined();
  });

  it('ends incomplete with the reason from end', async () => {
    const { hook, stream } = streaming();
    act(() => void hook.result.current.start(range));
    await vi.waitFor(() => expect(stream()).toBeDefined());
    act(() => {
      stream().delta('Rent');
      stream().end({ outcome: 'incomplete', reason: 'timeout' });
    });
    await vi.waitFor(() => expect(hook.result.current.status).toBe('incomplete'));
    expect(hook.result.current.reason).toBe('timeout');
    expect(hook.result.current.text).toBe('Rent');
  });

  it('treats a body that closes without end as incomplete / connection', async () => {
    const { hook, stream } = streaming();
    act(() => void hook.result.current.start(range));
    await vi.waitFor(() => expect(stream()).toBeDefined());
    act(() => {
      stream().delta('Rent');
      stream().close();
    });
    await vi.waitFor(() => expect(hook.result.current.status).toBe('incomplete'));
    expect(hook.result.current.reason).toBe('connection');
  });

  it('returns to idle and hands a pre-text error to onError', async () => {
    const body = { code: 'AI_PROVIDER_ERROR', message: 'failed', correlationId: 'x' };
    const { hook, onError } = setup(() => ({ status: 502, body }));
    act(() => void hook.result.current.start(range));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(body));
    expect(hook.result.current.status).toBe('idle');
    expect(hook.result.current.text).toBe('');
  });

  it('stop aborts, keeps the text and ignores later events', async () => {
    const { hook, stream, signals } = streaming();
    act(() => void hook.result.current.start(range));
    await vi.waitFor(() => expect(stream()).toBeDefined());
    act(() => stream().delta('Rent'));
    await vi.waitFor(() => expect(hook.result.current.text).toBe('Rent'));
    act(() => hook.result.current.stop());
    expect(hook.result.current.status).toBe('stopped');
    expect(signals[0].aborted).toBe(true);
    act(() => stream().delta(' more'));
    expect(hook.result.current.text).toBe('Rent');
    expect(hook.result.current.status).toBe('stopped');
  });

  it('clear aborts and returns to idle with no text', async () => {
    const { hook, stream, signals } = streaming();
    act(() => void hook.result.current.start(range));
    await vi.waitFor(() => expect(stream()).toBeDefined());
    act(() => stream().delta('Rent'));
    await vi.waitFor(() => expect(hook.result.current.text).toBe('Rent'));
    act(() => hook.result.current.clear());
    expect(hook.result.current).toMatchObject({ status: 'idle', text: '' });
    expect(signals[0].aborted).toBe(true);
  });

  it('start aborts the previous request and starts from empty text', async () => {
    const { hook, stream, signals } = streaming();
    act(() => void hook.result.current.start(range));
    await vi.waitFor(() => expect(stream()).toBeDefined());
    act(() => stream().delta('Old'));
    await vi.waitFor(() => expect(hook.result.current.text).toBe('Old'));
    act(() => void hook.result.current.start(range));
    expect(signals[0].aborted).toBe(true);
    expect(hook.result.current).toMatchObject({ status: 'streaming', text: '' });
  });

  it('aborts on unmount', async () => {
    const { hook, signals } = streaming();
    act(() => void hook.result.current.start(range));
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    hook.unmount();
    expect(signals[0].aborted).toBe(true);
  });

  describe('cooldown (SC-007)', () => {
    async function flush() {
      for (let step = 0; step < 10; step += 1) {
        await act(() => new Promise<void>((resolve) => setImmediate(resolve)));
      }
    }

    async function streamed() {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      const context = streaming();
      act(() => void context.hook.result.current.start(range));
      await flush();
      act(() => context.stream().delta('Rent'));
      await flush();
      return context;
    }

    function expectCountdown(hook: ReturnType<typeof streaming>['hook']) {
      expect(hook.result.current.coolingDown).toBe(true);
      for (const left of [5, 4, 3, 2, 1]) {
        expect(hook.result.current.secondsLeft).toBe(left);
        act(() => {
          vi.advanceTimersByTime(left === 1 ? 999 : 1000);
        });
      }
      expect(hook.result.current.coolingDown).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(hook.result.current.coolingDown).toBe(false);
      expect(hook.result.current.secondsLeft).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    }

    afterEach(() => vi.useRealTimers());

    it.each([
      ['complete', (stream: NarrativeStream) => stream.end({ outcome: 'complete' })],
      [
        'incomplete',
        (stream: NarrativeStream) => stream.end({ outcome: 'incomplete', reason: 'length' }),
      ],
      ['connection lost', (stream: NarrativeStream) => stream.close()],
    ])('cools down for exactly 5 s after %s', async (_name, finish) => {
      const { hook, stream } = await streamed();
      expect(hook.result.current.coolingDown).toBe(false);
      act(() => finish(stream()));
      await flush();
      expect(hook.result.current.status).not.toBe('streaming');
      expectCountdown(hook);
    });

    it('cools down for exactly 5 s after stop', async () => {
      const { hook } = await streamed();
      act(() => hook.result.current.stop());
      expect(hook.result.current.status).toBe('stopped');
      expectCountdown(hook);
    });

    it('keeps cooling down after clear', async () => {
      const { hook, stream } = await streamed();
      act(() => stream().end({ outcome: 'complete' }));
      await flush();
      act(() => hook.result.current.clear());
      expect(hook.result.current.status).toBe('idle');
      expectCountdown(hook);
    });

    it('starts no cooldown after a pre-text error', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      const body = { code: 'AI_PROVIDER_ERROR', message: 'failed', correlationId: 'x' };
      const { hook, onError } = setup(() => ({ status: 502, body }));
      act(() => void hook.result.current.start(range));
      await flush();
      expect(onError).toHaveBeenCalled();
      expect(hook.result.current.coolingDown).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('leaves no timer behind after unmount', async () => {
      const { hook, stream } = await streamed();
      act(() => stream().end({ outcome: 'complete' }));
      await flush();
      expect(vi.getTimerCount()).toBe(1);
      hook.unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
