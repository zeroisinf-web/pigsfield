const MODELS = Object.freeze({
  "gpt-oss": Object.freeze({
    id: "@cf/openai/gpt-oss-120b",
    name: "gpt-oss-120b",
    thirdParty: false
  }),
  "gpt-5.4-mini": Object.freeze({
    id: "openai/gpt-5.4-mini",
    name: "gpt-5.4-mini",
    thirdParty: true
  })
});

const MAX_PROMPT_LENGTH = 1800;
const MAX_BODY_BYTES = 12 * 1024;
const MAX_OUTPUT_CHARACTERS = 24_000;
const BASE_INSTRUCTION = [
  "You are Pigsfield's free educational assistant for learners in India.",
  "Answer in the user's language, explain clearly, use practical examples, and distinguish facts from uncertainty.",
  "Be inclusive and concise. Never invent citations, statistics, laws, or official claims.",
  "Reason carefully, but return only the useful answer and never reveal hidden chain-of-thought."
].join(" ");

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }
  });
}

function sameOriginRequest(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch (_) {
    return false;
  }
}

function clientKey(request) {
  const supplied = request.headers.get("X-Pigsfield-Client") || "";
  return /^[a-z0-9-]{12,80}$/i.test(supplied) ? supplied : "anonymous";
}

function edgeKey(request) {
  const value = request.headers.get("CF-Connecting-IP") || "unknown";
  return /^[0-9a-f:.]{3,64}$/i.test(value) ? value : "unknown";
}

function taskInstruction(task, format) {
  if (task === "document") {
    const formatInstruction = format === "md"
      ? "Write polished Markdown with a title, short introduction, useful headings, and a practical conclusion."
      : "Write polished plain text with clear headings and no Markdown or HTML symbols.";
    return BASE_INSTRUCTION + " Create an accurate educational document. " + formatInstruction +
      " Return only the document itself, with no commentary about the task.";
  }
  return BASE_INSTRUCTION + " Give a readable answer with useful line breaks and a concise conclusion.";
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(contentText).filter(Boolean).join("\n");
  if (!content || typeof content !== "object") return "";
  return contentText(content.text) || contentText(content.content) || contentText(content.response);
}

function outputText(result) {
  if (!result) return "";
  const direct = contentText(result.response) || contentText(result.output_text) || contentText(result.text);
  if (direct) return direct;
  const choice = result.choices && result.choices[0];
  const choiceText = contentText(choice && choice.message && choice.message.content) || contentText(choice && choice.text);
  if (choiceText) return choiceText;
  if (Array.isArray(result.output)) {
    return result.output.map((item) => contentText(item && item.content) || contentText(item)).filter(Boolean).join("\n");
  }
  return "";
}

function finalText(value) {
  let text = String(value || "");
  const finalMarker = text.lastIndexOf("</think>");
  if (finalMarker >= 0) text = text.slice(finalMarker + 8);
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, MAX_OUTPUT_CHARACTERS);
}

async function handleAI(request, env) {
  if (request.method !== "POST") return json({ error: "Use POST for AI requests." }, 405);
  if (!sameOriginRequest(request)) return json({ error: "This endpoint accepts same-origin Pigsfield requests only." }, 403);

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "The request is too large." }, 413);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Send a valid JSON request." }, 400);
  }

  const model = MODELS[String(body && body.model || "")];
  const task = ["tutor", "document"].includes(body && body.task) ? body.task : "";
  const prompt = String(body && body.prompt || "").trim();
  const format = ["md", "txt", "html"].includes(body && body.format) ? body.format : "txt";
  if (!model) return json({ error: "Choose one of the available Pigsfield models." }, 400);
  if (!task) return json({ error: "Choose a supported AI function." }, 400);
  if (!prompt) return json({ error: "Enter a prompt to begin." }, 400);
  if (prompt.length > MAX_PROMPT_LENGTH) return json({ error: "Keep the prompt to 1,800 characters or fewer." }, 413);

  if (env.AI_RATE_LIMITER && typeof env.AI_RATE_LIMITER.limit === "function") {
    const limit = await env.AI_RATE_LIMITER.limit({ key: clientKey(request) });
    if (!limit.success) return json({ error: "The shared per-visitor limit is busy. Wait one minute and try again." }, 429);
  }
  if (env.AI_IP_RATE_LIMITER && typeof env.AI_IP_RATE_LIMITER.limit === "function") {
    const limit = await env.AI_IP_RATE_LIMITER.limit({ key: edgeKey(request) });
    if (!limit.success) return json({ error: "The shared network limit is busy. Wait one minute and try again." }, 429);
  }
  if (!env.AI || typeof env.AI.run !== "function") return json({ error: "AI capacity is not configured." }, 503);

  try {
    const input = {
      messages: [
        { role: "system", content: taskInstruction(task, format) },
        { role: "user", content: prompt }
      ],
      stream: false
    };
    if (model.thirdParty) input.max_completion_tokens = 900;
    else {
      input.max_tokens = 900;
      input.temperature = 0.55;
      input.top_p = 0.9;
    }
    const result = await env.AI.run(model.id, input, {
      gateway: { id: "default", collectLog: false }
    });
    const text = finalText(outputText(result));
    if (!text) return json({ error: "The model returned no usable answer." }, 502);
    return json({ text, model: model.name, engine: model.thirdParty ? "cloudflare-ai-gateway" : "cloudflare-workers-ai" });
  } catch (_) {
    const message = model.thirdParty
      ? "GPT-5.4 mini is unavailable. The site owner must enable Cloudflare Unified Billing credits for this model."
      : "Shared AI capacity is temporarily unavailable. Please try again shortly.";
    return json({ error: message }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ai") return handleAI(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "API route not found." }, 404);
    return env.ASSETS.fetch(request);
  }
};

export { MODELS, handleAI, outputText };
