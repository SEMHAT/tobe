import { Crown, Gift, QrCode, ScanFace, Ticket } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, cx } from "../components/ui";
import { Logo, Poster } from "../components/visual";

const SLIDES = [
  { title: "Découvre les événements", text: "Concerts, soirées, forums, mariages : tout ce qui se vit à Lomé, au même endroit, classé selon son impact.", art: <ArtEvents /> },
  { title: "Retrouve-toi sur les photos", text: "Active ton Pass ToBe une seule fois : dès qu'une galerie est publiée, tes photos te trouvent toutes seules.", art: <ArtFace /> },
  { title: "Réserve, vote, vis-le", text: "Ton billet QR code reste sur ton téléphone, même sans connexion. Et tu soutiens tes candidats préférés.", art: <ArtTicket /> },
];

export function Onboarding() {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const done = () => {
    localStorage.setItem("tobe-onboarded", "1");
    nav(loc.state?.from && loc.state.from !== "/bienvenue" ? loc.state.from : "/", { replace: true });
  };
  const s = SLIDES[i];
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-app pt-safe">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand/15 blur-[90px]" />
      <div className="relative flex items-center justify-between px-6 pt-5">
        <Logo height={30} />
        <button onClick={done} className="text-sm font-semibold text-muted">
          Passer
        </button>
      </div>
      <div key={i} className="rise relative mt-6 flex h-[360px] items-center justify-center px-6">
        {s.art}
      </div>
      <div className="relative mt-auto px-6 pb-[max(env(safe-area-inset-bottom),28px)]">
        <h1 key={`t${i}`} className="rise text-[32px] font-black leading-[1.05]">
          {s.title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.text}</p>
        <div className="mt-6 flex gap-1.5">
          {SLIDES.map((_, k) => (
            <button key={k} aria-label={`Écran ${k + 1}`} onClick={() => setI(k)} className={cx("h-1.5 rounded-full transition-all", k === i ? "w-8 bg-brand" : "w-2.5 bg-ink/20")} />
          ))}
        </div>
        <Button full size="lg" className="mt-6" onClick={() => (i < SLIDES.length - 1 ? setI(i + 1) : done())}>
          {i < SLIDES.length - 1 ? "Suivant" : "Commencer"}
        </Button>
      </div>
    </div>
  );
}

function ArtEvents() {
  return (
    <div className="relative h-full w-full">
      <Poster cover={null} theme="violet" category="concours" className="absolute left-3 top-12 h-[230px] w-[160px] -rotate-[9deg] rounded-[24px] shadow-2xl" />
      <Poster cover={null} theme="nuit" category="corporate" className="absolute right-3 top-14 h-[230px] w-[160px] rotate-[8deg] rounded-[24px] shadow-2xl" />
      <Poster cover={null} theme="roi" category="concert" className="absolute left-1/2 top-0 h-[290px] w-[200px] -translate-x-1/2 rounded-[26px] shadow-[0_30px_60px_-20px_rgba(24,0,173,0.6)]">
        <div className="absolute inset-x-4 bottom-5">
          <div className="h-3 w-24 rounded-full bg-white/80" />
          <div className="mt-2 h-3 w-32 rounded-full bg-white/45" />
        </div>
      </Poster>
    </div>
  );
}

function ArtFace() {
  return (
    <div className="relative grid h-full w-full place-items-center">
      <div className="grid grid-cols-3 gap-2 opacity-80">
        {(["roi", "corail", "violet", "vert", "nuit", "roi", "corail", "violet", "vert"] as const).map((t, k) => (
          <Poster key={k} cover={null} theme={t} category="soiree" className={cx("size-[88px] rounded-2xl", k === 4 && "ring-4 ring-brand")} />
        ))}
      </div>
      <div className="absolute grid size-[150px] place-items-center rounded-[36px] border-2 border-white/80 bg-[#0b0b12]/55 backdrop-blur-sm">
        <ScanFace className="size-20 text-white" strokeWidth={1.4} />
        <div className="scanline absolute inset-x-3 h-0.5 rounded bg-white shadow-[0_0_14px_#fff]" />
      </div>
    </div>
  );
}

function ArtTicket() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-4 right-10 top-4 overflow-hidden rounded-[26px] border border-line bg-card shadow-2xl">
        <Poster cover={null} theme="roi" category="concert" className="h-20" />
        <div className="flex items-center gap-4 p-4">
          <div className="grid size-20 place-items-center rounded-xl border-2 border-[#0b0b12]">
            <QrCode className="size-14" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Ticket className="size-4 text-brand" /> Billet
            </div>
            <div className="h-2.5 w-28 rounded-full bg-ink/15" />
            <div className="h-2.5 w-20 rounded-full bg-ink/10" />
          </div>
        </div>
      </div>
      <div className="absolute bottom-6 left-10 right-2 rounded-[26px] border border-line bg-card p-4 shadow-2xl">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Crown className="size-4 text-brand" /> Vote du public
        </div>
        <div className="mt-3 space-y-2.5">
          {[78, 56, 34].map((w, k) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-3 text-sm font-bold text-muted">{k + 1}</span>
              <div className="h-2.5 rounded-full brand-gradient" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald">
          <Gift className="size-3.5" /> 1 vote gratuit par jour
        </div>
      </div>
    </div>
  );
}
