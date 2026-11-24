import type {
  Cagnotte,
  Contest,
  Contribution,
  Notification,
  EventMember,
  Invite,
  LedgerEntry,
  PushSub,
  Reminder,
  Setting,
  PaymentIntent,
  Payout,
  Order,
  Otp,
  Player,
  Redemption,
  Reward,
  Payment,
  Photo,
  Provider,
  QuoteRequest,
  Session,
  TobeEvent,
  TobeRequest,
  User,
  VoteRecord,
} from "./types.js";

/** Ce qu'un stockage doit savoir faire : le backend écrit dans SQLite, le mode démo dans le navigateur. */
export interface Persistence {
  upsert(collection: string, doc: { id: string }): void;
  remove(collection: string, id: string): void;
}

export class Collection<T extends { id: string }> {
  private docs = new Map<string, T>();

  constructor(
    readonly name: string,
    initial: T[] = [],
    private persistence?: Persistence,
  ) {
    for (const d of initial) this.docs.set(d.id, d);
  }

  all(): T[] {
    return [...this.docs.values()];
  }

  get(id: string): T | undefined {
    return this.docs.get(id);
  }

  find(pred: (d: T) => boolean): T | undefined {
    for (const d of this.docs.values()) if (pred(d)) return d;
    return undefined;
  }

  some(pred: (d: T) => boolean): boolean {
    return this.find(pred) !== undefined;
  }

  filter(pred: (d: T) => boolean): T[] {
    return this.all().filter(pred);
  }

  insert(doc: T): T {
    this.docs.set(doc.id, doc);
    this.persistence?.upsert(this.name, doc);
    return doc;
  }

  update(id: string, patch: Partial<T> | ((d: T) => T)): T {
    const cur = this.docs.get(id);
    if (!cur) throw new Error(`${this.name}: ${id} introuvable`);
    const next = typeof patch === "function" ? patch(structuredClone(cur)) : { ...cur, ...patch };
    this.docs.set(id, next);
    this.persistence?.upsert(this.name, next);
    return next;
  }

  remove(id: string): void {
    this.docs.delete(id);
    this.persistence?.remove(this.name, id);
  }

  get size(): number {
    return this.docs.size;
  }
}

export const COLLECTIONS = [
  "users",
  "sessions",
  "otps",
  "events",
  "orders",
  "contests",
  "votes",
  "cagnottes",
  "contributions",
  "photos",
  "providers",
  "quotes",
  "tobeRequests",
  "payments",
  "notifications",
  "players",
  "ledger",
  "rewards",
  "redemptions",
  "members",
  "invites",
  "pushSubs",
  "reminders",
  "settings",
  "intents",
  "payouts",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

export interface Db {
  users: Collection<User>;
  sessions: Collection<Session>;
  otps: Collection<Otp>;
  events: Collection<TobeEvent>;
  orders: Collection<Order>;
  contests: Collection<Contest>;
  votes: Collection<VoteRecord>;
  cagnottes: Collection<Cagnotte>;
  contributions: Collection<Contribution>;
  photos: Collection<Photo>;
  providers: Collection<Provider>;
  quotes: Collection<QuoteRequest>;
  tobeRequests: Collection<TobeRequest>;
  payments: Collection<Payment>;
  notifications: Collection<Notification>;
  players: Collection<Player>;
  ledger: Collection<LedgerEntry>;
  rewards: Collection<Reward>;
  redemptions: Collection<Redemption>;
  members: Collection<EventMember>;
  invites: Collection<Invite>;
  pushSubs: Collection<PushSub>;
  reminders: Collection<Reminder>;
  settings: Collection<Setting>;
  intents: Collection<PaymentIntent>;
  payouts: Collection<Payout>;
}

export type DbSnapshot = { [K in CollectionName]?: { id: string }[] };

export function createDb(snapshot: DbSnapshot = {}, persistence?: Persistence): Db {
  const db = {} as Record<string, Collection<{ id: string }>>;
  for (const name of COLLECTIONS) db[name] = new Collection(name, snapshot[name] ?? [], persistence);
  return db as unknown as Db;
}

export function snapshotDb(db: Db): DbSnapshot {
  const out: DbSnapshot = {};
  for (const name of COLLECTIONS) out[name] = (db[name] as Collection<{ id: string }>).all();
  return out;
}
