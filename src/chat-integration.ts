import type { Env } from "./types";

const enc = new TextEncoder();
const DEFAULTS = {
  maintenance_mode: false,
  maintenance_message: "",
  chat_enabled: true,
  ai_model: "",
  system_prompt: "",
  chat_mode: "standard",
  limit_user_hour: 0,
  limit_user_day: 0,
  limit_global_day: 0,
};
type ChatConfig = typeof DEFAULTS;
let cache: { at: number; cfg: ChatConfig | null } = { at: 0, cfg: null };

const dayOf = () => new Date().toISOString().slice(0, 10);
const now = () => Math.floor(Date.now() / 1000);

async function shortHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(digest)].slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
}

const bump = (env: Env, metric: string) =>
  env.DB.prepare(
    "INSERT INTO usage_daily(day,metric,count) VALUES(?,?,1) ON CONFLICT(day,metric) DO UPDATE SET count=count+1",
  ).bind(dayOf(), metric).run();

async function hit(env: Env, key: string, limit: number, win: number): Promise<boolean> {
  const t = now();
  const row = await env.DB.prepare("SELECT count,reset_at FROM rate WHERE key=?").bind(key).first<{ count: number; reset_at: number }>();
  if (!row || row.reset_at <= t) {
    await env.DB.prepare("INSERT OR REPLACE INTO rate(key,count,reset_at) VALUES(?,?,?)").bind(key, 1, t + win).run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare("UPDATE rate SET count=count+1 WHERE key=?").bind(key).run();
  return true;
}

export async function loadConfig(env: Env, force = false): Promise<ChatConfig> {
  if (!force && cache.cfg && Date.now() - cache.at < 30_000) return cache.cfg;
  const config: ChatConfig = { ...DEFAULTS };
  try {
    const result = await env.DB.prepare("SELECT key,value FROM settings").all<{ key: string; value: string }>();
    for (const row of result.results || []) {
      if (row.key in DEFAULTS) {
        try {
          (config as Record<string, unknown>)[row.key] = JSON.parse(row.value);
        } catch {
          // Ignore malformed settings and keep defaults.
        }
      }
    }
  } catch {
    // Keep defaults if the database cannot be read.
  }
  cache = { at: Date.now(), cfg: config };
  return config;
}

export async function chatGate(env: Env, request: Request): Promise<
  | { ok: true; cfg: ChatConfig }
  | { ok: false; status: number; error: string; cfg: ChatConfig }
> {
  const cfg = await loadConfig(env);
  const fail = async (status: number, error: string) => {
    try { await bump(env, "chat_blocked"); } catch { /* best-effort metric */ }
    return { ok: false as const, status, error, cfg };
  };

  try {
    if (cfg.maintenance_mode) return fail(503, cfg.maintenance_message || "سرویس در حال نگهداری است");
    if (!cfg.chat_enabled) return fail(503, "چت موقتاً غیرفعال است");

    const key = await shortHash((request.headers.get("cf-connecting-ip") || "unknown") + ":novaorb-chat");
    if (cfg.limit_global_day > 0) {
      const row = await env.DB.prepare("SELECT count FROM usage_daily WHERE day=? AND metric='chat_requests'").bind(dayOf()).first<{ count: number }>();
      if (row && row.count >= cfg.limit_global_day) return fail(429, "سقف روزانه‌ی سرویس پر شده است");
    }
    if (cfg.limit_user_hour > 0 && !(await hit(env, "chat:h:" + key, cfg.limit_user_hour, 3600))) {
      return fail(429, "سقف درخواست ساعتی پر شده است");
    }
    if (cfg.limit_user_day > 0 && !(await hit(env, "chat:d:" + key, cfg.limit_user_day, 86400))) {
      return fail(429, "سقف درخواست روزانه پر شده است");
    }
  } catch {
    // Do not take the existing chat offline solely because metrics/rate-limit storage failed.
  }
  return { ok: true, cfg };
}

export async function chatDone(env: Env, ok: boolean): Promise<void> {
  try {
    await bump(env, "chat_requests");
    if (!ok) await bump(env, "chat_errors");
  } catch {
    // Metrics are best-effort.
  }
}
