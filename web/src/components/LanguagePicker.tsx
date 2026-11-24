import { Languages } from "lucide-react";
import { LANGS, setLang, useLang, useT } from "../lib/i18n";
import { cx } from "./ui";

/** Choix de la langue (français, anglais, éwé, kabiyè). */
export function LanguagePicker({ compact }: { compact?: boolean }) {
  const lang = useLang();
  const t = useT();
  const cur = LANGS.find((l) => l.id === lang);
  return (
    <div className={cx(!compact && "rounded-2xl border border-line bg-card p-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <Languages className="size-4 text-brand" />
        {LANGS.map((l) => (
          <button key={l.id} type="button" onClick={() => setLang(l.id)} className={cx("rounded-full px-3 py-1.5 text-sm font-semibold", lang === l.id ? "bg-brand text-white" : "bg-card-2 text-muted hover:text-ink")}>
            {l.label}
          </button>
        ))}
      </div>
      {cur?.review && <p className="mt-2 text-xs text-muted">{t("lang.review")}</p>}
    </div>
  );
}
