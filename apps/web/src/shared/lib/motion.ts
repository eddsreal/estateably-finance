function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function timeLimitMs(name: string): number {
  const value = token(name);
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  return value.endsWith('ms') ? amount : amount * 1000;
}

export function durationMs(name: string): number {
  return prefersReducedMotion() ? 0 : timeLimitMs(name);
}

function bezier(p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

export function easeOutCurve(): string {
  return token('--ease-out').replaceAll(' ', '');
}

export function easeOut(progress: number): number {
  const match = /cubic-bezier\(([^)]+)\)/.exec(token('--ease-out'));
  if (!match) return progress;
  const [x1, y1, x2, y2] = match[1].split(',').map(Number);
  let low = 0;
  let high = 1;
  for (let step = 0; step < 30; step += 1) {
    const mid = (low + high) / 2;
    if (bezier(x1, x2, mid) < progress) low = mid;
    else high = mid;
  }
  return bezier(y1, y2, (low + high) / 2);
}

export function animate(duration: number, onFrame: (eased: number) => void): () => void {
  if (duration <= 0) {
    onFrame(1);
    return () => undefined;
  }
  let frame = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    onFrame(progress === 1 ? 1 : easeOut(progress));
    if (progress < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
