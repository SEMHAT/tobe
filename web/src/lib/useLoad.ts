import { useCallback, useEffect, useRef, useState } from "react";
import { HttpError } from "./api";

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<HttpError | null>(null);
  const [loading, setLoading] = useState(true);
  const live = useRef(true);
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fn();
      if (live.current) setData(d);
    } catch (e) {
      if (live.current) setError(e instanceof HttpError ? e : new HttpError(0, (e as Error).message));
    }
    if (live.current) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    live.current = true;
    run();
    return () => {
      live.current = false;
    };
  }, [run]);
  return { data, error, loading, reload: run, setData };
}
