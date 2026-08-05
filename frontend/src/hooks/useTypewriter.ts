import { useEffect, useRef, useState } from "react";

export function useTypewriter(text: string, active: boolean, msPerChar: number) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active || !text) {
      if (!active) setDisplayed(text || "");
      return;
    }

    setDisplayed("");
    indexRef.current = 0;

    const timer = window.setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        window.clearInterval(timer);
        return;
      }
      setDisplayed(text.slice(0, indexRef.current));
    }, msPerChar);

    return () => window.clearInterval(timer);
  }, [text, active, msPerChar]);

  const isComplete = active && displayed.length === text.length && text.length > 0;
  return { displayed, isComplete };
}
