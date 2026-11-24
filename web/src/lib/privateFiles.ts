import { useEffect, useState } from "react";
import { API_URL, getToken } from "./api";
import { resizeImage } from "./media";

/** Envoie un document privé (pièce d'identité, preuve) : jamais public, visible par son auteur et l'équipe ToBe. */
export async function uploadPrivate(file: File): Promise<string> {
  const { blob } = await resizeImage(file, 1800);
  const res = await fetch(`${API_URL}/api/private-files`, {
    method: "POST",
    headers: { "content-type": blob.type || "image/jpeg", authorization: `Bearer ${getToken() ?? ""}` },
    body: blob,
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !j.id) throw new Error(j.error ?? "Envoi impossible");
  return j.id;
}

/** Affiche un document privé (chargé avec la connexion de l'utilisateur). */
export function usePrivateImage(id: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let u: string | null = null;
    let stop = false;
    fetch(`${API_URL}/api/private-files/${id}`, { headers: { authorization: `Bearer ${getToken() ?? ""}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && !stop) setUrl((u = URL.createObjectURL(b)));
      })
      .catch(() => {});
    return () => {
      stop = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return url;
}
