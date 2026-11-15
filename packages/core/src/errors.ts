/** Erreur métier renvoyée telle quelle à l'interface, avec son statut HTTP. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}
