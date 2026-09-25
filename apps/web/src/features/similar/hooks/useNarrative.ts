import { useCallback, useEffect, useRef, useState } from 'react';
import type { components } from 'contract/src/types';
import { api } from '../../../shared/lib/api';
import { parseSse } from '../../../shared/lib/sse';

type Range = { from: string; to: string };
type DeltaEvent = components['schemas']['NarrativeDeltaEvent'];
type EndEvent = components['schemas']['NarrativeEndEvent'];

export type NarrativeStatus = 'idle' | 'streaming' | 'complete' | 'stopped' | 'incomplete';
export type NarrativeReason = NonNullable<EndEvent['reason']> | 'connection';

type NarrativeState = {
  status: NarrativeStatus;
  text: string;
  reason?: NarrativeReason;
  correlationId?: string;
};

const IDLE: NarrativeState = { status: 'idle', text: '' };

type Options = { onError: (error: unknown) => void; onSettle?: () => void };

export function useNarrative({ onError, onSettle }: Options) {
  const [state, setState] = useState<NarrativeState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  const onSettleRef = useRef(onSettle);

  useEffect(() => {
    onErrorRef.current = onError;
    onSettleRef.current = onSettle;
  }, [onError, onSettle]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(async (range: Range) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'streaming', text: '' });
    let reading = false;
    try {
      const { data, error, response } = await api.POST('/reports/similar/narrative', {
        body: range,
        parseAs: 'stream',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (error !== undefined || !data) {
        onSettleRef.current?.();
        setState(IDLE);
        onErrorRef.current(error);
        return;
      }
      reading = true;
      const correlationId = response.headers.get('X-Correlation-Id') ?? undefined;
      setState((current) => ({ ...current, correlationId }));
      for await (const { event, data: raw } of parseSse(
        data.pipeThrough(new TextDecoderStream()),
      )) {
        if (controller.signal.aborted) return;
        if (event === 'delta') {
          const { text } = JSON.parse(raw) as DeltaEvent;
          setState((current) => ({ ...current, text: current.text + text }));
        } else if (event === 'end') {
          const { outcome, reason } = JSON.parse(raw) as EndEvent;
          onSettleRef.current?.();
          setState((current) => ({ ...current, status: outcome, reason }));
          return;
        }
      }
      if (!controller.signal.aborted) {
        onSettleRef.current?.();
        setState((current) => ({ ...current, status: 'incomplete', reason: 'connection' }));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (reading) {
        onSettleRef.current?.();
        setState((current) => ({ ...current, status: 'incomplete', reason: 'connection' }));
        return;
      }
      onSettleRef.current?.();
      setState(IDLE);
      onErrorRef.current(error);
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    setState((current) =>
      current.status === 'streaming' ? { ...current, status: 'stopped' } : current,
    );
  }, []);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    setState(IDLE);
  }, []);

  return { ...state, start, stop, clear };
}
