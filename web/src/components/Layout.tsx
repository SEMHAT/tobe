import { Compass, Home, Plus, ScanFace, User } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { SessionProvider, useSession } from "../lib/session";
import { cx } from "./ui";
import { Logo, QR } from "./visual";

const TABS = ["/", "/explorer", "/photos", "/profil", "/billets"];

function BottomNav() {
  const { me } = useSession();
  const item = (to: string, label: string, Icon: typeof Home, badge?: number) => (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => cx("relative flex flex-1 flex-col items-center gap-1 pt-2.5 text-[11px] font-semibold transition", isActive ? "text-gold" : "text-faint")}>
      <Icon className="size-[23px]" strokeWidth={2.1} />
      {label}
      {!!badge && <span className="absolute right-[26%] top-1.5 size-2 rounded-full bg-coral" />}
    </NavLink>
  );
  return (
    <nav className="absolute inset-x-0 bottom-0 z-40 border-t border-line bg-app/90 pb-safe backdrop-blur-xl">
      <div className="flex h-[64px] items-start">
        {item("/", "Accueil", Home)}
        {item("/explorer", "Explorer", Compass)}
        <NavLink to="/creer" aria-label="Créer un événement" className="relative -mt-5 flex flex-1 justify-center">
          <span className="grid size-[58px] place-items-center rounded-[20px] gold-gradient text-[#1b1206] shadow-[0_10px_30px_-6px_rgba(242,178,51,0.6)] ring-4 ring-[var(--bg)]">
            <Plus className="size-7" strokeWidth={2.6} />
          </span>
        </NavLink>
        {item("/photos", "Mes photos", ScanFace)}
        {item("/profil", "Profil", User, me?.unread)}
      </div>
    </nav>
  );
}

function Frame() {
  const loc = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  const { theme } = useSession();
  const showTabs = TABS.includes(loc.pathname);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [loc.pathname]);
  return (
    <div className={cx("relative h-full w-full", theme === "light" && "light")}>
      <div ref={scroller} id="scroller" className={cx("h-full overflow-y-auto overflow-x-hidden bg-app text-ink no-scrollbar", showTabs && "pb-[92px]")}>
        <Outlet />
      </div>
      {showTabs && <BottomNav />}
    </div>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#060608] lg:gap-16 lg:bg-[radial-gradient(circle_at_20%_20%,rgba(242,178,51,0.12),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(255,90,78,0.1),transparent_40%),#060608]">
      <aside className="hidden max-w-sm text-white lg:block">
        <Logo className="text-4xl" />
        <h1 className="mt-6 text-5xl font-extrabold leading-[1.05]">
          Sois-y.
          <br />
          <span className="text-gold">Retrouve-toi.</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-white/60">
          Les événements de Lomé dans une seule app : billets en Mobile Money, votes, cagnottes, et vos photos retrouvées grâce à votre visage.
        </p>
        <div className="mt-8 flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          <QR value={typeof location !== "undefined" ? location.origin : "https://tobe.eledji.com"} size={92} className="rounded-xl" />
          <div className="text-sm text-white/70">
            <div className="font-semibold text-white">Ouvrez ToBe sur votre téléphone</div>
            Scannez ce code avec l'appareil photo, puis « Ajouter à l'écran d'accueil ».
          </div>
        </div>
      </aside>
      <div className="relative h-dvh w-full overflow-hidden bg-app sm:max-w-[440px] sm:shadow-2xl md:h-[min(920px,calc(100dvh-40px))] md:rounded-[46px] md:border-[10px] md:border-[#1c1c22] md:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <SessionProvider>
          <Frame />
        </SessionProvider>
      </div>
    </div>
  );
}
