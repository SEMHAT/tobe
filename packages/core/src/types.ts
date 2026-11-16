// Modèle de données de ToBe. Partagé par le backend (SQLite) et le mode démo du navigateur.

export type Category =
  | "concert"
  | "soiree"
  | "corporate"
  | "culture"
  | "mariage"
  | "concours"
  | "sport"
  | "religieux"
  | "funerailles"
  | "anniversaire"
  | "autre";

export type Visibility = "public" | "unlisted" | "private";
export type Access = "free" | "paid" | "invite";
export type Reach = "quartier" | "ville" | "national" | "international";
export type ImpactTier = "local" | "ville" | "majeur" | "phare";
export type PayMethod = "mixx" | "moov" | "card" | "cash";
export type Theme = "roi" | "or" | "corail" | "nuit" | "vert" | "violet" | "sobre";

export interface User {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  createdAt: string;
  /** "admin" = membre de l'équipe ToBe (le détail des droits est dans teamRole). */
  role: "user" | "admin";
  teamRole?: TeamRole | null;
  passEnabled: boolean;
  faceDescriptor: number[] | null;
  /** Plusieurs empreintes du même visage (face, profil gauche, profil droit) : reconnaissance plus fiable. */
  faceDescriptors?: number[][] | null;
  neverShow: boolean;
  avatar?: string | null;
  googleId?: string | null;
  premiumUntil: string | null;
  pro: boolean;
}

export interface Session {
  id: string; // le jeton lui-même
  userId: string;
  createdAt: string;
}

export interface Otp {
  id: string; // adresse e-mail normalisée
  code: string;
  expiresAt: string;
  attempts: number;
}

export interface TicketType {
  id: string;
  name: string;
  price: number; // FCFA, 0 = gratuit
  quota: number; // 0 = illimité
  sold: number;
}

export interface EventOptions {
  votes: boolean;
  cagnotte: boolean;
  gallery: boolean;
  live: boolean;
}

export interface TobeEvent {
  id: string;
  slug: string;
  organizerId: string;
  organizerName: string;
  title: string;
  category: Category;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  city: string;
  lat: number | null;
  lng: number | null;
  description: string;
  program: { time: string; label: string }[];
  cover: string | null;
  theme: Theme;
  visibility: Visibility;
  access: Access;
  accessCode: string | null;
  invitees: string[]; // e-mails autorisés pour un événement privé
  ticketTypes: TicketType[];
  expectedAttendance: number;
  reach: Reach;
  options: EventOptions;
  liveUrl: string | null;
  boostedUntil: string | null;
  views: number;
  contestId: string | null;
  cagnotteId: string | null;
  tobeRequestId: string | null;
  createdAt: string;
  /** Dernière modification par l'organisateur. */
  updatedAt?: string | null;
  demoOwned?: boolean;
}

export interface Order {
  id: string;
  eventId: string;
  userId: string;
  ticketTypeId: string;
  ticketTypeName: string;
  qty: number;
  unitPrice: number;
  fee: number;
  total: number;
  method: PayMethod;
  /** paid : payé en ligne · reserved : place réservée, à régler à l'entrée */
  status: "paid" | "reserved" | "pending" | "failed";
  code: string;
  scannedCount: number;
  createdAt: string;
}

export interface Candidate {
  id: string;
  number: number;
  name: string;
  bio: string;
  photo: string | null;
  freeVotes: number;
  paidVotes: number;
  juryScore: number | null; // sur 100
}

export interface Contest {
  id: string;
  eventId: string;
  title: string;
  mode: "free" | "paid" | "mixed";
  votePrice: number;
  opensAt: string;
  closesAt: string;
  results: "live" | "hidden" | "top3";
  juryWeight: number; // 0 à 100 : part du jury dans le résultat final
  candidates: Candidate[];
}

export interface VoteRecord {
  id: string;
  contestId: string;
  candidateId: string;
  userId: string;
  count: number;
  amount: number;
  kind: "free" | "paid";
  method: PayMethod | null;
  createdAt: string;
}

export interface Cagnotte {
  id: string;
  eventId: string;
  title: string;
  description: string;
  goal: number;
  collected: number;
  contributors: number;
  createdAt: string;
}

export interface Contribution {
  id: string;
  cagnotteId: string;
  userId: string;
  name: string;
  amount: number;
  message: string;
  anonymous: boolean;
  method: PayMethod;
  createdAt: string;
}

export interface Photo {
  id: string;
  eventId: string;
  url: string;
  width: number;
  height: number;
  faces: number[][]; // descripteurs de visages (128 valeurs chacun)
  uploadedBy: string;
  createdAt: string;
}

export interface Provider {
  id: string;
  ownerId: string | null;
  status: "pending" | "approved" | "rejected";
  email: string;
  name: string;
  category: "mc" | "deco" | "son" | "photo" | "traiteur" | "securite" | "costume" | "logistique";
  city: string;
  rating: number;
  reviews: number;
  certified: boolean;
  bio: string;
  phone: string;
  priceFrom: number;
  theme: Theme;
}

export interface QuoteRequest {
  id: string;
  providerId: string;
  userId: string;
  message: string;
  date: string | null;
  createdAt: string;
}

export interface TobeRequest {
  id: string;
  eventId: string | null;
  userId: string;
  level: "complete" | "carte" | "devis";
  services: string[];
  budget: string;
  note: string;
  phone: string;
  email: string;
  name: string;
  eventTitle: string;
  status: "nouveau" | "contacte" | "devis" | "signe" | "perdu";
  /** Chef de projet ToBe en charge du dossier. */
  assignedTo?: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  userId: string;
  kind: "ticket" | "vote" | "contribution" | "boost" | "premium" | "pro";
  refId: string;
  eventId: string | null;
  amount: number; // payé par le client
  platformFee: number; // revenu de la plateforme
  method: PayMethod;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

// ---------- ToBe Club (jeu, points et récompenses) ----------
export interface Player {
  id: string; // identifiant de l'utilisateur
  points: number; // solde disponible
  earned: number; // total gagné depuis le début (détermine le niveau)
  streak: number;
  bestStreak: number;
  lastDay: string | null; // dernier bonus du jour (AAAA-MM-JJ)
  spinDay: string | null;
  quizDay: string | null;
  quizResult: { score: number; total: number; points: number } | null;
  missions: Record<string, string>; // mission -> date de validation
  attended: string[]; // événements dont la présence a déjà rapporté des points
  refCode: string;
  referredBy: string | null;
  referrals: number;
  boostCredits: number;
  badges: string[];
  /** Première ouverture de l'application installée. */
  installedAt?: string | null;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  label: string;
  month: string; // AAAA-MM
  createdAt: string;
}

export type RewardKind = "boost" | "premium" | "badge" | "lot";

export interface Reward {
  id: string;
  title: string;
  description: string;
  cost: number;
  kind: RewardKind;
  stock: number | null; // null = illimité
  active: boolean;
  createdAt: string;
}

export interface Redemption {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  rewardId: string;
  title: string;
  kind: RewardKind;
  cost: number;
  code: string;
  status: "livre" | "a-remettre" | "remis";
  createdAt: string;
}

// ---------- Équipe ToBe (agence) ----------
export type TeamRole = "super_admin" | "admin" | "chef_projet" | "moderateur" | "support" | "marketing";

// ---------- Équipe d'un événement ----------
export type EventRole = "co_organisateur" | "controleur" | "photographe";

export interface EventMember {
  id: string;
  eventId: string;
  userId: string;
  role: EventRole;
  addedBy: string;
  createdAt: string;
}

/** Invitation envoyée par lien (WhatsApp, copie) : rejoindre l'équipe d'un événement ou l'équipe ToBe. */
export interface Invite {
  id: string; // le jeton, partagé dans le lien
  kind: "event" | "team";
  role: EventRole | TeamRole;
  eventId: string | null;
  label: string; // nom de la personne invitée, pour s'y retrouver
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedBy: string | null;
  usedAt: string | null;
  revoked: boolean;
}

// ---------- Rappels et notifications push ----------
export interface PushSub {
  id: string; // empreinte de l'adresse d'envoi
  userId: string | null;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ua: string;
  createdAt: string;
  failures: number;
}

export type ReminderStage = "j2" | "veille" | "jourj" | "bientot";

export interface Reminder {
  id: string;
  eventId: string;
  userId: string | null;
  subId: string | null; // visiteur non connecté : rappel lié à son téléphone
  source: "follow" | "ticket";
  sent: ReminderStage[];
  createdAt: string;
}

export interface Setting {
  id: string;
  value: Record<string, unknown>;
}
