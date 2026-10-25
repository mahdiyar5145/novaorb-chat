/** Type definitions for the NovaOrb chat application. */
export interface Env {
  /** Binding for the Workers AI API. */
  AI: Ai;
  /** Binding for static assets. */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  /** Shared D1 database used by the NovaOrb owner panel. */
  DB: D1Database;
}

/** Represents a chat message. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
