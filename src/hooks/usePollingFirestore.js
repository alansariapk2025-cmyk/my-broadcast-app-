import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_INTERVAL = 90_000;

/**
 * Fetches Firestore data on mount and at intervals (Spark-friendly vs onSnapshot).
 */
export function usePollingFirestore(fetchFn, deps = [], intervalMs = DEFAULT_INTERVAL) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const result = await fetchFn();
        if (mountedRef.current) {
          setData(Array.isArray(result) ? result : []);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (mountedRef.current) setError(err);
      } finally {
        if (mountedRef.current && !silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );

  useEffect(() => {
    mountedRef.current = true;
    refresh(false);
    const timer = setInterval(() => refresh(true), intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  return { data, loading, error, refresh, lastUpdated };
}

export default usePollingFirestore;
