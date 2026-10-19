const LOVABLE_MODEL = "openai/gpt-6-astra";
const ANTHROPIC_MODELS = [
  process.env["ANTHROPIC_MODEL"],
  "claude-sonnet-5-5",
  "claude-sonnet-4-5",
  "claude-sonnet-4-0",
  "claude-3-7-sonnet-latest",
].filter((m): m is string => !!m);

type Part = { type: string; text?: string; image_url?: string; file_data?: string; [k: string]: unknown };
type Msg = { role: string; content: Part[] | string };

/**
 * Sends a Responses-style request and returns the output text.
 * Uses the owner's own Anthropic key when ANTHROPIC_API_KEY is set,
 * otherwise falls back to the Lovable AI gateway.
 */
export async function callResponses(body: Record<string, unknown>): Promise<string> {
  if (process.env["ANTHROPIC_API_KEY"]) return callAnthropic(body);
  return callLovable(body);
}

/* ---------- Anthropic (owner's key) ---------- */

function dataUrlParts(url: string): { mediaType: string; data: string } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
  if (!m || !m[1] || !m[2]) throw new Error("Unsupported file format.");
  return { mediaType: m[1], data: m[2] };
}

function toAnthropicContent(content: Part[] | string): Record<string, unknown>[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map((p) => {
    if (p.type === "input_text") return { type: "text", text: p.text };
    if (p.type === "input_image") {
      const { mediaType, data } = dataUrlParts(p.image_url ?? "");
      return { type: "image", source: { type: "base64", media_type: mediaType, data } };
    }
    if (p.type === "input_file") {
      const { mediaType, data } = dataUrlParts(p.file_data ?? "");
      return { type: "document", source: { type: "base64", media_type: mediaType, data } };
    }
    throw new Error("Unsupported input type.");
  });
}

function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}

async function callAnthropic(body: Record<string, unknown>): Promise<string> {
  const key = process.env["ANTHROPIC_API_KEY"] as string;
  const messages = ((body["input"] as Msg[] | undefined) ?? []).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: toAnthropicContent(m.content),
  }));

  const format = (body["text"] as { format?: { type?: string; schema?: unknown } } | undefined)?.format;
  const wantsJson = format?.type === "json_schema";
  const instructions = body["instructions"];
  let system = typeof instructions === "string" ? instructions : "";
  if (wantsJson) {
    system +=
      (system ? "\n\n" : "") +
      `Respond with ONLY a single JSON object (no prose, no code fences) that matches this JSON schema exactly:\n${JSON.stringify(format?.schema)}`;
  }

  let res: Response | null = null;
  let lastErr = "";
  for (const model of ANTHROPIC_MODELS) {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        temperature: 0,
        ...(system ? { system } : {}),
        messages,
      }),
    });
    if (res.ok) break;
    lastErr = await res.text().catch(() => "");
    console.error("Anthropic error", model, res.status, lastErr);
    const modelProblem = res.status === 404 || (res.status === 400 && /model/i.test(lastErr));
    if (!modelProblem) break;
  }
  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    let detail = "";
    try {
      detail = (JSON.parse(lastErr) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      detail = lastErr.slice(0, 200);
    }
    if (status === 429) throw new Error("Too many requests, please try again shortly.");
    if (status === 401) throw new Error("The AI key is not valid.");
    if (/credit balance/i.test(detail)) throw new Error("Your Anthropic account is out of credit. Add credit at console.anthropic.com.");
    throw new Error(`AI error ${status}: ${detail || "unknown"}`);
  }
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (json.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  return wantsJson ? extractJson(text) : text;
}

/* ---------- Lovable AI gateway (fallback) ---------- */

async function callLovable(body: Record<string, unknown>): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      Authorization: `Bearer ${key}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: LOVABLE_MODEL,
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      ...body,
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    console.error("AI error", res.status, t);
    if (res.status === 429) throw new Error("Too many requests, please try again shortly.");
    if (res.status === 402) throw new Error("AI credits have run out.");
    throw new Error("The AI service could not process this request.");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const line of parts) {
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") out += ev.delta;
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}
