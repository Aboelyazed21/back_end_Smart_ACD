import { useEffect, useState } from 'react';

interface TypewriterTextProps {
  text: string;
  className?: string;
  speed?: number;
  active?: boolean;
}

export function TypewriterText({ text, className, speed = 24, active = true }: TypewriterTextProps) {
  const [shown, setShown] = useState(active ? '' : text);
  useEffect(() => {
    if (!active) {
      setShown(text);
      return;
    }
    setShown('');
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed, active]);
  return (
    <span className={className}>
      {shown}
      {active && shown.length < text.length ? (
        <span
          className="ms-0.5 inline-block w-[2px] animate-pulse rounded-sm bg-brand-400 align-middle"
          style={{ height: '0.9em' }}
          aria-hidden
        />
      ) : null}
    </span>
  );
}
