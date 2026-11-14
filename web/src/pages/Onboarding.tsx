import { Crown, HandCoins, ScanFace, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, cx } from "../components/ui";
import { Avatar, Logo, Poster, TierBadge } from "../components/visual";

const SLIDES = [
  { title: "Découvre les événements", text: "Concerts, soirées, forums, mariages : tout ce qui se vit à Lomé, au même endroit, classé par impact.", art: <ArtEvents /> },
  { title: "Retrouve-toi sur les photos", text: "Active ton Pass ToBe une seule fois : dès qu'une galerie est publiée, tes photos te trouvent toutes seules.", art: <ArtFace /> },
  { title: "Vote, contribue, vis-le", text: "Soutiens tes candidats, participe aux cagnottes même depuis l'étranger, garde tes billets hors connexion.", art: <ArtVote /> },
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
      <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-gold/25 blur-[90px]" />
      <div className="pointer-events-none absolute -right-24 top-40 size-72 rounded-full bg-coral/20 blur-[90px]" />
      <div className="relative flex items-center justify-between px-6 pt-5">
        <Logo className="text-xl" />
        <button onClick={done} className="text-sm font-semibold text-muted">
          Passer
        </button>
      </div>
      <div key={i} className="rise relative mt-6 flex h-[400px] items-center justify-center px-6">
        {s.art}
      </div>
      <div className="relative mt-auto px-6 pb-[max(env(safe-area-inset-bottom),28px)]">
        <h1 key={`t${i}`} className="rise text-[32px] font-extrabold leading-[1.05]">
          {s.title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.text}</p>
        <div className="mt-6 flex gap-1.5">
          {SLIDES.map((_, k) => (
            <button key={k} aria-label={`Écran ${k + 1}`} onClick={() => setI(k)} className={cx("h-1.5 rounded-full transition-all", k === i ? "w-8 bg-gold" : "w-2.5 bg-white/20")} />
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
      <Poster cover={null} theme="violet" category="concours" title="Miss Université" showTitle className="absolute left-2 top-10 h-[250px] w-[170px] -rotate-[9deg] rounded-[24px] shadow-2xl" />
      <Poster cover={null} theme="nuit" category="corporate" title="Forum Business" showTitle className="absolute right-2 top-12 h-[250px] w-[170px] rotate-[8deg] rounded-[24px] shadow-2xl" />
      <Poster cover={null} theme="or" category="concert" title="Lomé Afro Night" showTitle className="absolute left-1/2 top-0 h-[300px] w-[205px] -translate-x-1/2 rounded-[26px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]">
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <TierBadge tier="phare" className="absolute left-3 top-3" />
        <div className="absolute bottom-4 left-4 text-sm font-semibold text-white">Samedi · 21:00</div>
      </Poster>
    </div>
  );
}

function ArtFace() {
  return (
    <div className="relative grid h-full w-full place-items-center">
      <div className="grid grid-cols-3 gap-2 opacity-70">
        {(["or", "corail", "violet", "vert", "nuit", "or", "corail", "violet", "vert"] as const).map((t, k) => (
          <Poster key={k} cover={null} theme={t} category="soiree" className={cx("size-[92px] rounded-2xl", k === 4 && "ring-4 ring-gold")} />
        ))}
      </div>
      <div className="absolute grid size-[150px] place-items-center rounded-[36px] border-2 border-gold/80 bg-black/40 backdrop-blur-sm">
        <ScanFace className="size-20 text-gold" strokeWidth={1.4} />
        <div className="scanline absolute inset-x-3 h-0.5 rounded bg-gold shadow-[0_0_14px_#f2b233]" />
      </div>
      <div className="absolute bottom-4 rounded-2xl border border-line bg-card/95 px-4 py-3 text-sm shadow-xl">
        <span className="font-semibold text-gold">14 photos</span> de toi au Lomé Afro Night
      </div>
    </div>
  );
}

function ArtVote() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-0 right-8 top-6 rounded-3xl border border-line bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Crown className="size-4 text-gold" /> Classement en direct
        </div>
        {["Afi Mensah", "Ablavi Kodjo", "Akossiwa Agbeko"].map((n, k) => (
          <div key={n} className="flex items-center gap-3 py-1.5">
            <span className="w-4 text-sm font-bold text-muted">{k + 1}</span>
            <Avatar name={n} size={34} />
            <span className="flex-1 text-sm font-semibold">{n}</span>
            <span className="text-sm text-gold">{[4210, 3880, 3605][k].toLocaleString("fr-FR")}</span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-6 left-8 right-0 rounded-3xl border border-line bg-card p-4 shadow-2xl">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <HandCoins className="size-4 text-gold" /> Cagnotte du mariage
        </div>
        <div className="mt-2 font-display text-2xl font-bold">1 250 000 FCFA</div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[62%] rounded-full gold-gradient" />
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-muted">
          <Sparkles className="size-3.5 text-gold" /> Ouverte à la diaspora par carte
        </div>
      </div>
    </div>
  );
}
