import { Bell, BriefcaseBusiness, ChevronRight, Crown, Download, LogOut, Moon, Pencil, RotateCcw, ScanFace, Sparkles, Store, Ticket } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Empty, ErrorState, Field, PageLoader, Sheet, Toggle, TopBar, inputCls } from "../components/ui";
import { Avatar, Logo } from "../components/visual";
import { api, isDemo } from "../lib/api";
import { ago, formatPhone, longDate } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

type InstallEvt = Event & { prompt: () => Promise<void> };

export function Profile() {
  const { me, ready, requireAuth, logout, theme, setTheme, refresh, toast } = useSession();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [install, setInstall] = useState<InstallEvt | null>(null);
  useEffect(() => {
    const h = (e: Event) => (e.preventDefault(), setInstall(e as InstallEvt));
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!ready) return <PageLoader />;

  return (
    <div className="pt-safe">
      <header className="px-5 pt-4">
        <h1 className="text-[26px] font-extrabold">Profil</h1>
      </header>
      {me ? (
        <div className="mx-5 mt-4 rounded-[24px] border border-line bg-card p-5">
          <div className="flex items-center gap-4">
            <Avatar name={me.user.name || "?"} size={64} ring={me.premium} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 truncate font-display text-xl font-bold">
                {me.user.name || "Sans nom"} {me.premium && <Crown className="size-5 text-gold" />}
              </div>
              <div className="text-sm text-muted">{formatPhone(me.user.phone)}</div>
            </div>
            <button aria-label="Modifier le nom" onClick={() => (setName(me.user.name), setEdit(true))} className="grid size-10 place-items-center rounded-full bg-card-2">
              <Pencil className="size-4" />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2 text-center">
            {[
              [me.stats.events, "Événements"],
              [me.stats.tickets, "Billets"],
              [me.stats.photos, "Photos"],
              [me.stats.votes, "Votes"],
            ].map(([v, l]) => (
              <div key={l as string} className="rounded-2xl bg-card-2 py-3">
                <div className="font-display text-lg font-bold">{v}</div>
                <div className="text-[11px] text-muted">{l}</div>
              </div>
            ))}
          </div>
          {me.premium && me.user.premiumUntil && <div className="mt-3 text-center text-xs text-gold">Pass Premium jusqu'au {longDate(me.user.premiumUntil)}</div>}
        </div>
      ) : (
        <div className="mx-5 mt-4 rounded-[24px] border border-line bg-card p-6 text-center">
          <Logo className="text-2xl" />
          <p className="mt-3 text-sm text-muted">Connectez-vous avec votre numéro pour garder vos billets, voter et retrouver vos photos.</p>
          <Button full className="mt-5" onClick={() => requireAuth()}>
            Se connecter
          </Button>
        </div>
      )}

      <div className="mx-5 mt-5 overflow-hidden rounded-[22px] border border-line bg-card">
        <Item to="/billets" icon={<Ticket />} label="Mes billets" />
        <Item to="/photos" icon={<ScanFace />} label="Mes photos et Pass ToBe" />
        {me && <Item to="/notifications" icon={<Bell />} label="Notifications" badge={me.unread} />}
        <Item to="/organisateur" icon={<BriefcaseBusiness />} label="Espace organisateur" sub={me?.stats.organized ? `${me.stats.organized} événement(s)` : undefined} />
        <Item to="/prestataires" icon={<Store />} label="Prestataires certifiés" />
        {me?.user.role === "admin" && <Item to="/tobe" icon={<Sparkles />} label="Espace agence ToBe" sub="Demandes d'organisation, revenus" />}
      </div>

      <div className="mx-5 mt-4 overflow-hidden rounded-[22px] border border-line bg-card">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="text-gold [&>svg]:size-5">
            <Moon />
          </span>
          <span className="flex-1 font-medium">Mode sombre</span>
          <Toggle checked={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} label="Mode sombre" />
        </div>
        {install && (
          <button onClick={() => install.prompt().then(() => setInstall(null))} className="flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left">
            <span className="text-gold [&>svg]:size-5">
              <Download />
            </span>
            <span className="flex-1 font-medium">Installer l'application</span>
            <ChevronRight className="size-5 text-faint" />
          </button>
        )}
        {isDemo && (
          <button
            onClick={async () => {
              if (!confirm("Effacer toutes les données de démonstration sur ce téléphone ?")) return;
              const { resetDemo } = await import("../lib/demo");
              localStorage.removeItem("tobe-token");
              resetDemo();
            }}
            className="flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left"
          >
            <span className="text-gold [&>svg]:size-5">
              <RotateCcw />
            </span>
            <span className="flex-1 font-medium">Réinitialiser la démo</span>
          </button>
        )}
        {me && (
          <button onClick={() => logout().then(() => toast("À bientôt !"))} className="flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left text-coral">
            <LogOut className="size-5" />
            <span className="flex-1 font-medium">Se déconnecter</span>
          </button>
        )}
      </div>
      <p className="mb-6 mt-6 text-center text-xs text-faint">
        ToBe · Sois-y. Retrouve-toi. {isDemo && "· Version de démonstration"}
      </p>

      <Sheet open={edit} onClose={() => setEdit(false)} title="Mon nom">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await api("PATCH", "/me", { name });
            await refresh();
            setEdit(false);
            toast("Nom mis à jour");
          }}
        >
          <Field label="Prénom et nom">
            <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button full type="submit" disabled={name.trim().length < 2}>
            Enregistrer
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

function Item({ to, icon, label, sub, badge }: { to: string; icon: ReactNode; label: string; sub?: string; badge?: number }) {
  return (
    <Link to={to} className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
      <span className="text-gold [&>svg]:size-5">{icon}</span>
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
      {!!badge && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-coral px-1.5 text-xs font-bold text-white">{badge}</span>}
      <ChevronRight className="size-5 text-faint" />
    </Link>
  );
}

interface Notif {
  id: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export function Notifications() {
  const { me, refresh } = useSession();
  const nav = useNavigate();
  const { data, error, loading } = useLoad(() => api<Notif[]>("GET", "/me/notifications"), [me?.user.id]);
  useEffect(() => {
    if (data?.some((n) => !n.read)) api("POST", "/me/notifications/read").then(refresh);
  }, [data, refresh]);
  return (
    <div>
      <TopBar title="Notifications" />
      {loading && <PageLoader />}
      {error && <ErrorState message={error.message} />}
      {data && data.length === 0 && <Empty icon={<Bell className="size-7" />} title="Rien de neuf" text="Vous serez prévenu ici de vos nouvelles photos, de vos billets et des votes." />}
      <div className="space-y-2 px-5 py-4">
        {data?.map((n) => (
          <button key={n.id} onClick={() => nav(n.link)} className="flex w-full gap-3 rounded-2xl border border-line bg-card p-4 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
              <ScanFace className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-semibold">
                {n.title} {!n.read && <span className="size-2 rounded-full bg-coral" />}
              </span>
              <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
              <span className="mt-1 block text-xs text-faint">{ago(n.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
