const MODEL = "openai/gpt-6-astra";

/** Streams a Responses call and returns the concatenated output text. */
export async function callResponses(body: Record<string, unknown>): Promise<string> {
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
      model: MODEL,
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
