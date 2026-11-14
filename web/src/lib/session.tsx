import { CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Field, Sheet, inputCls } from "../components/ui";
import { api, getToken, isDemo, setToken } from "./api";

export interface Me {
  user: {
    id: string;
    email: string;
    phone: string | null;
    name: string;
    role: "user" | "admin";
    passEnabled: boolean;
    neverShow: boolean;
    hasFace: boolean;
    premiumUntil: string | null;
    pro: boolean;
  };
  stats: { events: number; tickets: number; votes: number; photos: number; organized: number };
  unread: number;
  premium: boolean;
}

interface Ctx {
  me: Me | null;
  ready: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  requireAuth: (reason?: string) => Promise<boolean>;
  toast: (msg: string, kind?: "ok" | "error") => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  /** Paiement en ligne actif (sinon : réservation, paiement à l'entrée). */
  payments: boolean;
}

const SessionCtx = createContext<Ctx>(null!);
export const useSession = () => useContext(SessionCtx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<{ reason?: string } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "error" }[]>([]);
  const [theme, setThemeState] = useState<"dark" | "light">(() => (localStorage.getItem("tobe-theme") as "dark" | "light") || "light");
  const [payments, setPayments] = useState(false);
  useEffect(() => {
    api<{ paymentsEnabled: boolean }>("GET", "/config")
      .then((c) => setPayments(c.paymentsEnabled))
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setReady(true);
      return;
    }
    try {
      setMe(await api<Me>("GET", "/me"));
    } catch {
      setMe(null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toast = useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const requireAuth = useCallback(
    (reason?: string) => {
      if (getToken() && me) return Promise.resolve(true);
      setAuth({ reason });
      return new Promise<boolean>((res) => (resolver.current = res));
    },
    [me],
  );

  const finishAuth = (ok: boolean) => {
    setAuth(null);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const logout = useCallback(async () => {
    try {
      await api("POST", "/auth/logout");
    } catch {
      /* rien */
    }
    setToken(null);
    setMe(null);
  }, []);

  const setTheme = (t: "dark" | "light") => {
    localStorage.setItem("tobe-theme", t);
    setThemeState(t);
  };

  return (
    <SessionCtx.Provider value={{ me, ready, refresh, logout, requireAuth, toast, theme, setTheme, payments }}>
      {children}
      <AuthSheet
        open={!!auth}
        reason={auth?.reason}
        onClose={() => finishAuth(false)}
        onDone={async () => {
          await refresh();
          finishAuth(true);
        }}
      />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] lg:top-20 flex flex-col items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),12px)]">
        {toasts.map((t) => (
          <div key={t.id} className="rise flex max-w-full items-center gap-2 rounded-2xl border border-line bg-[#1f1f28]/95 px-4 py-3 text-sm font-medium text-white shadow-2xl backdrop-blur">
            {t.kind === "ok" ? <CheckCircle2 className="size-5 shrink-0 text-emerald" /> : <AlertCircle className="size-5 shrink-0 text-coral" />}
            {t.msg}
          </div>
        ))}
      </div>
    </SessionCtx.Provider>
  );
}

function AuthSheet({ open, reason, onClose, onDone }: { open: boolean; reason?: string; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"email" | "code" | "name">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setStep("email");
      setCode("");
      setErr("");
    }
  }, [open]);

  const sendCode = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ devCode?: string; email: string }>("POST", "/auth/otp", { email: email.trim() });
      setDevCode(r.devCode);
      setStep("code");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  const verify = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ token: string; user: { name: string } }>("POST", "/auth/verify", { email: email.trim(), code });
      setToken(r.token);
      if (!r.user.name) setStep("name");
      else onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  const saveName = async () => {
    setBusy(true);
    try {
      await api("PATCH", "/me", { name });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title={step === "name" ? "Bienvenue sur ToBe" : "Connexion"}>
      {step === "email" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-muted">{reason ?? "Pas de mot de passe : on vous envoie un code par e-mail."}</p>
          <Field label="Adresse e-mail">
            <input autoFocus type="email" inputMode="email" autoComplete="email" placeholder="vous@exemple.com" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {err && <p className="text-sm text-coral">{err}</p>}
          <Button full type="submit" loading={busy} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())} icon={<Mail className="size-4" />}>
            Recevoir mon code
          </Button>
          <p className="text-center text-xs text-faint">En continuant, vous acceptez les conditions d'utilisation de ToBe.</p>
        </form>
      )}
      {step === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-muted">
            Entrez le code à 6 chiffres envoyé à <b className="text-ink">{email.trim()}</b>. Pensez à regarder dans les courriers indésirables.
          </p>
          {devCode && (
            <div className="rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand">
              {isDemo ? "Version de démonstration" : "Mode développement"} : votre code est <b className="tracking-widest">{devCode}</b>
            </div>
          )}
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            className={`${inputCls} text-center font-display text-2xl tracking-[0.5em]`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          {err && <p className="text-sm text-coral">{err}</p>}
          <Button full type="submit" loading={busy} disabled={code.length !== 6}>
            Valider
          </Button>
          <button type="button" className="w-full text-sm text-muted" onClick={() => setStep("email")}>
            Changer d'adresse
          </button>
        </form>
      )}
      {step === "name" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-muted">Comment doit-on vous appeler ? Ce nom apparaît sur vos billets.</p>
          <Field label="Prénom et nom">
            <input autoFocus className={inputCls} placeholder="Ex. Ama Kossi" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {err && <p className="text-sm text-coral">{err}</p>}
          <Button full type="submit" loading={busy} disabled={name.trim().length < 2}>
            C'est parti
          </Button>
        </form>
      )}
    </Sheet>
  );
}
