import { BellRing, Check, Chrome, MoreVertical, PlusSquare, Share, Smartphone, Ticket, WifiOff, X, Zap } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { canPromptInstall, enablePush, isAndroid, isIOS, isStandalone, promptInstall, pushState, wasInstalled } from "../lib/push";
import { useSession } from "../lib/session";
import { estHorsLigne } from "../lib/api";
import { Button, Sheet, cx } from "./ui";

// =====================================================================
// Fenêtre « Installez ToBe » et demande d'activation des notifications.
// =====================================================================

const DISMISS_KEY = "tobe-install-dismissed";
const VISITS_KEY = "tobe-visits";
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* navigation privée */
    }
  },
};

/** Ouvre la fenêtre d'installation depuis n'importe où (bouton du profil, après un billet…). */
export function openInstall() {
  window.dispatchEvent(new Event("tobe-open-install"));
}

function Benefit({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand dark:bg-brand/20 dark:text-white">{icon}</div>
      <div>
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="text-sm text-muted">{text}</div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card-2 p-3 text-[15px]">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{n}</span>
      <span className="flex flex-wrap items-center gap-1.5">{children}</span>
    </li>
  );
}

export function InstallPrompt() {
  const { pathname } = useLocation();
  const { toast } = useSession();
  const [open, setOpen] = useState(false);
  const [installable, setInstallable] = useState(canPromptInstall());
  const [done, setDone] = useState(false);

  const show = useCallback(
    (force = false) => {
      if (isStandalone()) return;
      if (!force) {
        const last = Number(store.get(DISMISS_KEY) ?? 0);
        if (Date.now() - last < 3 * 86_400_000) return; // pas plus d'une fois tous les 3 jours
        if (wasInstalled()) return;
      }
      setOpen(true);
    },
    [],
  );

  useEffect(() => {
    const visits = Number(store.get(VISITS_KEY) ?? 0) + 1;
    store.set(VISITS_KEY, String(visits));
    // Première visite : on laisse découvrir 25 secondes. Visites suivantes : 6 secondes.
    const t = window.setTimeout(() => show(), visits > 1 ? 6000 : 25000);
    const onInstallable = () => setInstallable(true);
    const onInstalled = () => {
      setDone(true);
      setOpen(false);
      toast("ToBe est installé : retrouvez-le sur votre écran d'accueil");
    };
    const onOpen = () => show(true);
    window.addEventListener("tobe-installable", onInstallable);
    window.addEventListener("tobe-installed", onInstalled);
    window.addEventListener("tobe-open-install", onOpen);
    return () => {
      clearTimeout(t);
      window.removeEventListener("tobe-installable", onInstallable);
      window.removeEventListener("tobe-installed", onInstalled);
      window.removeEventListener("tobe-open-install", onOpen);
    };
  }, [show, toast]);

  // Pas d'interruption pendant un paiement, un scan ou l'activation du Pass.
  const quiet = /^\/(scanner|invitation|bienvenue)/.test(pathname) || /\/billets$/.test(pathname);
  if (done || isStandalone()) return null;

  const close = () => {
    store.set(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };
  const install = async () => {
    const ok = await promptInstall();
    setInstallable(canPromptInstall());
    if (ok) {
      store.set("tobe-installed", "1");
      setOpen(false);
    }
  };

  const ios = isIOS();
  const iosOtherBrowser = ios && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(navigator.userAgent);

  const body = (
    <div>
      <div className="relative -mx-5 -mt-2 mb-5 overflow-hidden px-5 pb-5 pt-1 lg:mx-0 lg:mt-0 lg:rounded-3xl lg:brand-gradient lg:p-5 lg:text-white">
        <div className="flex items-center gap-4">
          <img src="/icon-192.png" alt="" className="size-16 rounded-[20px] border border-line bg-white shadow-lg" />
          <div>
            <div className="font-display text-xl font-extrabold leading-tight">Installez l'application ToBe</div>
            <div className="text-sm text-muted lg:text-white/75">Gratuite, légère, sans passer par un store.</div>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <Benefit icon={<BellRing className="size-5" />} title="Vos rappels comme vos messages" text="Notifications 2 jours avant, la veille, le jour J et 30 minutes avant vos événements." />
        <Benefit icon={<Zap className="size-5" />} title="ToBe en une touche" text="Une icône sur votre écran d'accueil, sans ouvrir le navigateur." />
        <Benefit icon={<WifiOff className="size-5" />} title="Vos billets même sans connexion" text="Le QR code reste disponible à l'entrée, même sans réseau." />
      </div>
      <div className="mt-6">
        {installable ? (
          <Button full size="lg" icon={<Smartphone className="size-5" />} onClick={install}>
            Installer ToBe
          </Button>
        ) : ios && !iosOtherBrowser ? (
          <ol className="space-y-2">
            <Step n={1}>
              Touchez <Share className="inline size-5 text-brand" /> <b>Partager</b> en bas de Safari
            </Step>
            <Step n={2}>
              Choisissez <PlusSquare className="inline size-5 text-brand" /> <b>Sur l'écran d'accueil</b>
            </Step>
            <Step n={3}>
              Touchez <b>Ajouter</b> : c'est fait !
            </Step>
          </ol>
        ) : iosOtherBrowser || inApp ? (
          <ol className="space-y-2">
            <Step n={1}>
              Ouvrez <b>tobe.eledji.com</b> dans {ios ? "Safari" : "Chrome"}
              {inApp && !ios && (
                <>
                  {" "}
                  (menu <MoreVertical className="inline size-4" /> puis « Ouvrir dans Chrome »)
                </>
              )}
            </Step>
            <Step n={2}>{ios ? "Partager, puis « Sur l'écran d'accueil »" : "Puis touchez « Installer l'application »"}</Step>
          </ol>
        ) : (
          <ol className="space-y-2">
            <Step n={1}>
              Ouvrez le menu <MoreVertical className="inline size-4" /> {isAndroid() ? "de Chrome" : "du navigateur"}
            </Step>
            <Step n={2}>
              Touchez <b>Installer l'application</b> ou <b>Ajouter à l'écran d'accueil</b>
            </Step>
            {!isAndroid() && (
              <li className="flex items-center gap-2 px-1 text-xs text-faint">
                <Chrome className="size-4" /> Sur ordinateur, l'icône d'installation est aussi dans la barre d'adresse.
              </li>
            )}
          </ol>
        )}
        <button onClick={close} className="mt-3 h-11 w-full rounded-full text-sm font-semibold text-muted">
          Plus tard
        </button>
      </div>
    </div>
  );

  // Ordinateur : une carte discrète en bas à droite plutôt qu'une fenêtre bloquante.
  return (
    <>
      <div className="lg:hidden">
        <Sheet open={open && !quiet} onClose={close}>
          {body}
        </Sheet>
      </div>
      {open && !quiet && (
        <div className="fixed bottom-6 right-6 z-[60] hidden w-[400px] rounded-[28px] border border-line bg-card p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] lg:block">
          <button aria-label="Fermer" onClick={close} className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-full bg-black/10 text-white">
            <X className="size-4" />
          </button>
          {body}
        </div>
      )}
    </>
  );
}

// ---------- Demande d'activation des notifications ----------
type Ask = { reason?: string; resolve: (ok: boolean) => void };

/** Explique pourquoi activer les notifications, puis déclenche la demande du navigateur. */
export function askNotifications(reason?: string): Promise<boolean> {
  if (pushState() === "granted") return enablePush().then((r) => r.ok);
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent<Ask>("tobe-ask-notify", { detail: { reason, resolve } })));
}

export function NotifyPrompt() {
  const { toast } = useSession();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = (e: Event) => setAsk((e as CustomEvent<Ask>).detail);
    window.addEventListener("tobe-ask-notify", h);
    return () => window.removeEventListener("tobe-ask-notify", h);
  }, []);
  const state = ask ? pushState() : "default";
  const finish = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };
  const enable = async () => {
    setBusy(true);
    const r = await enablePush().catch((e) => ({ ok: false, reason: (e as Error).message }));
    setBusy(false);
    if (!r.ok && r.reason) toast(r.reason, "error");
    finish(r.ok);
  };
  return (
    <Sheet open={!!ask} onClose={() => finish(false)}>
      <div className="text-center">
        <div className="relative mx-auto mb-4 grid size-20 place-items-center rounded-[26px] brand-gradient text-white">
          <BellRing className="size-9" />
          <span className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full bg-coral text-xs font-bold text-white">1</span>
        </div>
        <div className="font-display text-xl font-extrabold">Ne ratez plus rien</div>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{ask?.reason ?? "Recevez vos rappels et les nouvelles de vos événements directement sur votre téléphone, comme vos messages WhatsApp."}</p>
      </div>
      {/* Aperçu d'une notification */}
      <div className="mx-auto mt-5 max-w-sm rounded-2xl border border-line bg-card-2 p-3 text-left shadow-sm">
        <div className="flex items-center gap-2 text-[11px] text-faint">
          <img src="/icon-192.png" alt="" className="size-4 rounded" /> ToBe · maintenant
        </div>
        <div className="mt-1 text-sm font-semibold">C'est demain : votre soirée</div>
        <div className="text-[13px] text-muted">Rendez-vous à 20h00. Votre billet est dans l'application.</div>
      </div>
      <div className="mt-6 space-y-2">
        {state === "ios-install" ? (
          <>
            <p className="rounded-2xl bg-card-2 p-3 text-sm text-muted">Sur iPhone, les notifications marchent une fois ToBe ajouté à l'écran d'accueil : Partager, puis « Sur l'écran d'accueil ».</p>
            <Button full onClick={() => (finish(false), openInstall())}>
              Ajouter ToBe à l'écran d'accueil
            </Button>
          </>
        ) : state === "denied" ? (
          <p className="rounded-2xl bg-card-2 p-3 text-sm text-muted">Les notifications sont bloquées pour ToBe. Touchez le cadenas à côté de l'adresse, puis autorisez les notifications.</p>
        ) : state === "unsupported" ? (
          <p className="rounded-2xl bg-card-2 p-3 text-sm text-muted">Ce navigateur ne reçoit pas les notifications. Ouvrez ToBe dans Chrome ou installez l'application.</p>
        ) : (
          <Button full size="lg" loading={busy} icon={<Check className="size-5" />} onClick={enable}>
            Activer les notifications
          </Button>
        )}
        <button onClick={() => finish(false)} className={cx("h-11 w-full rounded-full text-sm font-semibold text-muted")}>
          Pas maintenant
        </button>
      </div>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-faint">
        <Ticket className="size-3.5" /> Uniquement vos événements. Désactivable à tout moment dans le profil.
      </p>
    </Sheet>
  );
}

/** Bandeau discret : sans réseau, l'application montre les dernières infos gardées sur le téléphone. */
export function OfflineBanner() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const maj = () => setOff(!navigator.onLine || estHorsLigne());
    const api = (e: Event) => setOff((e as CustomEvent<boolean>).detail || !navigator.onLine);
    maj();
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    window.addEventListener("tobe-hors-ligne", api);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
      window.removeEventListener("tobe-hors-ligne", api);
    };
  }, []);
  if (!off) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-[80] flex justify-center px-3">
      <p className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-[12.5px] font-semibold text-white shadow-lg">
        <WifiOff className="size-3.5" /> Hors connexion · dernières infos gardées sur ce téléphone
      </p>
    </div>
  );
}
