import type { Db } from "./db";
import type { Cagnotte, Contest, Contribution, Provider, TobeEvent, User } from "./types";

/**
 * Données d'exemple, réservées au développement local et aux tests automatiques.
 * Jamais chargées en production (voir SEED côté serveur).
 */
export function seedDb(db: Db, now = new Date()) {
  if (db.events.size > 0) return;
  const day = (n: number, h = 20, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  // Prochain samedi (ou dans 2 jours au moins) pour la section « Ce week-end ».
  const toSat = ((6 - now.getDay() + 7) % 7) || 7;

  const orgs: User[] = [
    { id: "usr_org_afro", email: "usr_org_afro@exemple.test", phone: "+22890000001", name: "Afro Lomé Events", createdAt: now.toISOString(), role: "user", passEnabled: false, faceDescriptor: null, neverShow: false, premiumUntil: null, pro: true },
    { id: "usr_org_miss", email: "usr_org_miss@exemple.test", phone: "+22890000002", name: "Comité Miss Université", createdAt: now.toISOString(), role: "user", passEnabled: false, faceDescriptor: null, neverShow: false, premiumUntil: null, pro: false },
    { id: "usr_org_forum", email: "usr_org_forum@exemple.test", phone: "+22890000003", name: "Réseau des Entrepreneurs", createdAt: now.toISOString(), role: "user", passEnabled: false, faceDescriptor: null, neverShow: false, premiumUntil: null, pro: true },
    { id: "usr_org_afi", email: "usr_org_afi@exemple.test", phone: "+22890000004", name: "Afi & Koffi", createdAt: now.toISOString(), role: "user", passEnabled: false, faceDescriptor: null, neverShow: false, premiumUntil: null, pro: false },
  ];
  for (const u of orgs) db.users.insert(u);

  const base = {
    endsAt: null,
    lat: null,
    lng: null,
    program: [],
    cover: null,
    accessCode: null,
    invitees: [],
    liveUrl: null,
    boostedUntil: null,
    contestId: null,
    cagnotteId: null,
    tobeRequestId: null,
    createdAt: now.toISOString(),
  } satisfies Partial<TobeEvent>;

  const ev = (e: Omit<TobeEvent, keyof typeof base> & Partial<TobeEvent>): TobeEvent => ({ ...base, ...e }) as TobeEvent;

  const events: TobeEvent[] = [
    ev({
      id: "evt_afronight",
      slug: "lome-afro-night",
      organizerId: "usr_org_afro",
      organizerName: "Afro Lomé Events",
      title: "Lomé Afro Night",
      category: "concert",
      startsAt: day(toSat, 21),
      venue: "Palais des Congrès",
      city: "Lomé",
      lat: 6.1319,
      lng: 1.2228,
      description:
        "La plus grande nuit afrobeats de la rentrée. Six artistes de la nouvelle scène togolaise, un DJ set jusqu'au bout de la nuit et une scénographie son et lumière signée ToBe.",
      program: [
        { time: "21:00", label: "Ouverture des portes, DJ set" },
        { time: "22:30", label: "Plateau de la nouvelle scène" },
        { time: "00:30", label: "Tête d'affiche" },
        { time: "02:00", label: "After jusqu'à l'aube" },
      ],
      theme: "or",
      visibility: "public",
      access: "paid",
      ticketTypes: [
        { id: "tkt_afro_std", name: "Standard", price: 5000, quota: 1500, sold: 612 },
        { id: "tkt_afro_vip", name: "VIP", price: 15000, quota: 200, sold: 74 },
      ],
      expectedAttendance: 1500,
      reach: "national",
      options: { votes: false, cagnotte: false, gallery: true, live: false },
      boostedUntil: day(toSat + 1, 23),
      views: 4820,
      demoOwned: true,
    }),
    ev({
      id: "evt_miss",
      slug: "miss-universite-lome-2026",
      organizerId: "usr_org_miss",
      organizerName: "Comité Miss Université",
      title: "Miss Université de Lomé 2026",
      category: "concours",
      startsAt: day(toSat + 7, 19),
      venue: "Auditorium de l'Université de Lomé",
      city: "Lomé",
      lat: 6.1745,
      lng: 1.2133,
      description:
        "Douze candidates, une couronne. Votez pour votre favorite jusqu'à la veille de la finale : un vote gratuit par jour, et des packs pour soutenir encore plus. Résultat final : 60 % public, 40 % jury.",
      program: [
        { time: "19:00", label: "Accueil et tapis rouge" },
        { time: "20:00", label: "Passage en tenue traditionnelle" },
        { time: "21:30", label: "Questions du jury" },
        { time: "22:30", label: "Couronnement" },
      ],
      theme: "violet",
      visibility: "public",
      access: "paid",
      ticketTypes: [
        { id: "tkt_miss_std", name: "Standard", price: 3000, quota: 1200, sold: 430 },
        { id: "tkt_miss_vip", name: "VIP", price: 10000, quota: 100, sold: 38 },
      ],
      expectedAttendance: 1200,
      reach: "national",
      options: { votes: true, cagnotte: false, gallery: true, live: true },
      views: 9310,
      contestId: "cnt_miss",
    }),
    ev({
      id: "evt_forum",
      slug: "forum-entrepreneurs-togolais",
      organizerId: "usr_org_forum",
      organizerName: "Réseau des Entrepreneurs",
      title: "Forum des Entrepreneurs Togolais",
      category: "corporate",
      startsAt: day(toSat + 12, 9),
      endsAt: day(toSat + 12, 18),
      venue: "Hôtel 2 Février",
      city: "Lomé",
      lat: 6.1288,
      lng: 1.2195,
      description:
        "Une journée de conférences, d'ateliers et de rencontres d'affaires avec des investisseurs de toute la sous-région. Entrée gratuite sur inscription.",
      program: [
        { time: "09:00", label: "Accueil et café réseau" },
        { time: "10:00", label: "Plénière : financer sa croissance" },
        { time: "14:00", label: "Ateliers en parallèle" },
        { time: "17:00", label: "Pitchs et remise des prix" },
      ],
      theme: "nuit",
      visibility: "public",
      access: "free",
      ticketTypes: [{ id: "tkt_forum", name: "Inscription", price: 0, quota: 900, sold: 540 }],
      expectedAttendance: 900,
      reach: "international",
      options: { votes: false, cagnotte: false, gallery: true, live: true },
      views: 6100,
    }),
    ev({
      id: "evt_mariage",
      slug: "mariage-afi-koffi",
      organizerId: "usr_org_afi",
      organizerName: "Afi & Koffi",
      title: "Mariage d'Afi & Koffi",
      category: "mariage",
      startsAt: day(toSat + 14, 15),
      venue: "Jardins de Bè",
      city: "Lomé",
      description:
        "Nous avons la joie de vous inviter à célébrer notre union. Vos messages et contributions nous accompagnent, même de loin.",
      program: [
        { time: "15:00", label: "Cérémonie" },
        { time: "18:00", label: "Cocktail" },
        { time: "20:00", label: "Dîner et soirée dansante" },
      ],
      theme: "corail",
      visibility: "private",
      access: "invite",
      accessCode: "AFI2026",
      ticketTypes: [{ id: "tkt_mariage", name: "Invitation", price: 0, quota: 250, sold: 0 }],
      expectedAttendance: 250,
      reach: "quartier",
      options: { votes: false, cagnotte: true, gallery: true, live: true },
      views: 340,
      cagnotteId: "cag_mariage",
    }),
    ev({
      id: "evt_saveurs",
      slug: "festival-saveurs-be",
      organizerId: "usr_org_afro",
      organizerName: "Afro Lomé Events",
      title: "Festival des Saveurs de Bè",
      category: "culture",
      startsAt: day(toSat, 12),
      endsAt: day(toSat + 1, 22),
      venue: "Plage de Lomé",
      city: "Lomé",
      lat: 6.1225,
      lng: 1.2412,
      description: "Deux jours de cuisine togolaise, de musique live et d'artisanat au bord de l'océan. Trente stands, des démonstrations de chefs et un concours du meilleur fufu.",
      theme: "vert",
      visibility: "public",
      access: "paid",
      ticketTypes: [{ id: "tkt_saveurs", name: "Pass journée", price: 2000, quota: 3000, sold: 880 }],
      expectedAttendance: 2500,
      reach: "ville",
      options: { votes: false, cagnotte: false, gallery: true, live: false },
      views: 2650,
    }),
    ev({
      id: "evt_gospel",
      slug: "soiree-gospel-live",
      organizerId: "usr_org_afro",
      organizerName: "Afro Lomé Events",
      title: "Soirée Gospel Live",
      category: "religieux",
      startsAt: day(toSat + 1, 17),
      venue: "Centre culturel de Tokoin",
      city: "Lomé",
      description: "Chorales, louange et invités surprises pour une soirée de partage.",
      theme: "sobre",
      visibility: "public",
      access: "paid",
      ticketTypes: [{ id: "tkt_gospel", name: "Entrée", price: 2000, quota: 600, sold: 210 }],
      expectedAttendance: 600,
      reach: "ville",
      options: { votes: false, cagnotte: false, gallery: false, live: true },
      views: 980,
    }),
    ev({
      id: "evt_basket",
      slug: "tournoi-basket-3x3-be",
      organizerId: "usr_org_forum",
      organizerName: "Réseau des Entrepreneurs",
      title: "Tournoi de basket 3x3",
      category: "sport",
      startsAt: day(toSat - 1 > 0 ? toSat - 1 : toSat, 16),
      venue: "Terrain de Bè Kpota",
      city: "Lomé",
      description: "Seize équipes du quartier, musique et buvette. Venez soutenir votre équipe !",
      theme: "corail",
      visibility: "public",
      access: "free",
      ticketTypes: [{ id: "tkt_basket", name: "Entrée libre", price: 0, quota: 0, sold: 45 }],
      expectedAttendance: 150,
      reach: "quartier",
      options: { votes: false, cagnotte: false, gallery: true, live: false },
      views: 260,
    }),
    ev({
      id: "evt_afterwork",
      slug: "afterwork-tech-lome",
      organizerId: "usr_org_forum",
      organizerName: "Réseau des Entrepreneurs",
      title: "Afterwork Tech Lomé",
      category: "corporate",
      startsAt: day(3, 18, 30),
      venue: "Rooftop du quartier administratif",
      city: "Lomé",
      description: "Développeurs, designers et entrepreneurs du numérique se retrouvent pour échanger autour d'un verre.",
      theme: "nuit",
      visibility: "public",
      access: "free",
      ticketTypes: [{ id: "tkt_afterwork", name: "Inscription", price: 0, quota: 120, sold: 76 }],
      expectedAttendance: 120,
      reach: "ville",
      options: { votes: false, cagnotte: false, gallery: true, live: false },
      views: 540,
    }),
    ev({
      id: "evt_danse",
      slug: "lome-danse-battle",
      organizerId: "usr_org_afro",
      organizerName: "Afro Lomé Events",
      title: "Lomé Danse Battle",
      category: "concours",
      startsAt: day(toSat + 8, 18),
      venue: "Esplanade du Stade de Kégué",
      city: "Lomé",
      description: "Huit crews s'affrontent en battle. Le public vote pour le prix du public.",
      theme: "corail",
      visibility: "public",
      access: "paid",
      ticketTypes: [{ id: "tkt_danse", name: "Entrée", price: 1000, quota: 800, sold: 190 }],
      expectedAttendance: 800,
      reach: "ville",
      options: { votes: true, cagnotte: false, gallery: true, live: false },
      views: 1800,
      contestId: "cnt_danse",
    }),
  ];
  for (const e of events) db.events.insert(e);

  const missNames: [string, string][] = [
    ["Afi Mensah", "Étudiante en droit, engagée pour l'éducation des filles."],
    ["Ablavi Kodjo", "Passionnée de mode et de design textile."],
    ["Akossiwa Agbeko", "Future médecin, bénévole dans un dispensaire."],
    ["Essi Lawson", "Entrepreneure dans la cosmétique naturelle."],
    ["Dzifa Amegah", "Danseuse et professeure de danse traditionnelle."],
    ["Yawa Ekué", "Étudiante en informatique, codeuse."],
    ["Kafui Adjovi", "Chanteuse de la chorale universitaire."],
    ["Sena Atsou", "Militante pour l'environnement et le recyclage."],
    ["Mawuena Gbedevi", "Étudiante en communication."],
    ["Elom Kpodar", "Championne régionale d'athlétisme."],
    ["Délali Ahiadzro", "Peintre et illustratrice."],
    ["Enyonam Tete", "Étudiante en gestion, entrepreneuse agricole."],
  ];
  const missVotes = [4210, 3880, 3605, 3120, 2890, 2410, 2235, 1980, 1640, 1420, 1210, 980];
  const miss: Contest = {
    id: "cnt_miss",
    eventId: "evt_miss",
    title: "Miss Université de Lomé 2026",
    mode: "mixed",
    votePrice: 100,
    opensAt: day(-10, 8),
    closesAt: day(toSat + 6, 23, 59),
    results: "live",
    juryWeight: 40,
    candidates: missNames.map(([name, bio], i) => ({
      id: `cdt_miss_${i + 1}`,
      number: i + 1,
      name,
      bio,
      photo: null,
      freeVotes: Math.round(missVotes[i] * 0.35),
      paidVotes: Math.round(missVotes[i] * 0.65),
      juryScore: null,
    })),
  };
  const danse: Contest = {
    id: "cnt_danse",
    eventId: "evt_danse",
    title: "Prix du public — Lomé Danse Battle",
    mode: "paid",
    votePrice: 100,
    opensAt: day(-5, 8),
    closesAt: day(toSat + 8, 21),
    results: "top3",
    juryWeight: 0,
    candidates: ["Kpalimé Krew", "Bè Movement", "Tokoin Flow", "Lomé Kings", "Adidogomé Squad", "Nyékonakpoè Steps", "Agoè Fusion", "Hédzranawoé Crew"].map((name, i) => ({
      id: `cdt_danse_${i + 1}`,
      number: i + 1,
      name,
      bio: "Crew de danse urbaine",
      photo: null,
      freeVotes: 0,
      paidVotes: [920, 860, 640, 600, 410, 380, 250, 190][i],
      juryScore: null,
    })),
  };
  db.contests.insert(miss);
  db.contests.insert(danse);

  const cag: Cagnotte = {
    id: "cag_mariage",
    eventId: "evt_mariage",
    title: "Cagnotte du mariage d'Afi & Koffi",
    description: "Pour nous aider à construire notre foyer. Merci pour votre générosité, d'ici ou de la diaspora.",
    goal: 2_000_000,
    collected: 1_250_000,
    contributors: 38,
    createdAt: now.toISOString(),
  };
  db.cagnottes.insert(cag);
  const contribs: [string, number, string, boolean][] = [
    ["Tante Akouvi (Paris)", 100000, "Tous mes vœux de bonheur, mes enfants !", false],
    ["Les collègues de la banque", 150000, "Félicitations aux mariés 🎉", false],
    ["Anonyme", 50000, "Que Dieu bénisse votre union.", true],
    ["Kossi & Ama", 25000, "On a hâte de danser avec vous !", false],
    ["Promo 2018 de l'UL", 75000, "Afi, notre déléguée préférée se marie !", false],
  ];
  contribs.forEach(([name, amount, message, anonymous], i) => {
    const c: Contribution = { id: `ctb_seed_${i}`, cagnotteId: cag.id, userId: "usr_org_afi", name, amount, message, anonymous, method: i % 2 ? "card" : "mixx", createdAt: day(-i - 1, 12) };
    db.contributions.insert(c);
  });

  const providers: Provider[] = [
    { id: "prv_1", ownerId: null, status: "approved", email: "prv_1@exemple.test", name: "Kodjo Animation", category: "mc", city: "Lomé", rating: 4.9, reviews: 64, certified: true, bio: "Maître de cérémonie trilingue (français, éwé, anglais). Mariages, galas et conférences.", phone: "+22890000101", priceFrom: 75000, theme: "or" },
    { id: "prv_2", ownerId: null, status: "approved", email: "prv_2@exemple.test", name: "Studio Lumière d'Afrique", category: "photo", city: "Lomé", rating: 4.8, reviews: 112, certified: true, bio: "Photo et vidéo d'événements, aftermovies livrés en 72 h.", phone: "+22890000102", priceFrom: 120000, theme: "nuit" },
    { id: "prv_3", ownerId: null, status: "approved", email: "prv_3@exemple.test", name: "Déco Pagne & Fleurs", category: "deco", city: "Lomé", rating: 4.7, reviews: 48, certified: true, bio: "Décoration florale et scénographie inspirées des pagnes et du wax.", phone: "+22890000103", priceFrom: 150000, theme: "corail" },
    { id: "prv_4", ownerId: null, status: "approved", email: "prv_4@exemple.test", name: "SonoMax Togo", category: "son", city: "Lomé", rating: 4.6, reviews: 39, certified: false, bio: "Sonorisation, éclairage et écrans LED jusqu'à 5 000 personnes.", phone: "+22890000104", priceFrom: 200000, theme: "violet" },
    { id: "prv_5", ownerId: null, status: "approved", email: "prv_5@exemple.test", name: "Saveurs de Mama Akossiwa", category: "traiteur", city: "Lomé", rating: 4.9, reviews: 91, certified: true, bio: "Cuisine togolaise et internationale, buffets de 50 à 800 couverts.", phone: "+22890000105", priceFrom: 5000, theme: "vert" },
    { id: "prv_6", ownerId: null, status: "approved", email: "prv_6@exemple.test", name: "Garde d'Or Sécurité", category: "securite", city: "Lomé", rating: 4.5, reviews: 22, certified: false, bio: "Agents de sécurité et contrôle d'accès pour vos événements.", phone: "+22890000106", priceFrom: 25000, theme: "sobre" },
    { id: "prv_7", ownerId: null, status: "approved", email: "prv_7@exemple.test", name: "Atelier Kenté & Couture", category: "costume", city: "Lomé", rating: 4.8, reviews: 33, certified: true, bio: "Tenues de cérémonie, uniformes d'équipe et location de costumes.", phone: "+22890000107", priceFrom: 30000, theme: "or" },
    { id: "prv_8", ownerId: null, status: "approved", email: "prv_8@exemple.test", name: "Esso MC", category: "mc", city: "Kara", rating: 4.6, reviews: 18, certified: false, bio: "Animateur pour soirées et concerts dans le Nord.", phone: "+22890000108", priceFrom: 50000, theme: "corail" },
    { id: "prv_9", ownerId: null, status: "approved", email: "prv_9@exemple.test", name: "Logistique Express Lomé", category: "logistique", city: "Lomé", rating: 4.4, reviews: 27, certified: false, bio: "Chapiteaux, chaises, tables, podiums et transport de matériel.", phone: "+22890000109", priceFrom: 40000, theme: "nuit" },
    { id: "prv_10", ownerId: null, status: "approved", email: "prv_10@exemple.test", name: "Ama Vision Drone", category: "photo", city: "Lomé", rating: 4.7, reviews: 15, certified: true, bio: "Prises de vue aériennes et direct vidéo pour la diaspora.", phone: "+22890000110", priceFrom: 90000, theme: "violet" },
  ];
  for (const p of providers) db.providers.insert(p);
}
