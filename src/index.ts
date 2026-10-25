/**
 * NovaOrb AI chat Worker with optional Owner Panel integration.
 * Keep the existing streaming chat UI and API behavior.
 */
import { Env, ChatMessage } from "./types";
import { chatGate, chatDone } from "./chat-integration";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";
const SYSTEM_PROMPT = "You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/api/chat") {
      const corsHeaders = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
      };

      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

      if (request.method === "POST") {
        const gate = await chatGate(env, request);
        if (!gate.ok) {
          return new Response(JSON.stringify({ error: gate.error }), {
            status: gate.status,
            headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          });
        }

        const response = await handleChatRequest(request, env, gate.cfg);
        ctx.waitUntil(chatDone(env, response.ok));
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }

      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handleChatRequest(
  request: Request,
  env: Env,
  config: { ai_model: string; system_prompt: string; chat_mode: string },
): Promise<Response> {
  try {
    const { messages = [] } = (await request.json()) as { messages: ChatMessage[] };
    if (!messages.some((msg) => msg.role === "system")) {
      messages.unshift({ role: "system", content: config.system_prompt || SYSTEM_PROMPT });
    }

    const selectedModel = (config.ai_model || MODEL_ID) as typeof MODEL_ID;
    const inputs = { messages, max_tokens: 1024, stream: true } satisfies AiTextGenerationInput & { stream: true };
    const stream = await env.AI.run<typeof MODEL_ID>(selectedModel, inputs, {
      // Optional AI Gateway configuration can be restored here if needed.
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(JSON.stringify({ error: "Failed to process request" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
