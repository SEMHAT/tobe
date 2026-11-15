import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Lien de parrainage : https://tobe.eledji.com/?ref=CODE
try {
  const ref = new URLSearchParams(location.search).get("ref");
  if (ref && /^[A-Z0-9]{4,10}$/i.test(ref)) localStorage.setItem("tobe-ref", ref.toUpperCase());
} catch {
  /* navigation privée */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
