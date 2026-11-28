import { TOBE_SERVICES } from "@tobe/core";
import { ArrowRight, Briefcase, CalendarCheck, Check, ClipboardList, Crown, HandCoins, Heart, Megaphone, Mic2, PartyPopper, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Field, TopBar, cx, inputCls } from "../components/ui";
import { api } from "../lib/api";
import { usePageMeta } from "../lib/seo";
import { useSession } from "../lib/session";

// L'agence ToBe : ce que ToBe organise pour ses clients et comment.
// La plateforme référence les événements ; cette page présente le métier d'organisateur.

type Level = "complete" | "carte" | "devis";

const TYPES: Array<{ icon: ReactNode; title: string; text: string }> = [
  { icon: <Heart />, title: "Mariages et familles", text: "Mariage, dot, fiançailles, anniversaire, baptême, retrouvailles." },
  { icon: <Briefcase />, title: "Entreprises", text: "Lancement de produit, séminaire, conférence, gala, inauguration, fin d'année." },
  { icon: <Mic2 />, title: "Culture et spectacles", text: "Concert, soirée, concours, festival, défilé." },
  { icon: <PartyPopper />, title: "Associations et institutions", text: "Cérémonie, forum, journée thématique, remise de prix." },
];

const ETAPES: Array<[string, string]> = [
  ["On vous écoute", "Un premier échange pour comprendre l'idée, les invités, la date et le budget."],
  ["Concept et devis", "Nous proposons un concept, un programme et un devis écrit, poste par poste."],
  ["Préparation", "Lieu, prestataires, décoration, son et lumière, invitations et billetterie : nous coordonnons tout."],
  ["Le jour J", "Notre équipe est sur place du montage au rangement. Vous profitez de votre événement."],
  ["Le bilan", "Photos et vidéos livrées, galerie avec Pass ToBe pour vos invités, et un bilan avec vous."],
];

export function Agency() {
  usePageMeta({
    title: "Organisation d'événements à Lomé",
    description: "ToBe organise votre événement à Lomé : mariage, anniversaire, lancement, séminaire, concert. Concept, prestataires, décoration, communication et jour J.",
  });
  const { me, requireAuth, toast } = useSession();
  const [level, setLevel] = useState<Level>("complete");
  const [services, setServices] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const valid = title.trim().length > 1 && (level !== "carte" || services.length > 0) && (!!me?.user.phone || phone.replace(/\D/g, "").length >= 8);

  async function envoyer() {
    if (!(await requireAuth("Connectez-vous pour envoyer votre demande à l'équipe ToBe"))) return;
    setSending(true);
    try {
      await api("POST", "/tobe-requests", {
        level,
        services: level === "carte" ? services : [],
        eventTitle: title.trim(),
        budget,
        note: [date && `Date envisagée : ${date}`, note.trim()].filter(Boolean).join("\n"),
        phone: phone || undefined,
      });
      setSent(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Envoi impossible, réessayez", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <TopBar title="Organiser avec ToBe" />
      <div className="mx-auto max-w-3xl space-y-10 px-5 pb-20 pt-4 lg:px-0">
        {/* En-tête */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#120a4a] to-[#0b0b12] p-6 text-white sm:p-9">
          <div className="absolute -right-16 -top-16 size-56 rounded-full bg-brand/30 blur-3xl" aria-hidden />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#9d93ff]">L'agence ToBe</p>
          <h1 className="mt-3 font-display text-[30px] font-black leading-[1.05] sm:text-[42px]">
            We bring events <span className="text-[#9d93ff]">to life.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/75">
            Sur ToBe, vous trouvez les événements de Lomé. Mais ToBe, c'est aussi une équipe qui organise le vôtre, de la première idée jusqu'au dernier invité.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#demande" className="flex h-12 items-center gap-2 rounded-full bg-white px-5 font-bold text-[#0b0b12]">
              Parler de mon événement <ArrowRight className="size-4" />
            </a>
          </div>
        </section>

        {/* Ce que nous organisons */}
        <section>
          <h2 className="font-display text-[22px] font-bold">Ce que nous organisons</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {TYPES.map((t) => (
              <div key={t.title} className="flex gap-3 rounded-2xl border border-line bg-card p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand [&>svg]:size-5">{t.icon}</span>
                <div>
                  <h3 className="font-display font-bold">{t.title}</h3>
                  <p className="mt-1 text-sm text-muted">{t.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Comment nous travaillons */}
        <section>
          <h2 className="font-display text-[22px] font-bold">Comment nous l'organisons</h2>
          <ol className="mt-4 space-y-3">
            {ETAPES.map(([t, d], i) => (
              <li key={t} className="flex gap-4 rounded-2xl border border-line bg-card p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand font-display text-lg font-black text-white">{i + 1}</span>
                <span>
                  <span className="block font-bold">{t}</span>
                  <span className="text-sm text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted">
            Les métiers de l'événement autour de nous : {TOBE_SERVICES.join(", ").toLowerCase()}. Nos prestataires sont aussi dans l'
            <Link to="/prestataires" className="font-semibold text-brand">annuaire</Link>.
          </p>
        </section>

        {/* Demande */}
        <section id="demande" className="scroll-mt-20 rounded-[28px] border border-line bg-card p-5 sm:p-7">
          {sent ? (
            <div className="py-6 text-center">
              <CalendarCheck className="mx-auto size-10 text-brand" />
              <h2 className="mt-3 font-display text-xl font-bold">Demande reçue</h2>
              <p className="mt-2 text-sm text-muted">L'équipe ToBe vous rappelle sous 24 h pour en parler.</p>
              <Link to="/explorer" className="mt-5 inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold">
                Voir les événements à Lomé
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-[22px] font-bold">Parlons de votre événement</h2>
                <p className="mt-1 text-sm text-muted">Sans engagement. Un conseiller vous rappelle sous 24 h.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ["complete", <Crown key="c" />, "Organisation complète", "On s'occupe de tout."],
                  ["carte", <Sparkles key="s" />, "À la carte", "Seulement ce qu'il vous faut."],
                  ["devis", <HandCoins key="h" />, "Simple devis", "Une estimation d'abord."],
                ] as Array<[Level, ReactNode, string, string]>).map(([v, icon, t, d]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setLevel(v)}
                    className={cx("rounded-2xl border p-4 text-left transition", level === v ? "border-brand bg-brand/10" : "border-line bg-app")}
                    aria-pressed={level === v}
                  >
                    <span className="text-brand [&>svg]:size-5">{icon}</span>
                    <span className="mt-2 block font-bold">{t}</span>
                    <span className="block text-xs text-muted">{d}</span>
                  </button>
                ))}
              </div>
              {level === "carte" && (
                <div className="flex flex-wrap gap-2">
                  {TOBE_SERVICES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setServices(services.includes(s) ? services.filter((x) => x !== s) : [...services, s])}
                      className={cx("flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium", services.includes(s) ? "border-brand bg-brand text-white" : "border-line bg-app")}
                    >
                      {services.includes(s) && <Check className="size-4" />} {s}
                    </button>
                  ))}
                </div>
              )}
              <Field label="Votre événement">
                <input className={inputCls} placeholder="Ex. Mariage de Afi et Koffi, lancement de notre boutique…" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date envisagée (facultatif)">
                  <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Budget envisagé (facultatif)">
                  <input className={inputCls} placeholder="Ex. 1 500 000 FCFA" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </Field>
              </div>
              {!me?.user.phone && (
                <Field label="Votre numéro de téléphone" hint="Pour que le conseiller ToBe vous rappelle.">
                  <input type="tel" inputMode="tel" className={inputCls} placeholder="90 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
              )}
              <Field label="Votre idée en quelques mots (facultatif)">
                <textarea className={`${inputCls} min-h-24`} placeholder="Nombre d'invités, lieu, ambiance souhaitée…" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button full size="lg" disabled={!valid} loading={sending} onClick={envoyer} icon={<ClipboardList className="size-5" />}>
                Envoyer ma demande
              </Button>
            </div>
          )}
        </section>

        {/* Interlocuteur, discret */}
        <section className="flex items-center gap-4 rounded-2xl border border-line p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand/10 font-display text-base font-black text-brand" aria-hidden>BP</span>
          <div className="min-w-0 text-sm">
            <p className="font-bold">Bruno Passama Pilike</p>
            <p className="text-muted">Responsable de ToBe. Il suit chaque projet, du premier appel au bilan.</p>
          </div>
          <Megaphone className="ml-auto hidden size-5 shrink-0 text-faint sm:block" aria-hidden />
        </section>
        <p className="text-center text-xs text-faint">
          ToBe est une marque d'<a href="https://eledji.com/entreprise" className="hover:text-ink">ELEDJI SARL U</a>, Lomé.
        </p>
      </div>
    </>
  );
}
