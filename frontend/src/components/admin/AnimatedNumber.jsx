import { useEffect, useRef, useState } from 'react';

const DURATION = 900;

export default function AnimatedNumber({ value, decimals = 0, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  const raf = useRef(null);

  useEffect(() => {
    const from = prev.current;
    const to = Number.isFinite(value) ? value : 0;
    const start = performance.now();

    const tick = (now) => {
      const p = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else prev.current = to;
    };

    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  return (
    <>{display.toLocaleString('fr-FR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}</>
  );
}
