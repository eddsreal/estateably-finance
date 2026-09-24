import { ReactNode, useId } from 'react';
import { STAT, STAT_CAPTION, STAT_VALUE } from '../../lib/styles';

type StatProps = {
  caption: string;
  children: ReactNode;
  detail?: ReactNode;
};

export function Stat({ caption, children, detail }: StatProps) {
  const id = useId();
  return (
    <div className={STAT}>
      <span id={id} className={STAT_CAPTION}>
        {caption}
      </span>
      <output aria-labelledby={id} className={STAT_VALUE}>
        {children}
      </output>
      {detail}
    </div>
  );
}
