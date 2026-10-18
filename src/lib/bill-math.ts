// All BillShield maths lives here. The AI never calculates anything.

export const GST_RATE = 0.18;
const TOLERANCE = 1; // ₹1 rounding tolerance

export type LineKind = "charge" | "tax" | "total";
export type ExtractedLine = { label: string; amount: number; kind: LineKind };
export type Flag = "OK" | "Unexplained" | "Wrong";
export type CheckedLine = ExtractedLine & { flag: Flag; reason: string };

export type BillCheck = {
  lines: CheckedLine[];
  promisedPrice: number | null;
  sumOfCharges: number;
  gst: number;
  computedTotal: number;
  billTax: number | null;
  billTotal: number | null;
  expectedTotal: number | null;
  difference: number | null;
  unexplainedTotal: number;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pull the promised plan price (first rupee amount) out of the user's text. */
export function parsePromisedPrice(promise: string): number | null {
  const m = promise.replace(/,/g, "").match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  return Number(m[1] ?? m[2]);
}

const PLAN_WORDS = ["plan", "rental", "monthly", "subscription", "tariff"];

function isCoveredByPromise(line: ExtractedLine, promise: string, price: number | null): boolean {
  if (price !== null && Math.abs(line.amount - price) <= TOLERANCE) return true;
  const label = line.label.toLowerCase();
  if (PLAN_WORDS.some((w) => label.includes(w))) return true;
  // label words the user explicitly mentioned (ignoring short words and "off" items)
  const promiseLower = promise.toLowerCase();
  const words = label.split(/[^a-z]+/).filter((w) => w.length > 3);
  return words.some((w) => promiseLower.includes(w) && !new RegExp(`${w}\\s+(off|disabled|no)`).test(promiseLower));
}

export function checkBill(extracted: ExtractedLine[], promise: string): BillCheck {
  const promisedPrice = parsePromisedPrice(promise);
  const charges = extracted.filter((l) => l.kind === "charge");
  const taxLines = extracted.filter((l) => l.kind === "tax");
  const totalLines = extracted.filter((l) => l.kind === "total");

  const sumOfCharges = round2(charges.reduce((s, l) => s + l.amount, 0));
  const gst = round2(sumOfCharges * GST_RATE);
  const computedTotal = round2(sumOfCharges + gst);
  const billTax = taxLines.length ? round2(taxLines.reduce((s, l) => s + l.amount, 0)) : null;
  const lastTotal = totalLines[totalLines.length - 1];
  const billTotal = lastTotal ? round2(lastTotal.amount) : null;
  const expectedTotal = promisedPrice !== null ? round2(promisedPrice * (1 + GST_RATE)) : null;
  const finalTotal = billTotal ?? computedTotal;
  const difference = expectedTotal !== null ? round2(finalTotal - expectedTotal) : null;

  const taxWrong = billTax !== null && Math.abs(billTax - gst) > TOLERANCE;
  const totalWrong = billTotal !== null && Math.abs(billTotal - round2(sumOfCharges + (billTax ?? gst))) > TOLERANCE;

  const lines: CheckedLine[] = extracted.map((l) => {
    if (l.kind === "tax")
      return taxWrong
        ? { ...l, flag: "Wrong", reason: `Tax should be ₹${gst.toFixed(2)} (18% of ₹${sumOfCharges.toFixed(2)})` }
        : { ...l, flag: "OK", reason: "Matches 18% GST" };
    if (l.kind === "total")
      return totalWrong
        ? { ...l, flag: "Wrong", reason: "Lines and tax don't add up to this total" }
        : { ...l, flag: "OK", reason: "Adds up" };
    return isCoveredByPromise(l, promise, promisedPrice)
      ? { ...l, flag: "OK", reason: "Covered by your plan" }
      : { ...l, flag: "Unexplained", reason: "Not covered by what you were promised" };
  });

  const unexplainedTotal = round2(
    lines.filter((l) => l.flag === "Unexplained").reduce((s, l) => s + l.amount, 0),
  );

  return { lines, promisedPrice, sumOfCharges, gst, computedTotal, billTax, billTotal, expectedTotal, difference, unexplainedTotal };
}

/** Every number the complaint message is allowed to contain. */
export function allowedNumbers(c: BillCheck): Set<string> {
  const nums = [
    c.promisedPrice, c.sumOfCharges, c.gst, c.computedTotal, c.billTax, c.billTotal,
    c.expectedTotal, c.difference, c.difference !== null ? Math.abs(c.difference) : null,
    c.unexplainedTotal, 18, ...c.lines.map((l) => l.amount),
  ].filter((n): n is number => n !== null);
  const set = new Set<string>();
  for (const n of nums) {
    set.add(String(round2(n)));
    set.add(round2(n).toFixed(2));
  }
  return set;
}

/** Returns numbers in the message that code did not calculate. */
export function foreignNumbers(message: string, c: BillCheck): string[] {
  const allowed = allowedNumbers(c);
  const found = message.replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? [];
  return found.filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))));
}

export function templateMessage(c: BillCheck, promise: string): string {
  const flagged = c.lines.filter((l) => l.flag !== "OK");
  const list = flagged.map((l) => `- ${l.label}: ₹${l.amount.toFixed(2)} (${l.flag})`).join("\n");
  return `Dear Customer Care,

I was promised: "${promise}". My bill does not match this.

${flagged.length ? `The following charges are unexplained or incorrect:\n${list}\n\n` : ""}Sum of charges: ₹${c.sumOfCharges.toFixed(2)}. GST at 18%: ₹${c.gst.toFixed(2)}. ${c.billTotal !== null ? `Billed total: ₹${c.billTotal.toFixed(2)}.` : `Calculated total: ₹${c.computedTotal.toFixed(2)}.`}${c.difference !== null ? ` This is ₹${Math.abs(c.difference).toFixed(2)} ${c.difference >= 0 ? "more" : "less"} than the expected ₹${c.expectedTotal!.toFixed(2)}.` : ""}

Please provide:
- What each of these charges is for.
- The details behind them (e.g. the number called, date and time, and whether each call was incoming or outgoing).
- Confirmation of my current account settings (e.g. whether roaming and value-added services are off).
- A reversal of any charge applied in error.

Thank you.`;
}
