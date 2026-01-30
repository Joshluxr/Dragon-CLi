import { useState, useCallback, useRef, useEffect } from "react";

export type JSONStreamStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "completed"
  | "error";

export type JSONStreamOptions<T> = {
  url: string;
  body?: any;
  onData?: (data: T) => void;
  onComplete?: (allData: T[]) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: JSONStreamStatus) => void;
};

export function useJSONStream<T = any>({
  url,
  body,
  onData,
  onComplete,
  onError,
  onStatusChange,
}: JSONStreamOptions<T>) {
  const [data, setData] = useState<T[]>([]);
  const [status, setStatus] = useState<JSONStreamStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateStatus = useCallback(
    (newStatus: JSONStreamStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange],
  );

  const addData = useCallback(
    (item: T) => {
      setData((prev) => [...prev, item]);
      onData?.(item);
    },
    [onData],
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (status === "streaming" || status === "connecting") {
      updateStatus("completed");
    }
  }, [status, updateStatus]);

  const start = useCallback(
    async ({ body: bodyOverride }: { body?: any }) => {
      if (status === "streaming" || status === "connecting") {
        return;
      }

      setData([]);
      setError(null);
      updateStatus("connecting");

      abortControllerRef.current = new AbortController();
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...body,
            ...bodyOverride,
          }),
          credentials: "same-origin",
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("Response body is not readable");
        }

        updateStatus("streaming");

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            if (buffer.trim()) {
              try {
                const parsedData = JSON.parse(buffer) as T;
                addData(parsedData);
              } catch (err) {
                console.error("Error parsing final JSON buffer:", err);
              }
            }
            updateStatus("completed");
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            if (trimmedLine.startsWith("data: ")) {
              const jsonStr = trimmedLine.slice(6);

              if (jsonStr === "[DONE]") {
                updateStatus("completed");
                return;
              }

              try {
                const parsedData = JSON.parse(jsonStr) as T;
                addData(parsedData);
              } catch (err) {
                console.error("Error parsing SSE JSON data:", err);
              }
            } else {
              try {
                const parsedData = JSON.parse(trimmedLine) as T;
                addData(parsedData);
              } catch (err) {
                console.error("Error parsing JSON line:", err);
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          updateStatus("completed");
          return;
        }

        console.error("Stream error:", err);
        const streamError =
          err instanceof Error ? err : new Error("Stream connection failed");
        setError(streamError);
        updateStatus("error");
        onError?.(streamError);
      }
    },
    [url, body, status, updateStatus, addData, onError],
  );

  const clear = useCallback(() => {
    setData([]);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setData([]);
    setError(null);
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  useEffect(() => {
    if (status === "completed" && onComplete) {
      onComplete(data);
    }
  }, [status, data, onComplete]);

  return {
    data,
    status,
    error,
    start,
    stop,
    reset,
    clear,
    isIdle: status === "idle",
    isConnecting: status === "connecting",
    isStreaming: status === "streaming",
    isCompleted: status === "completed",
    isError: status === "error",
  };
}
