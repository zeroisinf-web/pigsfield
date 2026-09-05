import { handleAccountRoute } from "./account-routes.mjs";
const MODELS = Object.freeze({
  "gemma-4-26b-a4b-it": Object.freeze({
    id: "@cf/google/gemma-4-26b-a4b-it",
    name: "gemma-4-26b-a4b-it",
    tokenField: "max_completion_tokens"
  })
});

const MAX_PROMPT_LENGTH = 1800;
// Ceiling on model calls per India-calendar day, across every visitor. Sized so a normal
// day never touches it while a runaway script cannot spend the month in an afternoon.
const DAILY_AI_CALL_BUDGET = 1500;
const MAX_BODY_BYTES = 12 * 1024;
const MAX_OUTPUT_CHARACTERS = 24_000;
const TRANSLATION_MODEL = "@cf/ai4bharat/indictrans2-en-indic-1B";
const MAX_TRANSLATION_ITEMS = 48;
const MAX_TRANSLATION_CHARACTERS = 10_000;
const MAX_TRANSLATION_OUTPUT_ITEM_CHARACTERS = 12_000;
const MAX_TRANSLATION_OUTPUT_CHARACTERS = 20_000;
const VISITOR_COOKIE = "pf_visitor_month";
const BASE_INSTRUCTION = [
  "You are Pigsfield's free educational assistant for learners in India.",
  "Answer in the user's language, explain clearly, use practical examples, and distinguish facts from uncertainty.",
  "Be inclusive and concise. Never invent citations, statistics, laws, or official claims.",
  "Reason carefully, but return only the useful answer and never reveal hidden chain-of-thought."
].join(" ");

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...extraHeaders
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

// The per-visitor bucket is scoped to the trusted Cloudflare edge address, not to the
// client-supplied identifier alone. Keyed on the header by itself, a caller could rotate it
// for an endless supply of fresh buckets, while every honest browser that sends no header
// shared one "anonymous" bucket and throttled each other. Scoping to the address means the
// identifier can only ever subdivide a visitor own allowance, never escape it.
function clientKey(request) {
  const supplied = request.headers.get("X-Pigsfield-Client") || "";
  const identity = /^[a-z0-9-]{12,80}$/i.test(supplied) ? supplied : "anon";
  return `${edgeKey(request)}|${identity}`;
}

function edgeKey(request) {
  const value = request.headers.get("CF-Connecting-IP") || "unknown";
  return /^[0-9a-f:.]{3,64}$/i.test(value) ? value : "unknown";
}

async function applyAIRateLimits(request, env) {
  if (env.AI_RATE_LIMITER && typeof env.AI_RATE_LIMITER.limit === "function") {
    const limit = await env.AI_RATE_LIMITER.limit({ key: clientKey(request) });
    if (!limit.success) return json({ error: "The shared per-visitor limit is busy. Wait one minute and try again." }, 429);
  }
  if (env.AI_IP_RATE_LIMITER && typeof env.AI_IP_RATE_LIMITER.limit === "function") {
    const limit = await env.AI_IP_RATE_LIMITER.limit({ key: edgeKey(request) });
    if (!limit.success) return json({ error: "The shared network limit is busy. Wait one minute and try again." }, 429);
  }
  return null;
}

async function applyTranslationRateLimits(request, env) {
  if (env.TRANSLATION_RATE_LIMITER && typeof env.TRANSLATION_RATE_LIMITER.limit === "function") {
    const limit = await env.TRANSLATION_RATE_LIMITER.limit({ key: clientKey(request) });
    if (!limit.success) return json({ error: "The shared Hindi translation limit is busy. Wait one minute and try again." }, 429);
  }
  if (env.TRANSLATION_IP_RATE_LIMITER && typeof env.TRANSLATION_IP_RATE_LIMITER.limit === "function") {
    const limit = await env.TRANSLATION_IP_RATE_LIMITER.limit({ key: edgeKey(request) });
    if (!limit.success) return json({ error: "The shared Hindi network limit is busy. Wait one minute and try again." }, 429);
  }
  return null;
}

async function boundedJsonBody(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { response: json({ error: "The request is too large." }, 413) };
  }
  if (!request.body) return { response: json({ error: "Send a valid JSON request." }, 400) };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let source = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        try { await reader.cancel(); } catch (_) {}
        return { response: json({ error: "The request is too large." }, 413) };
      }
      source += decoder.decode(value, { stream: true });
    }
    source += decoder.decode();
    return { body: JSON.parse(source) };
  } catch (_) {
    return { response: json({ error: "Send a valid JSON request." }, 400) };
  }
}

function indiaMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  return /^\d{4}$/.test(year) && /^\d{2}$/.test(month) ? `${year}-${month}` : date.toISOString().slice(0, 7);
}

/** The India-calendar date, so the AI budget resets at IST midnight like the rest of the site. */
function indiaDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const [year, month, day] = [get("year"), get("month"), get("day")];
  return /^\d{4}$/.test(year) && /^\d{2}$/.test(month) && /^\d{2}$/.test(day)
    ? `${year}-${month}-${day}`
    : date.toISOString().slice(0, 10);
}

function cookieValue(request, name) {
  const cookies = String(request.headers.get("Cookie") || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(cookie.slice(separator + 1).trim());
  }
  return "";
}

function visitorCookie(month) {
  return `${VISITOR_COOKIE}=${encodeURIComponent(month)}; Path=/; Max-Age=2764800; Secure; HttpOnly; SameSite=Lax`;
}

function automatedRequest(request) {
  if (request.cf?.botManagement?.verifiedBot) return true;
  const agent = String(request.headers.get("User-Agent") || "");
  return /bot\b|crawler|spider|headless|preview|facebookexternalhit|slurp|bingpreview/i.test(agent);
}

async function counterResponse(stub, increment) {
  const response = await stub.fetch(new Request(`https://counter.internal/${increment ? "increment" : "count"}`, {
    method: increment ? "POST" : "GET"
  }));
  if (!response.ok) throw new Error("Counter storage unavailable");
  const payload = await response.json();
  const count = Number(payload && payload.count);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid counter response");
  return {
    count,
    startedAt: typeof payload.startedAt === "string" ? payload.startedAt : null
  };
}

async function handleVisitors(request, env) {
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Use GET or POST for visitor-count requests." }, 405);
  if (request.method === "POST" && !sameOriginRequest(request)) {
    return json({ error: "This endpoint accepts same-origin Pigsfield requests only." }, 403);
  }
  if (!env.VISITOR_COUNTER || typeof env.VISITOR_COUNTER.getByName !== "function") {
    return json({ error: "Visitor count is not configured." }, 503);
  }

  const month = indiaMonth();
  const alreadyCounted = cookieValue(request, VISITOR_COOKIE) === month;
  let increment = request.method === "POST" && !alreadyCounted && !automatedRequest(request);

  if (increment && env.VISITOR_RATE_LIMITER && typeof env.VISITOR_RATE_LIMITER.limit === "function") {
    const limit = await env.VISITOR_RATE_LIMITER.limit({ key: edgeKey(request) });
    increment = Boolean(limit.success);
  }

  try {
    const result = await counterResponse(env.VISITOR_COUNTER.getByName(`pigsfield-visitors-${month}`), increment);
    const headers = increment ? { "Set-Cookie": visitorCookie(month) } : {};
    return json({
      count: result.count,
      month,
      startedAt: result.startedAt,
      counted: increment,
      definition: "Best-effort browser check-ins; usually one per browser each India calendar month."
    }, 200, headers);
  } catch (_) {
    return json({ error: "Visitor count is temporarily unavailable." }, 503);
  }
}

class MonthlyVisitorCounter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
    let count = Number(await this.state.storage.get("count")) || 0;
    let startedAt = await this.state.storage.get("startedAt") || null;

    if (request.method === "POST" && new URL(request.url).pathname === "/increment") {
      count += 1;
      if (!startedAt) startedAt = new Date().toISOString();
      await this.state.storage.put({ count, startedAt });
    }

    return json({ count, startedAt });
  }
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

  const limited = await applyAIRateLimits(request, env);
  if (limited) return limited;
  // Per-address limits cannot bound total spend, because addresses are cheap. This can.
  const overBudget = await reserveAIBudget(env);
  if (overBudget) return overBudget;
  const parsed = await boundedJsonBody(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;

  const model = MODELS[String(body && body.model || "")];
  const task = ["tutor", "document"].includes(body && body.task) ? body.task : "";
  const prompt = String(body && body.prompt || "").trim();
  const format = ["md", "txt", "html"].includes(body && body.format) ? body.format : "txt";
  if (!model) return json({ error: "Choose one of the available Pigsfield models." }, 400);
  if (!task) return json({ error: "Choose a supported AI function." }, 400);
  if (!prompt) return json({ error: "Enter a prompt to begin." }, 400);
  if (prompt.length > MAX_PROMPT_LENGTH) return json({ error: "Keep the prompt to 1,800 characters or fewer." }, 413);

  if (!env.AI || typeof env.AI.run !== "function") return json({ error: "AI capacity is not configured." }, 503);

  try {
    const input = {
      messages: [
        { role: "system", content: taskInstruction(task, format) },
        { role: "user", content: prompt }
      ],
      stream: false
    };
    input[model.tokenField] = 900;
    input.temperature = 0.55;
    input.top_p = 0.9;
    const result = await env.AI.run(model.id, input, {
      gateway: { id: "default", collectLog: false }
    });
    const text = finalText(outputText(result));
    if (!text) return json({ error: "The model returned no usable answer." }, 502);
    return json({ text, model: model.name, engine: "cloudflare-workers-ai" });
  } catch (_) {
    return json({ error: "Shared AI capacity is temporarily unavailable. Please try again shortly." }, 503);
  }
}

async function handleTranslate(request, env) {
  if (request.method !== "POST") return json({ error: "Use POST for translation requests." }, 405);
  if (!sameOriginRequest(request)) return json({ error: "This endpoint accepts same-origin Pigsfield requests only." }, 403);

  const limited = await applyTranslationRateLimits(request, env);
  if (limited) return limited;
  const parsed = await boundedJsonBody(request);
  if (parsed.response) return parsed.response;
  const texts = parsed.body && parsed.body.text;
  if (!Array.isArray(texts)) return json({ error: "Send text as an array of English strings." }, 400);
  if (!texts.length || texts.length > MAX_TRANSLATION_ITEMS) {
    return json({ error: `Send between 1 and ${MAX_TRANSLATION_ITEMS} text items.` }, 400);
  }
  if (texts.some((value) => typeof value !== "string" || !value.trim())) {
    return json({ error: "Every translation item must be a non-empty string." }, 400);
  }
  const totalCharacters = texts.reduce((sum, value) => sum + value.length, 0);
  if (texts.some((value) => value.length > MAX_TRANSLATION_CHARACTERS) || totalCharacters > MAX_TRANSLATION_CHARACTERS) {
    return json({ error: `Keep each translation batch to ${MAX_TRANSLATION_CHARACTERS.toLocaleString("en-US")} characters or fewer.` }, 413);
  }

  if (!env.AI || typeof env.AI.run !== "function") return json({ error: "Hindi translation capacity is not configured." }, 503);

  try {
    const result = await env.AI.run(TRANSLATION_MODEL, {
      text: texts,
      target_language: "hin_Deva"
    }, {
      gateway: { id: "default", collectLog: false }
    });
    const translations = result && result.translations;
    const validStrings = Array.isArray(translations) && translations.length === texts.length &&
      translations.every((value) => typeof value === "string" && value.trim() && value.length <= MAX_TRANSLATION_OUTPUT_ITEM_CHARACTERS);
    const outputCharacters = validStrings ? translations.reduce((sum, value) => sum + value.length, 0) : 0;
    if (!validStrings || outputCharacters > MAX_TRANSLATION_OUTPUT_CHARACTERS) {
      return json({ error: "The translation model returned an incomplete result." }, 502);
    }
    return json({ translations, model: TRANSLATION_MODEL, engine: "cloudflare-workers-ai" });
  } catch (_) {
    return json({ error: "Hindi translation is temporarily unavailable. Please try again shortly." }, 503);
  }
}

// Workers AI is billed per token, /api/ai is reachable by anything that can set an Origin
// header, and the rate limiters are per-address — so N addresses cost N times as much with
// no ceiling at all. This is that ceiling: a single counter, reset each India-calendar day,
// that stops the day spending before the bill does. It stores a count and a date. No
// visitor identifiers, no prompts.
class DailyAIBudget {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const today = indiaDay();
    let day = await this.state.storage.get("day");
    let used = Number(await this.state.storage.get("used")) || 0;
    if (day !== today) {
      day = today;
      used = 0;
    }

    if (url.pathname === "/spend") {
      const limit = Number(url.searchParams.get("limit")) || DAILY_AI_CALL_BUDGET;
      if (used >= limit) return json({ allowed: false, used, limit, day });
      used += 1;
      await this.state.storage.put({ day, used });
      return json({ allowed: true, used, limit, day });
    }

    return json({ allowed: used < DAILY_AI_CALL_BUDGET, used, day });
  }
}

/** Reserve one model call against today budget. Fails open only when the binding is absent. */
async function reserveAIBudget(env) {
  if (!env.AI_BUDGET || typeof env.AI_BUDGET.idFromName !== "function") return null;
  try {
    const stub = env.AI_BUDGET.get(env.AI_BUDGET.idFromName("global"));
    const response = await stub.fetch(`https://budget/spend?limit=${DAILY_AI_CALL_BUDGET}`, { method: "POST" });
    const body = await response.json();
    if (body && body.allowed === false) {
      return json({ error: "Pigsfield has reached its shared AI limit for today. It resets after midnight IST." }, 429);
    }
  } catch (_) {
    // A storage blip must not take the studio down; the per-address limiters still apply.
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.href, 308);
    }
    if (url.pathname === "/api/ai") return handleAI(request, env);
    if (url.pathname === "/api/translate") return handleTranslate(request, env);
    if (url.pathname === "/api/visitors") return handleVisitors(request, env);
    // Optional sign-in. Answers a clear "not enabled" when no D1 database is bound, so a
    // deployment without accounts behaves exactly as it did before.
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/saved") {
      return handleAccountRoute(request, env, url);
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "API route not found." }, 404);
    return env.ASSETS.fetch(request);
  }
};

export {
  MAX_TRANSLATION_CHARACTERS,
  MAX_TRANSLATION_ITEMS,
  MAX_TRANSLATION_OUTPUT_CHARACTERS,
  MAX_TRANSLATION_OUTPUT_ITEM_CHARACTERS,
  MODELS,
  DailyAIBudget,
  MonthlyVisitorCounter,
  TRANSLATION_MODEL,
  handleAI,
  handleTranslate,
  handleVisitors,
  indiaDay,
  indiaMonth,
  outputText
};
