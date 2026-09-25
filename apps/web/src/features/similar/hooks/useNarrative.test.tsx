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
});
