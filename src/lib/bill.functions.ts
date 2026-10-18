import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BillCheck, ExtractedLine } from "./bill-math";

const lineSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "amount", "kind"],
        properties: {
          label: { type: "string" },
          amount: { type: "number" },
          kind: { type: "string", enum: ["charge", "tax", "total"] },
        },
      },
    },
  },
};

export const extractBill = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ fileName: z.string(), mimeType: z.string(), base64: z.string().min(1).max(15_000_000) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ lines: ExtractedLine[] }> => {
    const { callResponses } = await import("./ai.server");
    const filePart =
      data.mimeType === "application/pdf"
        ? { type: "input_file", filename: data.fileName, file_data: `data:application/pdf;base64,${data.base64}` }
        : { type: "input_image", image_url: `data:${data.mimeType};base64,${data.base64}` };
    const text = await callResponses({
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Transcribe every line item on this bill exactly as printed. For each: label, amount (number in rupees, negative for discounts/credits), and kind: 'charge' for any fee/usage/discount, 'tax' for GST/CGST/SGST/IGST lines, 'total' for the final amount payable. Do NOT calculate or invent anything; skip previous balance/payments.",
            },
            filePart,
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "bill_lines", strict: true, schema: lineSchema } },
    });
    try {
      const parsed = JSON.parse(text) as { lines: ExtractedLine[] };
      return { lines: parsed.lines.filter((l) => Number.isFinite(l.amount)) };
    } catch {
      throw new Error("Couldn't read the bill. Try a clearer image.");
    }
  });

export const draftComplaint = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ promise: z.string().max(500), check: z.any() }).parse(d))
  .handler(async ({ data }): Promise<{ message: string; usedFallback: boolean }> => {
    const { foreignNumbers, templateMessage } = await import("./bill-math");
    const check = data.check as BillCheck;
    const facts = {
      promised: data.promise,
      flaggedLines: check.lines.filter((l) => l.flag !== "OK").map((l) => ({ label: l.label, amount: l.amount.toFixed(2), flag: l.flag })),
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
        instructions:
          "Write a short, polite, firm complaint to a phone/utility company's customer care. Use ONLY the numbers given in the facts, copied exactly, with ₹. Never calculate, round or invent numbers, dates or account details. Ask the company to: (1) explain what each flagged charge is for, (2) give the details behind it (e.g. the number called, date/time, and whether the call was incoming or outgoing), (3) confirm the customer's current settings (e.g. roaming status) match what was promised, (4) reverse any charge applied in error. Plain text, no subject line, sign off as 'Customer'.",
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(facts) }] }],
      });
      if (!message.trim() || foreignNumbers(message, check).length) {
        return { message: templateMessage(check, data.promise), usedFallback: true };
      }
      return { message: message.trim(), usedFallback: false };
    } catch (e) {
      console.error(e);
      return { message: templateMessage(check, data.promise), usedFallback: true };
    }
  });
