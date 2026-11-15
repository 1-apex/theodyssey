import { useCallback, useEffect, useRef, useState } from 'react';

import { visibleChars } from './typing';
import { useReducedMotion } from './useReducedMotion';

/**
 * Reveals `text` like someone writing it. Returns how many characters to show and a `skip`
 * that shows the rest at once. `onDone` fires once the whole text is visible, whether it
 * finished, was skipped, or motion is reduced (then the text shows immediately).
 * While `active` is false everything is shown. The timer stops on unmount.
 */
export function useTypewriter(text: string, active: boolean, onDone: () => void) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  const skip = useCallback(() => {
    setCount(text.length);
    done.current();
  }, [text]);

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      done.current();
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      const n = visibleChars(text.length, Date.now() - start);
      setCount(n);
      if (n >= text.length) {
        clearInterval(timer);
        done.current();
      }
    }, 33);
    return () => clearInterval(timer);
  }, [active, text, reduced]);

  return { shown: active && !reduced ? count : text.length, skip };
}
