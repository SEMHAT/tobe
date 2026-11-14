import { ChevronLeft, Loader2, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "gold" | "dark" | "ghost" | "outline" | "danger" | "coral" | "white";
const VARIANTS: Record<Variant, string> = {
  gold: "gold-gradient text-[#1b1206] shadow-[0_8px_30px_-8px_rgba(242,178,51,0.55)] active:brightness-95",
  coral: "bg-coral text-white shadow-[0_8px_30px_-10px_rgba(255,90,78,0.6)]",
  dark: "bg-card-2 text-ink border border-line",
  ghost: "text-muted hover:text-ink",
  outline: "border border-line text-ink bg-transparent",
  danger: "bg-coral/10 text-coral border border-coral/30",
  white: "bg-white text-[#16141c]",
};

export function Button({
  variant = "gold",
  size = "md",
  full,
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; full?: boolean; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98] disabled:opacity-50",
        size === "sm" && "h-9 px-4 text-sm",
        size === "md" && "h-12 px-5 text-[15px]",
        size === "lg" && "h-14 px-6 text-base",
        full && "w-full",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ children, className, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} {...rest} className={cx("grid size-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-md transition active:scale-95", className)}>
      {children}
    </button>
  );
}

export function TopBar({ title, back = true, right, transparent, onBack }: { title?: ReactNode; back?: boolean; right?: ReactNode; transparent?: boolean; onBack?: () => void }) {
  const nav = useNavigate();
  return (
    <header className={cx("sticky top-0 z-30 pt-safe", transparent ? "pointer-events-none" : "bg-app/85 backdrop-blur-xl border-b border-line")}>
      <div className="flex h-14 items-center gap-2 px-3">
        {back ? (
          <IconButton label="Retour" onClick={() => (onBack ? onBack() : history.length > 1 ? nav(-1) : nav("/"))} className={cx("pointer-events-auto", !transparent && "bg-transparent text-ink")}>
            <ChevronLeft className="size-6" />
          </IconButton>
        ) : (
          <div className="w-2" />
        )}
        <div className="min-w-0 flex-1 truncate font-display text-[17px] font-bold">{title}</div>
        <div className="pointer-events-auto flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx("rounded-[var(--radius-card)] border border-line bg-card", onClick && "cursor-pointer active:scale-[0.99] transition", className)}>
      {children}
    </div>
  );
}

export function Chip({ active, children, onClick, icon }: { active?: boolean; children: ReactNode; onClick?: () => void; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition",
        active ? "border-gold bg-gold text-[#1b1206]" : "border-line bg-card text-ink",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mt-7", className)}>
      <div className="mb-3 flex items-end justify-between px-5">
        <h2 className="text-[19px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; tall?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="fade-in absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx("sheet-in relative flex max-h-[92%] flex-col rounded-t-[28px] border-t border-line bg-app-2 pb-safe", tall && "min-h-[70%]")}>
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-white/15" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <div className="font-display text-lg font-bold">{title}</div>
          <button aria-label="Fermer" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-card text-muted">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-2xl border border-line bg-card px-4 py-3 text-ink outline-none placeholder:text-faint focus:border-gold/70 focus:ring-2 focus:ring-gold/20 transition";

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-gold" : "bg-white/15")}
    >
      <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-full border border-line bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx("h-9 flex-1 rounded-full text-sm font-semibold transition", value === o.value ? "bg-gold text-[#1b1206]" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-3xl bg-card text-gold">{icon}</div>
      <div className="font-display text-lg font-bold">{title}</div>
      {text && <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-6 animate-spin text-gold", className)} />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-muted">{message}</p>
      {onRetry && (
        <Button variant="dark" size="sm" className="mt-4" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-2.5 overflow-hidden rounded-full bg-white/10", className)}>
      <div className="h-full rounded-full gold-gradient transition-all duration-700" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 font-display text-xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  );
}
