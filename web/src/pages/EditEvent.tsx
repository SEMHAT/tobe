import type { Access, Category, EventView, Reach, Theme, Visibility } from "@tobe/core";
import { AlertTriangle, CalendarClock, Check, Globe2, ImagePlus, Link2, ListOrdered, Lock, LocateFixed, Plus, Save, Ticket, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, ErrorState, Field, PageLoader, Segmented, TopBar, cx, inputCls } from "../components/ui";
import { EntryFields, TicketingChoice } from "../components/Ticketing";
import { CategoryIcon, Poster, THEMES } from "../components/visual";
import { api, uploadImage } from "../lib/api";
import { CATEGORY_LABELS, formatFcfa, toLocalInput } from "../lib/format";
import { resizeImage } from "../lib/media";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

const CATEGORIES: Category[] = ["concert", "soiree", "corporate", "culture", "concours", "mariage", "anniversaire", "sport", "religieux", "funerailles", "autre"];

interface TicketRow {
  id?: string;
  name: string;
  price: number;
  quota: number;
  sold: number;
}

/** Modifier un événement déjà publié : corriger le nom, la description, les prix, la date, le lieu… */
export function EditEvent() {
  const { id = "" } = useParams();
  const { me } = useSession();
  const { data: ev, error, loading } = useLoad(() => api<EventView>("GET", `/events/${id}`), [id, me?.user.id]);
  if (loading && !ev) return <PageLoader />;
  if (error || !ev)
    return (
      <>
        <TopBar title="Modifier" />
        <ErrorState message={error?.message ?? "Événement introuvable"} />
      </>
    );
  if (!ev.isOrganizer)
    return (
      <>
        <TopBar title="Modifier" />
        <ErrorState message="Seul l'organisateur peut modifier cet événement." />
      </>
    );
  return <EditForm ev={ev} />;
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-line bg-card p-4 lg:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
        <span className="text-brand [&>svg]:size-5">{icon}</span> {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function EditForm({ ev }: { ev: EventView }) {
  const nav = useNavigate();
  const { toast } = useSession();
  const [title, setTitle] = useState(ev.title);
  const [category, setCategory] = useState<Category>(ev.category);
  const [description, setDescription] = useState(ev.description);
  const [cover, setCover] = useState<string | null>(ev.cover);
  const [theme, setTheme] = useState<Theme>(ev.theme);
  const [startsAt, setStartsAt] = useState(toLocalInput(new Date(ev.startsAt)));
  const [endsAt, setEndsAt] = useState(ev.endsAt ? toLocalInput(new Date(ev.endsAt)) : "");
  const [venue, setVenue] = useState(ev.venue);
  const [city, setCity] = useState(ev.city);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(ev.lat != null && ev.lng != null ? { lat: ev.lat, lng: ev.lng } : null);
  const [visibility, setVisibility] = useState<Visibility>(ev.visibility);
  const [accessCode, setAccessCode] = useState(ev.accessCode ?? "");
  const [invitees, setInvitees] = useState((ev.invitees ?? []).join("\n"));
  const [access, setAccess] = useState<Access>(ev.access);
  const [lastTicketAccess, setLastTicketAccess] = useState<Access>(ev.access === "none" ? "free" : ev.access);
  const [entryInfo, setEntryInfo] = useState(ev.entryInfo ?? "");
  const [entryUrl, setEntryUrl] = useState(ev.entryUrl ?? "");
  const [tickets, setTickets] = useState<TicketRow[]>(ev.access === "paid" ? ev.ticketTypes.map((t) => ({ id: t.id, name: t.name, price: t.price, quota: t.quota, sold: t.sold })) : [{ name: "Standard", price: 5000, quota: 0, sold: 0 }]);
  const [capacity, setCapacity] = useState(ev.access === "paid" ? 0 : (ev.ticketTypes[0]?.quota ?? 0));
  const [expected, setExpected] = useState(ev.expectedAttendance);
  const [reach, setReach] = useState<Reach>(ev.reach);
  const [program, setProgram] = useState(ev.program.length ? ev.program : []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const sold = ev.ticketTypes.reduce((n, t) => n + t.sold, 0);
  const soldPaid = ev.ticketTypes.some((t) => t.sold > 0 && t.price > 0);
  const startDate = startsAt ? new Date(startsAt) : null;
  const dateOk = !!startDate && !Number.isNaN(startDate.getTime());
  const dateChanged = dateOk && startDate!.toISOString() !== ev.startsAt;
  const placeChanged = venue.trim() !== ev.venue || city.trim() !== ev.city;
  const warnPeople = sold > 0 && (dateChanged || placeChanged);

  // Prévenir avant de quitter avec des changements non enregistrés.
  const dirty = useMemo(
    () =>
      title !== ev.title ||
      description !== ev.description ||
      category !== ev.category ||
      cover !== ev.cover ||
      dateChanged ||
      placeChanged ||
      visibility !== ev.visibility ||
      access !== ev.access ||
      entryInfo !== (ev.entryInfo ?? "") ||
      entryUrl !== (ev.entryUrl ?? "") ||
      JSON.stringify(tickets.map(({ name, price, quota }) => [name, price, quota])) !== JSON.stringify(ev.ticketTypes.map((t) => [t.name, t.price, t.quota])),
    [title, description, category, cover, dateChanged, placeChanged, visibility, access, entryInfo, entryUrl, tickets, ev],
  );
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && !busy) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, busy]);

  const onCover = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      const { blob } = await resizeImage(f, 1400);
      setCover(await uploadImage(blob, "affiche.jpg"));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setUploading(false);
  };
  const locate = () => {
    if (!navigator.geolocation) return toast("Position indisponible sur cet appareil", "error");
    navigator.geolocation.getCurrentPosition(
      (p) => (setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }), toast("Position enregistrée")),
      () => toast("Autorisez l'accès à la position", "error"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    if (!dateOk) return toast("Indiquez la date et l'heure de début", "error");
    if (endsAt && Number.isNaN(new Date(endsAt).getTime())) return toast("La date de fin n'est pas valide", "error");
    if (warnPeople && !confirm(`${sold} personne(s) ont déjà une place. Elles recevront une notification avec la nouvelle ${dateChanged ? "date" : "adresse"}. Continuer ?`)) return;
    setBusy(true);
    try {
      const v = await api<EventView>("PATCH", `/events/${ev.id}`, {
        title,
        category,
        description,
        cover,
        theme,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        venue,
        city,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        visibility,
        accessCode: visibility === "private" ? accessCode || null : null,
        invitees: invitees.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean),
        access,
        entryInfo: access === "none" ? entryInfo : null,
        entryUrl: access === "none" ? entryUrl : null,
        ticketTypes: access === "none" ? [] : access === "paid" ? tickets.map(({ id, name, price, quota }) => ({ id, name, price, quota })) : [{ id: ev.ticketTypes[0]?.id, name: "Entrée", price: 0, quota: capacity }],
        expectedAttendance: expected,
        reach,
        program: program.filter((p) => p.label.trim()),
      });
      toast(warnPeople ? "Modifications enregistrées : les participants sont prévenus" : "Modifications enregistrées");
      nav(`/organisateur/${v.id}`, { replace: true });
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  return (
    <div className="pb-32 lg:pb-12">
      <TopBar title="Modifier l'événement" />
      <div className="space-y-4 px-5 pt-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0 lg:px-0">
        <div className="space-y-4">
          <Section icon={<ImagePlus />} title="Affiche et présentation">
            <label className="relative block cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
              <Poster cover={cover} theme={theme} category={category} title={title || "Votre affiche"} showTitle className="aspect-[16/10] rounded-[20px]">
                <div className="absolute inset-0 grid place-items-center bg-black/25">
                  <span className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
                    <ImagePlus className="size-4" /> {uploading ? "Envoi…" : cover ? "Changer l'affiche" : "Ajouter une affiche"}
                  </span>
                </div>
              </Poster>
            </label>
            {cover ? (
              <button className="text-sm text-coral" onClick={() => setCover(null)}>
                Retirer l'affiche
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="whitespace-nowrap text-sm text-muted">Couleur</span>
                {(Object.keys(THEMES) as Theme[]).map((t) => (
                  <button key={t} aria-label={THEMES[t].label} onClick={() => setTheme(t)} className={cx("size-8 rounded-full border-2", theme === t ? "border-ink" : "border-transparent")} style={{ background: THEMES[t].bg }} />
                ))}
              </div>
            )}
            <Field label="Nom de l'événement" hint="Le lien de l'événement ne change pas : les partages déjà faits restent valables.">
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Catégorie">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c} onClick={() => setCategory(c)} className={cx("flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium", category === c ? "border-brand bg-brand text-white" : "border-line bg-card")}>
                    <CategoryIcon category={c} className="size-4" /> {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Description">
              <textarea className={`${inputCls} min-h-36`} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </Section>

          <Section icon={<ListOrdered />} title="Programme">
            {program.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={`${inputCls} w-24`} placeholder="20:00" value={p.time} onChange={(e) => setProgram(program.map((x, k) => (k === i ? { ...x, time: e.target.value } : x)))} />
                <input className={`${inputCls} flex-1`} placeholder="Ouverture des portes" value={p.label} onChange={(e) => setProgram(program.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                <button aria-label="Supprimer" onClick={() => setProgram(program.filter((_, k) => k !== i))} className="grid size-11 shrink-0 place-items-center rounded-full text-coral">
                  <Trash2 className="size-5" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => setProgram([...program, { time: "", label: "" }])}>
              Ajouter une étape
            </Button>
          </Section>
        </div>

        <div className="space-y-4">
          <Section icon={<CalendarClock />} title="Date et lieu">
            <Field label="Début">
              <input type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Fin (facultatif)">
              <input type="datetime-local" className={inputCls} value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
            <Field label="Lieu">
              <input className={inputCls} value={venue} onChange={(e) => setVenue(e.target.value)} />
            </Field>
            <div className="flex gap-3">
              <div className="flex-1">
                <Field label="Ville">
                  <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
              </div>
              <button onClick={locate} className={cx("mt-6 flex h-[50px] items-center gap-2 rounded-2xl border px-4 text-sm font-semibold", geo ? "border-emerald/50 text-emerald" : "border-line bg-card")}>
                <LocateFixed className="size-4" /> {geo ? "Placé" : "Ma position"}
              </button>
            </div>
            {warnPeople && (
              <div className="flex gap-2.5 rounded-2xl bg-[#fff4dc] p-3.5 text-sm text-[#7a4a00] dark:bg-[#3a2a08] dark:text-[#ffd98a]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {sold} personne{sold > 1 ? "s ont" : " a"} déjà une place : {sold > 1 ? "elles seront prévenues" : "elle sera prévenue"} par notification, et les rappels suivront la nouvelle {dateChanged ? "date" : "adresse"}.
                </span>
              </div>
            )}
          </Section>

          <Section icon={<Ticket />} title="Billetterie et prix">
            <TicketingChoice
              on={access !== "none"}
              locked={sold > 0}
              onChange={(on) => {
                if (on) return setAccess(lastTicketAccess);
                if (access !== "none") setLastTicketAccess(access);
                setAccess("none");
              }}
            />
            {access === "none" ? (
              <EntryFields info={entryInfo} setInfo={setEntryInfo} url={entryUrl} setUrl={setEntryUrl} />
            ) : soldPaid ? (
              <p className="rounded-2xl bg-card-2 p-3 text-sm text-muted">Des billets sont déjà réservés : le type d'accès ({access === "paid" ? "payant" : access === "free" ? "gratuit" : "sur invitation"}) ne peut plus changer.</p>
            ) : (
              <Segmented value={access} onChange={setAccess} options={[{ value: "free", label: "Gratuit" }, { value: "paid", label: "Payant" }, { value: "invite", label: "Invitation" }]} />
            )}
            {access === "none" ? null : access === "paid" ? (
              <div className="space-y-3">
                {tickets.map((t, i) => (
                  <div key={t.id ?? `new-${i}`} className="rounded-2xl border border-line bg-card-2 p-3.5">
                    <div className="flex items-center gap-2">
                      <input className={`${inputCls} flex-1`} placeholder="Nom (ex. VIP)" value={t.name} onChange={(e) => setTickets(tickets.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                      {t.sold === 0 && tickets.length > 1 && (
                        <button aria-label="Supprimer" onClick={() => setTickets(tickets.filter((_, k) => k !== i))} className="grid size-11 place-items-center rounded-full text-coral">
                          <Trash2 className="size-5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Field label="Prix (FCFA)">
                        <input type="number" inputMode="numeric" min={0} step={500} className={inputCls} value={t.price || ""} onChange={(e) => setTickets(tickets.map((x, k) => (k === i ? { ...x, price: Number(e.target.value) } : x)))} />
                      </Field>
                      <Field label="Places (0 = illimité)">
                        <input type="number" inputMode="numeric" min={t.sold} className={inputCls} value={t.quota || ""} placeholder="0" onChange={(e) => setTickets(tickets.map((x, k) => (k === i ? { ...x, quota: Number(e.target.value) } : x)))} />
                      </Field>
                    </div>
                    {t.sold > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                        <Users className="size-3.5" /> {t.sold} déjà réservé{t.sold > 1 ? "s" : ""}
                        {t.id && ev.ticketTypes.find((x) => x.id === t.id)?.price !== t.price && <> · ces réservations gardent leur prix de {formatFcfa(ev.ticketTypes.find((x) => x.id === t.id)!.price)}</>}
                      </div>
                    )}
                  </div>
                ))}
                <Button variant="outline" full icon={<Plus className="size-4" />} onClick={() => setTickets([...tickets, { name: "", price: 5000, quota: 0, sold: 0 }])}>
                  Ajouter un type de billet
                </Button>
              </div>
            ) : (
              <Field label="Nombre de places (0 = illimité)" hint={sold ? `${sold} place(s) déjà réservée(s)` : undefined}>
                <input type="number" inputMode="numeric" min={sold} className={inputCls} value={capacity || ""} placeholder="0" onChange={(e) => setCapacity(Number(e.target.value))} />
              </Field>
            )}
          </Section>

          <Section icon={<Globe2 />} title="Visibilité">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["public", "Public", <Globe2 key="g" className="size-5" />],
                  ["unlisted", "Sur lien", <Link2 key="l" className="size-5" />],
                  ["private", "Privé", <Lock key="p" className="size-5" />],
                ] as [Visibility, string, ReactNode][]
              ).map(([v, l, icon]) => (
                <button key={v} onClick={() => setVisibility(v)} className={cx("flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-sm font-semibold", visibility === v ? "border-brand bg-brand-soft text-brand dark:bg-brand/15 dark:text-white" : "border-line")}>
                  {icon} {l}
                </button>
              ))}
            </div>
            {visibility === "private" && (
              <>
                <Field label="Code d'accès" hint="Laissez vide pour en générer un.">
                  <input className={`${inputCls} uppercase`} value={accessCode} onChange={(e) => setAccessCode(e.target.value.toUpperCase().replace(/\s/g, ""))} />
                </Field>
                <Field label="E-mails des invités" hint="Un par ligne.">
                  <textarea className={`${inputCls} min-h-24`} value={invitees} onChange={(e) => setInvitees(e.target.value)} />
                </Field>
              </>
            )}
            <Field label={`Participants attendus : ${expected.toLocaleString("fr-FR")}`}>
              <input type="range" min={10} max={5000} step={10} value={expected} onChange={(e) => setExpected(Number(e.target.value))} className="w-full accent-[#1800ad]" />
            </Field>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ["quartier", "Quartier"],
                  ["ville", "Ville"],
                  ["national", "National"],
                  ["international", "Inter."],
                ] as [Reach, string][]
              ).map(([v, l]) => (
                <button key={v} onClick={() => setReach(v)} className={cx("h-10 rounded-xl border text-xs font-semibold", reach === v ? "border-brand bg-brand/15 text-brand" : "border-line")}>
                  {l}
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* Barre d'enregistrement */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-app/95 px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur-xl sm:mx-auto sm:max-w-[560px] lg:static lg:mx-0 lg:mt-6 lg:max-w-none lg:rounded-3xl lg:border lg:bg-card-2 lg:p-4">
        <div className="flex items-center gap-3">
          <Link to={`/organisateur/${ev.id}`} className="flex h-12 items-center rounded-full px-4 text-sm font-semibold text-muted">
            Annuler
          </Link>
          <Button full size="lg" loading={busy} disabled={uploading} icon={dirty ? <Save className="size-5" /> : <Check className="size-5" />} onClick={save}>
            Enregistrer<span className="hidden sm:inline">&nbsp;les modifications</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
