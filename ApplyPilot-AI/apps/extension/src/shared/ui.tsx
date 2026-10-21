import { animate, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Loader2, Plane, RotateCw } from "lucide-react";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div style={{ width: size, height: size }} className="grid place-items-center rounded-sm bg-gradient-to-br from-accent to-accent-violet shadow-card" aria-hidden>
        <Plane size={size * 0.55} className="text-bg" strokeWidth={2.5} />
      </div>
      <span className="font-display text-[15px] font-bold tracking-tight">ApplyPilot <span className="text-accent">AI</span></span>
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "subtle" | "danger"; loading?: boolean; icon?: ReactNode; block?: boolean };
export function Button({ variant = "primary", loading, icon, block, children, className, disabled, ...p }: BtnProps) {
  const v = {
    primary: "bg-accent text-bg hover:bg-accent/90 font-semibold",
    subtle: "bg-elevated text-ink hover:bg-line border border-line",
    ghost: "text-ink-dim hover:text-ink hover:bg-elevated",
    danger: "bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20",
  }[variant];
  return (
    <button {...p} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx("inline-flex h-9 items-center justify-center gap-2 rounded-sm px-3 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50", v, block && "w-full", className)}>
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={cx("rounded-md border border-line bg-card p-3.5 shadow-card", className)}>{children}</section>
);

export const SectionTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="mb-2 flex items-center justify-between"><h3 className="font-display text-[12px] font-medium uppercase tracking-wider text-ink-dim">{children}</h3>{aside}</div>
);

type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "violet";
const TONES: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok border-ok/25", warn: "bg-warn/10 text-warn border-warn/25", bad: "bg-bad/10 text-bad border-bad/25",
  info: "bg-accent/10 text-accent border-accent/25", violet: "bg-accent-violet/10 text-accent-violet border-accent-violet/25", neutral: "bg-elevated text-ink-dim border-line",
};
export const Badge = ({ tone = "neutral", children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) => (
  <span className={cx("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium", TONES[tone])}>{icon}{children}</span>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cx("relative overflow-hidden rounded-sm bg-elevated", className)}>
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
  </div>
);

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-line px-4 py-6 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-md bg-elevated text-accent" aria-hidden>{icon}</div>
      <p className="font-display text-[14px] font-medium">{title}</p>
      {children && <p className="max-w-[28ch] text-ink-dim">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onRetry, tone = "bad" }: { message: string; onRetry?: () => void; tone?: "bad" | "warn" }) {
  return (
    <div role="alert" className={cx("flex items-start gap-2 rounded-sm border p-2.5", tone === "bad" ? "border-bad/30 bg-bad/10 text-bad" : "border-warn/30 bg-warn/10 text-warn")}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
      <p className="flex-1 text-[12px] text-ink">{message}</p>
      {onRetry && <button onClick={onRetry} className="flex items-center gap-1 text-[12px] font-medium underline-offset-2 hover:underline"><RotateCw size={12} aria-hidden />Retry</button>}
    </div>
  );
}

export const SuccessNote = ({ children }: { children: ReactNode }) => (
  <div role="status" className="flex items-start gap-2 rounded-sm border border-ok/30 bg-ok/10 p-2.5 text-[12px] text-ink"><Check size={15} className="mt-0.5 shrink-0 text-ok" aria-hidden />{children}</div>
);

const field = "w-full rounded-sm border border-line bg-bg-2 px-2.5 text-[13px] text-ink placeholder:text-ink-dim/60 transition-colors hover:border-ink-dim/40 focus:border-accent";
export function Field({ label, hint, error, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-ink-dim">{label}</label>
      <input id={id} {...p} aria-invalid={!!error || undefined} aria-describedby={hint || error ? `${id}-d` : undefined} className={cx(field, "h-9", error && "border-bad")} />
      {(hint || error) && <p id={`${id}-d`} className={cx("mt-1 text-[11px]", error ? "text-bad" : "text-ink-dim")}>{error ?? hint}</p>}
    </div>
  );
}
export function TextArea({ label, hint, error, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-ink-dim">{label}</label>
      <textarea id={id} {...p} aria-invalid={!!error || undefined} aria-describedby={hint || error ? `${id}-d` : undefined} className={cx(field, "min-h-[120px] resize-y py-2 leading-snug", error && "border-bad")} />
      {(hint || error) && <p id={`${id}-d`} className={cx("mt-1 text-[11px]", error ? "text-bad" : "text-ink-dim")}>{error ?? hint}</p>}
    </div>
  );
}

export function Select({ label, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-ink-dim">{label}</label>
      <select id={id} {...p} className={cx(field, "h-9")}>{children}</select>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" aria-label="Sections" className="flex gap-0.5 overflow-x-auto border-b border-line px-2">
      {tabs.map((t, i) => {
        const on = t.id === value;
        return (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={on} aria-controls={`panel-${t.id}`} tabIndex={on ? 0 : -1} onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
              if (n != null) { const next = tabs[(n + tabs.length) % tabs.length]; onChange(next.id); document.getElementById(`tab-${next.id}`)?.focus(); }
            }}
            className={cx("relative flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-[12px] font-medium transition-colors", on ? "text-ink" : "text-ink-dim hover:text-ink")}>
            {t.icon}{t.label}
            {on && <motion.span layoutId="tab-underline" className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

/** Animated compatibility ring. The label under it states the band in words so meaning never depends on colour alone. */
export function ScoreRing({ score, size = 112 }: { score: number; size?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? score : 0);
  useEffect(() => {
    if (reduce) { setShown(score); return; }
    const c = animate(0, score, { duration: 0.9, ease: "easeOut", onUpdate: (v) => setShown(v) });
    return () => c.stop();
  }, [score, reduce]);
  const r = 46, C = 2 * Math.PI * r;
  const color = score >= 70 ? "#34D399" : score >= 45 ? "#FBBF24" : "#F87171";
  const band = score >= 70 ? "Strong overlap" : score >= 45 ? "Partial overlap" : "Limited overlap";
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`Estimated compatibility ${Math.round(score)} out of 100: ${band}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 110 110" width={size} height={size} className="-rotate-90">
          <circle cx="55" cy="55" r={r} fill="none" stroke="#283244" strokeWidth="8" />
          <motion.circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={C}
            initial={{ strokeDashoffset: reduce ? C * (1 - score / 100) : C }} animate={{ strokeDashoffset: C * (1 - score / 100) }} transition={{ duration: reduce ? 0 : 0.9, ease: "easeOut" }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center"><span className="font-mono text-[26px] font-medium tabular-nums">{Math.round(shown)}</span></div>
      </div>
      <span className="text-[11px] font-medium" style={{ color }}>{band}</span>
    </div>
  );
}

export function Bar({ value, tone = "#22D3EE" }: { value: number; tone?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated" aria-hidden>
      <motion.div className="h-full rounded-full" style={{ background: tone }} initial={{ width: reduce ? `${value * 100}%` : 0 }} animate={{ width: `${value * 100}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }} />
    </div>
  );
}

export const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono tabular-nums">{children}</span>;
