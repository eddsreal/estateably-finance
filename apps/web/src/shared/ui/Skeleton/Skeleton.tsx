export type SkeletonShape = 'line' | 'block' | 'row';

type SkeletonProps = {
  label: string;
  shapes: readonly SkeletonShape[];
};

const BONE =
  'relative overflow-hidden bg-sand-350 after:absolute after:inset-0 after:bg-linear-to-r after:from-transparent after:via-sand-0/80 after:to-transparent motion-safe:after:animate-shimmer';

function Bone({ shape }: { shape: SkeletonShape }) {
  if (shape === 'line') return <div className={`${BONE} h-12 w-190 rounded-xs`} />;
  if (shape === 'block') return <div className={`${BONE} h-190 w-full rounded-3xl`} />;
  return (
    <div className="flex items-center gap-12 border-b border-sand-200 py-14">
      <div className={`${BONE} size-32 flex-none rounded-pill`} />
      <div className={`${BONE} h-12 flex-1 rounded-xs`} />
      <div className={`${BONE} h-12 w-56 flex-none rounded-xs`} />
    </div>
  );
}

export function Skeleton({ label, shapes }: SkeletonProps) {
  return (
    <div aria-busy="true" className="flex flex-col gap-14">
      <span className="sr-only">{label}</span>
      {shapes.map((shape, index) => (
        <Bone key={index} shape={shape} />
      ))}
    </div>
  );
}
