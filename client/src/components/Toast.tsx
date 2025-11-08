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
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const startRef = useRef<number>(Date.now());
  const remainingRef = useRef<number>(duration);
  const timeoutRef = useRef<number | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // trigger enter animation
    setEntered(false);
    const enterT = window.setTimeout(() => setEntered(true), 20);
    // start progress animation by transitioning width from 100% to 0%
    const el = progressRef.current;
    startRef.current = Date.now();
    remainingRef.current = duration;
    // ensure starting width is full
    if (el) {
      el.style.width = "100%";
      // small delay to allow initial render
      setTimeout(() => {
        el.style.transition = `width ${duration}ms linear`;
        el.style.width = "0%";
      }, 20);
    }
    // schedule close
    timeoutRef.current = window.setTimeout(() => startClose(), duration);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      clearTimeout(enterT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  function startClose() {
    if (closing) return;
    setClosing(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // allow exit animation (300ms) then call onRemove
    setTimeout(() => onRemove(item.id), 300);
  }

  function handleMouseEnter() {
    // pause timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const now = Date.now();
    const elapsed = now - startRef.current;
    const rem = Math.max(0, remainingRef.current - elapsed);
    remainingRef.current = rem;
    // pause CSS transition by fixing computed width
    const el = progressRef.current;
    if (el) {
      const computed = getComputedStyle(el).width;
      el.style.transition = "none";
      el.style.width = computed;
    }
  }

  function handleMouseLeave() {
    // resume timer
    startRef.current = Date.now();
    const rem = remainingRef.current;
    // restart CSS transition to 0% over remaining ms
    const el = progressRef.current;
    if (el) {
      // force reflow
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.offsetWidth;
      el.style.transition = `width ${rem}ms linear`;
      el.style.width = "0%";
    }
    timeoutRef.current = window.setTimeout(() => startClose(), rem);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`w-full max-w-sm px-4 py-3 rounded-lg shadow-lg text-white overflow-hidden transform transition-all duration-300 ease-out flex items-start gap-3 ${getBgClass(
        item.type
      )} ${
        closing
          ? "opacity-0 scale-95 -translate-y-2"
          : entered
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 -translate-y-2 scale-95"
      }`}
      style={{ willChange: "transform, opacity" }}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Icon type={item.type} />
      </div>
      <div className="flex-1">
        <div className="text-lg leading-tight">{item.message}</div>
        <div className="h-1 w-full bg-white/20 rounded-full mt-2 overflow-hidden">
          <div
            ref={progressRef}
            className="h-1 bg-white/80 rounded-full"
            style={{ width: "100%" }}
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
