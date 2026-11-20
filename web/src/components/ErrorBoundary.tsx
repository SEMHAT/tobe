import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../lib/errors";

/**
 * Filet de sécurité : si un écran plante, on affiche un message et un bouton
 * au lieu d'une page blanche, et l'erreur est signalée à l'équipe ToBe.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string; full?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info.componentStack ?? undefined);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // On change de page : on réessaie d'afficher.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={this.props.full ? "grid min-h-dvh place-items-center bg-app px-6 text-ink" : "grid min-h-[60vh] place-items-center px-6"}>
        <div className="max-w-sm text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-card-2 text-3xl">😕</div>
          <h1 className="mt-4 font-display text-xl font-bold">Oups, cet écran a eu un souci</h1>
          <p className="mt-2 text-sm text-muted">L'équipe ToBe a été prévenue automatiquement. Réessayez, ça repart en général tout de suite.</p>
          <div className="mt-5 flex flex-col gap-2">
            <button onClick={() => this.setState({ error: null })} className="h-12 rounded-full bg-brand font-semibold text-white">
              Réessayer
            </button>
            <button onClick={() => location.reload()} className="h-12 rounded-full border border-line font-semibold">
              Recharger l'application
            </button>
            <a href="/" className="py-2 text-sm font-semibold text-brand">
              Retour à l'accueil
            </a>
          </div>
        </div>
      </div>
    );
  }
}
