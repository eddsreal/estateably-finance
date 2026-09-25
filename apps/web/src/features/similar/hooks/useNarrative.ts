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

const COOLDOWN_SECONDS = 5;

type Options = { onError: (error: unknown) => void; onSettle?: () => void };

export function useNarrative({ onError, onSettle }: Options) {
  const [state, setState] = useState<NarrativeState>(IDLE);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  const onSettleRef = useRef(onSettle);

  useEffect(() => {
    onErrorRef.current = onError;
    onSettleRef.current = onSettle;
  }, [onError, onSettle]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const coolingDown = secondsLeft > 0;

  useEffect(() => {
    if (!coolingDown) return;
    const timer = setInterval(() => setSecondsLeft((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, [coolingDown]);

  const start = useCallback(async (range: Range) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'streaming', text: '' });
    let reading = false;
    const settle = (next: Partial<NarrativeState>) => {
      controllerRef.current = null;
      onSettleRef.current?.();
      setState((current) => ({ ...current, ...next }));
      setSecondsLeft(COOLDOWN_SECONDS);
    };
    try {
      const { data, error, response } = await api.POST('/reports/similar/narrative', {
        body: range,
        parseAs: 'stream',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (error !== undefined || !data) {
        controllerRef.current = null;
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
          settle({ status: outcome, reason });
          return;
        }
      }
      if (!controller.signal.aborted) settle({ status: 'incomplete', reason: 'connection' });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (reading) {
        settle({ status: 'incomplete', reason: 'connection' });
        return;
      }
      controllerRef.current = null;
      onSettleRef.current?.();
      setState(IDLE);
      onErrorRef.current(error);
    }
  }, []);

  const stop = useCallback(() => {
    const controller = controllerRef.current;
    if (controller === null) return;
    controller.abort();
    controllerRef.current = null;
    setState((current) => ({ ...current, status: 'stopped' }));
    setSecondsLeft(COOLDOWN_SECONDS);
  }, []);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState(IDLE);
  }, []);

  return { ...state, coolingDown, secondsLeft, start, stop, clear };
}
