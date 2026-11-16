import { Bell, Compass, Home, Plus, ScanFace, Search, Trophy, User } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { InstallPrompt, NotifyPrompt } from "./AppPrompts";
import { useRouteRobots } from "../lib/seo";
import { SessionProvider, useSession } from "../lib/session";
import { cx } from "./ui";
import { Avatar, Logo, QR } from "./visual";

const TABS = ["/", "/explorer", "/photos", "/profil", "/billets", "/club"];
/** Pages qui utilisent toute la largeur sur ordinateur ; les autres sont centrées comme un document. */
const WIDE = ["/", "/explorer", "/organisateur", "/prestataires", "/tobe", "/photos", "/club"];

function BottomNav() {
  const { me } = useSession();
  const item = (to: string, label: string, Icon: typeof Home, badge?: number) => (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => cx("relative flex flex-1 flex-col items-center gap-1 pt-2.5 text-[11px] font-semibold transition", isActive ? "text-brand" : "text-faint")}>
      <Icon className="size-[23px]" strokeWidth={2.1} />
      {label}
      {!!badge && <span className="absolute right-[26%] top-1.5 size-2 rounded-full bg-coral" />}
    </NavLink>
  );
  return (
    <nav className="absolute inset-x-0 bottom-0 z-40 border-t border-line bg-app/90 pb-safe backdrop-blur-xl lg:hidden">
      <div className="flex h-[64px] items-start">
        {item("/", "Accueil", Home)}
        {item("/explorer", "Explorer", Compass)}
        <NavLink to="/creer" aria-label="Créer un événement" className="relative -mt-5 flex flex-1 justify-center">
          <span className="grid size-[58px] place-items-center rounded-[20px] brand-gradient text-white shadow-[0_10px_30px_-6px_rgba(24,0,173,0.55)] ring-4 ring-[var(--bg)]">
            <Plus className="size-7" strokeWidth={2.6} />
          </span>
        </NavLink>
        {item("/photos", "Mes photos", ScanFace)}
        {item("/profil", "Profil", User, me?.unread)}
      </div>
    </nav>
  );
}

function DesktopNav() {
  const { me, requireAuth } = useSession();
  const nav = useNavigate();
  const link = (to: string, label: string) => (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => cx("rounded-full px-4 py-2 text-[15px] font-semibold transition", isActive ? "bg-brand-soft text-brand" : "text-muted hover:text-ink")}>
      {label}
    </NavLink>
  );
  return (
    <header className="sticky top-0 z-40 hidden h-16 border-b border-line bg-app/90 backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-full max-w-[1240px] items-center gap-6 px-8">
        <Link to="/" aria-label="Accueil ToBe">
          <Logo height={34} />
        </Link>
        <nav className="flex items-center gap-1">
          {link("/", "Accueil")}
          {link("/explorer", "Explorer")}
          {link("/photos", "Mes photos")}
          <NavLink to="/club" className={({ isActive }) => cx("flex items-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-semibold transition", isActive ? "bg-brand-soft text-brand" : "text-muted hover:text-ink")}>
            <Trophy className="size-4 text-[#f0a000]" /> Club
          </NavLink>
          {link("/prestataires", "Prestataires")}
          {me && link("/organisateur", "Organisateur")}
          {me?.team && link("/tobe", "Agence")}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => nav("/explorer")} aria-label="Rechercher" className="grid size-10 place-items-center rounded-full border border-line hover:border-ink/30">
            <Search className="size-[18px]" />
          </button>
          {me && (
            <Link to="/notifications" aria-label="Notifications" className="relative grid size-10 place-items-center rounded-full border border-line hover:border-ink/30">
              <Bell className="size-[18px]" />
              {!!me.unread && <span className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-[var(--bg)] bg-coral" />}
            </Link>
          )}
          <Link to="/creer" className="flex h-10 items-center gap-2 rounded-full brand-gradient px-5 text-sm font-bold text-white shadow-[0_8px_24px_-10px_rgba(24,0,173,0.7)] transition hover:brightness-110">
            <Plus className="size-4" strokeWidth={2.6} /> Créer un événement
          </Link>
          {me ? (
            <Link to="/profil" aria-label="Mon profil">
              <Avatar name={me.user.name || me.user.email} src={me.user.avatar} size={40} />
            </Link>
          ) : (
            <button onClick={() => requireAuth()} className="h-10 rounded-full border border-line px-5 text-sm font-semibold hover:border-ink/30">
              Se connecter
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const url = typeof location !== "undefined" ? location.origin : "https://tobe.eledji.com";
  return (
    <footer className="mt-20 hidden border-t border-line bg-app-2 lg:block">
      <div className="mx-auto grid max-w-[1240px] grid-cols-[1.2fr_1fr_1fr_1.3fr] gap-10 px-8 py-14">
        <div>
          <Logo height={40} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">Les événements de Lomé et d'Afrique de l'Ouest : découvrir, réserver, voter, et retrouver ses photos grâce à son visage.</p>
        </div>
        <div>
          <div className="text-sm font-bold">Découvrir</div>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link className="hover:text-ink" to="/explorer">Tous les événements</Link></li>
            <li><Link className="hover:text-ink" to="/explorer?when=weekend">Ce week-end</Link></li>
            <li><Link className="hover:text-ink" to="/photos">Pass ToBe</Link></li>
            <li><Link className="hover:text-ink" to="/club">ToBe Club : jouer et gagner</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-bold">Organiser</div>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link className="hover:text-ink" to="/creer">Créer un événement</Link></li>
            <li><Link className="hover:text-ink" to="/organisateur">Espace organisateur</Link></li>
            <li><Link className="hover:text-ink" to="/prestataires">Prestataires</Link></li>
            <li><a className="hover:text-ink" href="https://eledji.com">Un service ELEDJI</a></li>
          </ul>
        </div>
        <div className="flex items-center gap-4 rounded-3xl border border-line bg-app p-4">
          <QR value={url} size={96} className="shrink-0 rounded-xl" />
          <div className="text-sm text-muted">
            <div className="font-bold text-ink">ToBe sur votre téléphone</div>
            Scannez avec l'appareil photo, puis « Ajouter à l'écran d'accueil ».
          </div>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-faint">© {new Date().getFullYear()} ToBe Lomé · Sois-y. Retrouve-toi. · <a className="hover:text-ink" href="https://eledji.com">ELEDJI</a></div>
    </footer>
  );
}

function Frame() {
  const loc = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const { theme } = useSession();
  useRouteRobots(loc.pathname);
  const showTabs = TABS.includes(loc.pathname);
  const wide = WIDE.includes(loc.pathname) || /^\/(evenement|vote)\//.test(loc.pathname);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [loc.pathname]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return (
    <div className="relative h-full w-full">
      <div ref={scroller} id="scroller" className={cx("h-full overflow-y-auto overflow-x-hidden bg-app text-ink no-scrollbar lg:[scrollbar-width:auto]", showTabs && "pb-[92px] lg:pb-0")}>
        <DesktopNav />
        <div className={cx(loc.pathname !== "/" && "lg:mx-auto lg:px-8 lg:pt-6", loc.pathname !== "/" && (wide ? "lg:max-w-[1240px]" : "lg:max-w-[820px]"))}>
          <Outlet />
        </div>
        <Footer />
      </div>
      {showTabs && <BottomNav />}
      <InstallPrompt />
      <NotifyPrompt />
    </div>
  );
}

export function Layout() {
  return (
    <div className="h-dvh w-full bg-app">
      <div className="relative mx-auto h-dvh w-full overflow-hidden bg-app sm:max-w-[560px] sm:border-x sm:border-line lg:max-w-none lg:border-0">
        <SessionProvider>
          <Frame />
        </SessionProvider>
      </div>
    </div>
  );
}
