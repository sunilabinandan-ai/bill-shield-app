import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BillCheck, Extracted } from "./bill-math";

const amountLine = (extra: Record<string, unknown> = {}) => ({
  type: "object",
  additionalProperties: false,
  required: ["label", "amount", ...Object.keys(extra)],
  properties: { label: { type: "string" }, amount: { type: "number" }, ...extra },
});

const billSchema = {
  type: "object",
  additionalProperties: false,
  required: ["charges", "taxes", "statedTotal"],
  properties: {
    charges: { type: "array", items: amountLine({ isPlan: { type: "boolean" } }) },
    taxes: { type: "array", items: amountLine() },
    statedTotal: { type: ["number", "null"] },
  },
};

const EXTRACT_PROMPT = `Read this phone/utility bill and return three separate things, copied exactly as printed:
(a) charges: each charge from the MAIN CHARGE SUMMARY only (plan/rental, add-ons, usage charges, one-time fees, discounts as negative numbers). Set isPlan=true only for the main plan/rental line.
(b) taxes: each tax line (GST, CGST, SGST, IGST).
(c) statedTotal: the bill's stated total for the current period's charges (amount including tax), or null if none.
Rules: extract each charge ONLY ONCE — bills repeat charges on summary and detail pages; use only the main summary. IGNORE itemised call/data/SMS logs, daily usage rows, previous balance, payments received, amount due carried forward, and any subtotal/total rows inside charges or taxes. Do NOT calculate, add up or invent anything.`;

export const extractBill = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ fileName: z.string(), mimeType: z.string(), base64: z.string().min(1).max(15_000_000) }).parse(d),
  )
  .handler(async ({ data }): Promise<Extracted> => {
    const { callResponses } = await import("./ai.server");
    const filePart =
      data.mimeType === "application/pdf"
        ? { type: "input_file", filename: data.fileName, file_data: `data:application/pdf;base64,${data.base64}` }
        : { type: "input_image", image_url: `data:${data.mimeType};base64,${data.base64}` };
    const text = await callResponses({
      input: [{ role: "user", content: [{ type: "input_text", text: EXTRACT_PROMPT }, filePart] }],
      text: { format: { type: "json_schema", name: "bill_extract", strict: true, schema: billSchema } },
    });
    try {
      const p = JSON.parse(text) as Extracted;
      return {
        charges: p.charges.filter((l) => Number.isFinite(l.amount)),
        taxes: p.taxes.filter((l) => Number.isFinite(l.amount)),
        statedTotal: typeof p.statedTotal === "number" && Number.isFinite(p.statedTotal) ? p.statedTotal : null,
      };
    } catch {
      throw new Error("Couldn't read the bill. Try a clearer image.");
    }
  });

export const draftComplaint = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ promise: z.string().max(500), check: z.any() }).parse(d))
  .handler(async ({ data }): Promise<{ message: string; usedFallback: boolean }> => {
    const { foreignNumbers, templateMessage, complaintLines, ensureSignOff, SIGN_OFF } = await import("./bill-math");
    const check = data.check as BillCheck;
    const facts = {
      promised: data.promise,
      flaggedLines: complaintLines(check).map((l) => ({ label: l.label, amount: l.amount.toFixed(2), flag: l.flag, reason: l.reason })),
      sumOfCharges: check.sumOfCharges.toFixed(2),
      gstAt18Percent: check.gst.toFixed(2),
      billedTotal: check.billTotal?.toFixed(2) ?? null,
      calculatedTotal: check.computedTotal.toFixed(2),
      expectedTotalWithGst: check.expectedTotal?.toFixed(2) ?? null,
      differenceFromExpected: check.difference !== null ? Math.abs(check.difference).toFixed(2) : null,
      differenceDirection: check.difference === null ? null : check.difference >= 0 ? "overcharged" : "undercharged",
    };
    try {
      const { callResponses } = await import("./ai.server");
      const message = await callResponses({
        instructions: `Write a short, polite, firm complaint to a phone/utility company's customer care. Mention ONLY the charges in flaggedLines — never other charges. Use ONLY the numbers given in the facts, copied exactly, with ₹. Never calculate, round or invent numbers, dates or account details. Ask the company to: (1) explain what each flagged charge is for, (2) give the details behind it (e.g. the number called, date/time, and whether the call was incoming or outgoing), (3) confirm the customer's current settings (e.g. roaming status) match what was promised, (4) reverse any charge applied in error. Plain text, no subject line. End with exactly "${SIGN_OFF}" on its own final line.`,
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(facts) }] }],
      });
      if (!message.trim() || foreignNumbers(message, check).length) {
        return { message: templateMessage(check, data.promise), usedFallback: true };
      }
      return { message: ensureSignOff(message), usedFallback: false };
    } catch (e) {
      console.error(e);
      return { message: templateMessage(check, data.promise), usedFallback: true };
    }
  });
