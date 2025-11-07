import { useEffect, useRef, useState } from "react";

export type ToastType = "info" | "success" | "error";

export interface ToastItem {
  id: string;
  message: string;
  type?: ToastType;
}

interface ToastProps {
  readonly toasts: ToastItem[];
  readonly onRemove: (id: string) => void;
}

const DEFAULT_DURATION = 4500; // ms

function Icon({ type }: { type?: ToastType }) {
  if (type === "success")
    return (
      <svg
        className="w-5 h-5 text-white"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 10-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
          clipRule="evenodd"
        />
      </svg>
    );
  if (type === "error")
    return (
      <svg
        className="w-5 h-5 text-white"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"
          clipRule="evenodd"
        />
      </svg>
    );
  return (
    <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 10a8 8 0 1116 0A8 8 0 012 10zm9-4a1 1 0 10-2 0v4a1 1 0 102 0V6zm0 8a1 1 0 10-2 0 1 1 0 002 0z" />
    </svg>
  );
}

function getBgClass(type?: string) {
  if (type === "success")
    return "bg-gradient-to-r from-emerald-600 to-emerald-500";
  if (type === "error") return "bg-gradient-to-r from-rose-600 to-rose-500";
  return "bg-gradient-to-r from-sky-600 to-cyan-500";
}

function ToastEntry({
  item,
  onRemove,
}: {
  item: ToastItem;
  onRemove: (id: string) => void;
}) {
  const duration = DEFAULT_DURATION;
  const [remaining, setRemaining] = useState(duration);
  const [paused, setPaused] = useState(false);
  const [closing, setClosing] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = Date.now();
    const tick = () => {
      if (paused) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const now = Date.now();
      const elapsed = startRef.current ? now - startRef.current : 0;
      const rem = Math.max(0, duration - elapsed);
      setRemaining(rem);
      if (rem <= 0) {
        startClose();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  function startClose() {
    if (closing) return;
    setClosing(true);
    // allow exit animation (300ms) then call onRemove
    setTimeout(() => onRemove(item.id), 300);
  }

  const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        // resume and adjust startRef so remaining continues correctly
        startRef.current = Date.now() - (duration - remaining);
        setPaused(false);
      }}
      className={`w-full max-w-sm px-4 py-3 rounded-lg shadow-lg text-white overflow-hidden transform transition-all duration-300 ease-out flex items-start gap-3 ${getBgClass(
        item.type
      )} ${closing ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Icon type={item.type} />
      </div>
      <div className="flex-1">
        <div className="text-lg leading-tight">{item.message}</div>
        <div className="h-1 w-full bg-white/20 rounded-full mt-2 overflow-hidden">
          <div
            className="h-1 bg-white/80 rounded-full"
            style={{ width: `${pct}%`, transition: "width 120ms linear" }}
          />
        </div>
      </div>
      <div className="flex-shrink-0 ml-3">
        <button
          aria-label="Close"
          onClick={() => startClose()}
          className="text-white/90 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function Toasts(props: ToastProps) {
  const { toasts, onRemove } = props;
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastEntry item={t} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
}
