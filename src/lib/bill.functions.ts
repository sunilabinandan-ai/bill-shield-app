import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { privateText } from "./saving-rules";
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
  required: ["docType", "currency", "charges", "taxes", "statedTotal"],
  properties: {
    docType: { type: "string", enum: ["bill", "card_statement"] },
    currency: { type: "string" },
    charges: { type: "array", items: amountLine({ isPlan: { type: "boolean" } }) },
    taxes: { type: "array", items: amountLine() },
    statedTotal: { type: ["number", "null"] },
  },
};

const EXTRACT_PROMPT = `First decide what this document is:
- docType "card_statement" if it is a credit/debit card statement (lists purchases from many merchants, with a previous balance, payments and a new balance).
- docType "bill" for a phone, broadband, electricity, gas, water or similar bill.
Also return currency: the currency symbol printed on the document (e.g. "₹", "$", "€", "£").

IF docType is "card_statement":
(a) charges: EVERY individual purchase/transaction listed under this period's NEW CHARGES, in printed order. Label format: "DD Mon – MERCHANT, CITY STATE" (e.g. "01 Jul – VSI*CENTER OF CLAYTON, CLAYTON MO"). Amount as printed. isPlan=false. Do NOT include payments, credits, refunds, previous balance, interest or fees.
(b) taxes: [] (card statements do not have tax lines).
(c) statedTotal: the statement's printed TOTAL NEW CHARGES for this period (NOT the new balance, NOT the minimum payment).
Never include card or account numbers, cardholder names or addresses in labels.

IF docType is "bill", return three separate things, copied exactly as printed:
(a) charges: EVERY row of the MAIN CHARGE SUMMARY table, in printed order, INCLUDING rows whose amount is 0.00 (plan/rental, one-time, usage, roaming, add-ons, other charges; discounts as negative numbers). Set isPlan=true only for the main plan/rental line.
LABEL ACCURACY: each label must be the exact text printed on the SAME ROW as its amount. Before answering, re-check every label/amount pair against the image row by row; never shift a label up or down to a neighbouring row.
MOST SPECIFIC LABEL: bills often show the same charge in more than one table under different names (e.g. "Usage Charges 70.00" in an account table and "International Roaming Service Charges 70.00" in the charge summary). Use the charge summary table, and when the same amount has several names, always use the most specific one (e.g. "International Roaming Service Charges", not "Usage Charges").
(b) taxes: each tax line (GST, CGST, SGST, IGST).
(c) statedTotal: the bill's stated total for the current period's charges (amount including tax), or null if none.
Never extract phone numbers, account numbers or addresses; omit them from labels.
Rules: extract each charge ONLY ONCE — bills repeat charges on summary and detail pages; use only the main summary. IGNORE itemised call/data/SMS logs, daily usage rows, previous balance, payments received, amount due carried forward, and any subtotal/total rows inside charges or taxes. Do NOT calculate, add up or invent anything.`;

export const extractBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
        docType: p.docType === "card_statement" ? "card_statement" : "bill",
        currency: typeof p.currency === "string" ? p.currency.slice(0, 3) : null,
        charges: p.charges.filter((l) => Number.isFinite(l.amount)).map(l => ({ ...l, label: privateText(l.label) })),
        taxes: p.taxes.filter((l) => Number.isFinite(l.amount)).map(l => ({ ...l, label: privateText(l.label) })),
        statedTotal: typeof p.statedTotal === "number" && Number.isFinite(p.statedTotal) ? p.statedTotal : null,
      };
    } catch {
      throw new Error("Couldn't read the bill. Try a clearer image.");
    }
  });

export const draftComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ promise: z.string().max(500), focus: z.string().max(300).optional(), check: z.any() }).parse(d))
  .handler(async ({ data }): Promise<{ message: string; usedFallback: boolean }> => {
    const { foreignNumbers, templateMessage, complaintLines, ensureSignOff, SIGN_OFF } = await import("./bill-math");
    const check = data.check as BillCheck;
    const cur = check.currency || "₹";
    const facts = {
      documentType: check.docType === "card_statement" ? "credit card statement" : "bill",
      currencySymbol: cur,
      promised: data.promise,
      customerQuestion: data.focus ?? "",
      flaggedLines: complaintLines(check).map((l) => ({ label: l.label, amount: l.amount.toFixed(2), flag: l.flag, reason: l.reason })),
      sumOfCharges: check.sumOfCharges.toFixed(2),
      gstAt18Percent: check.hasTax ? check.gst.toFixed(2) : null,
      billedTotal: check.billTotal?.toFixed(2) ?? null,
      calculatedTotal: check.computedTotal.toFixed(2),
      expectedTotalWithGst: check.expectedTotal?.toFixed(2) ?? null,
      differenceFromExpected: check.difference !== null ? Math.abs(check.difference).toFixed(2) : null,
      differenceDirection: check.difference === null ? null : check.difference >= 0 ? "overcharged" : "undercharged",
    };
    try {
      const { callResponses } = await import("./ai.server");
      const message = await callResponses({
        instructions: check.docType === "card_statement"
          ? `Write a short, polite, firm message to a card issuer's customer care querying a transaction on the customer's card statement. Mention ONLY the transactions in flaggedLines — never other charges. Use ONLY the numbers given in the facts, copied exactly, with the currency symbol ${cur}. Never calculate, round or invent numbers, dates, merchant details or account details. Do not mention tax or GST. Ask the issuer to: (1) give the full merchant name, contact details, and date/time of the transaction, (2) provide the receipt or transaction record, (3) confirm whether it was authorised on the card. This is an enquiry: do NOT ask for a credit, refund or reversal. Plain text, no subject line. End with exactly "${SIGN_OFF}" on its own final line.`
          : `Write a short, polite, firm complaint to a phone/utility company's customer care. Mention ONLY the charges in flaggedLines — never other charges. Use ONLY the numbers given in the facts, copied exactly, with the currency symbol ${cur}. Never calculate, round or invent numbers, dates or account details.${check.hasTax ? "" : " Do not mention tax or GST."} Ask the company to: (1) explain what each flagged charge is for, (2) give the details behind it (e.g. the number called, date/time, and whether the call was incoming or outgoing), (3) confirm the customer's current settings (e.g. roaming status) match what was promised, (4) reverse any charge applied in error. Plain text, no subject line. End with exactly "${SIGN_OFF}" on its own final line.`,
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
