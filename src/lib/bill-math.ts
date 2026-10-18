// All BillShield maths lives here. The AI never calculates anything.

export const GST_RATE = 0.18;
const TOLERANCE = 1; // ₹1 rounding tolerance

export type ChargeLine = { label: string; amount: number; isPlan: boolean };
export type TaxLine = { label: string; amount: number };
export type Extracted = { charges: ChargeLine[]; taxes: TaxLine[]; statedTotal: number | null };

export type Flag = "OK" | "Unexplained" | "Wrong";
export type LineKind = "charge" | "tax" | "total";
export type CheckedLine = { label: string; amount: number; kind: LineKind; flag: Flag; reason: string };

export type BillCheck = {
  lines: CheckedLine[];
  promisedPrice: number | null;
  planAmount: number | null;
  planDifference: number | null;
  sumOfCharges: number;
  gst: number;
  computedTotal: number;
  billTax: number | null;
  billTotal: number | null;
  expectedTotal: number | null;
  difference: number | null;
  unexplainedTotal: number;
  totalMismatch: boolean;
  warning: string | null;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
const isZero = (n: number) => Math.abs(n) < 0.005;
const money = (n: number) => `₹${n.toFixed(2)}`;

/** Pull the promised plan price (first rupee amount) out of the user's text. */
export function parsePromisedPrice(promise: string): number | null {
  const m = promise.replace(/,/g, "").match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  return Number(m[1] ?? m[2]);
}

const PLAN_WORDS = ["plan", "rental", "monthly", "subscription", "tariff"];
const looksLikePlan = (c: ChargeLine) => c.isPlan || PLAN_WORDS.some((w) => c.label.toLowerCase().includes(w));

function mentionedInPromise(label: string, promise: string): boolean {
  const p = promise.toLowerCase();
  const words = label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  return words.some((w) => p.includes(w) && !new RegExp(`${w}\\s+(off|disabled|no)`).test(p));
}

export function checkBill(extracted: Extracted, promise: string): BillCheck {
  const promisedPrice = parsePromisedPrice(promise);
  const charges = extracted.charges.filter((c) => Number.isFinite(c.amount) && !isZero(c.amount));
  const taxes = extracted.taxes.filter((t) => Number.isFinite(t.amount) && !isZero(t.amount));

  const sumOfCharges = round2(charges.reduce((s, l) => s + l.amount, 0));
  const gst = round2(sumOfCharges * GST_RATE);
  const computedTotal = round2(sumOfCharges + gst);
  const billTax = taxes.length ? round2(taxes.reduce((s, l) => s + l.amount, 0)) : null;
  const billTotal =
    extracted.statedTotal !== null && Number.isFinite(extracted.statedTotal) && !isZero(extracted.statedTotal)
      ? round2(extracted.statedTotal)
      : null;
  const expectedTotal = promisedPrice !== null ? round2(promisedPrice * (1 + GST_RATE)) : null;
  const difference = expectedTotal !== null ? round2((billTotal ?? computedTotal) - expectedTotal) : null;

  const taxMatches = billTax === null || Math.abs(billTax - gst) <= TOLERANCE;
  const totalMismatch = billTotal !== null && Math.abs(billTotal - computedTotal) > TOLERANCE;
  // Bill's own lines + its own tax add up to its total, but the tax isn't 18% → genuine tax error.
  const billInternallyConsistent =
    billTotal !== null && billTax !== null && Math.abs(billTotal - (sumOfCharges + billTax)) <= TOLERANCE;
  const taxWrong = !taxMatches && billInternallyConsistent;
  const warning = totalMismatch && !taxWrong ? "Lines may be missing or counted twice" : null;

  let planAmount: number | null = null;
  let planDifference: number | null = null;
  let planSeen = false;

  const lines: CheckedLine[] = charges.map((c) => {
    const base = { label: c.label, amount: c.amount, kind: "charge" as const };
    if (!planSeen && looksLikePlan(c)) {
      planSeen = true;
      planAmount = c.amount;
      if (promisedPrice === null) return { ...base, flag: "OK", reason: "Plan charge" };
      const diff = round2(c.amount - promisedPrice);
      planDifference = diff;
      return isZero(diff)
        ? { ...base, flag: "OK", reason: "Matches promised price" }
        : { ...base, flag: "Unexplained", reason: `${money(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than promised ${money(promisedPrice)}` };
    }
    if (promisedPrice !== null && Math.abs(c.amount - promisedPrice) < 0.005)
      return { ...base, flag: "OK", reason: "Matches promised price" };
    return mentionedInPromise(c.label, promise)
      ? { ...base, flag: "OK", reason: "Covered by your promise" }
      : { ...base, flag: "Unexplained", reason: "Not covered by what you were promised" };
  });

  for (const t of taxes) {
    lines.push({
      label: t.label, amount: t.amount, kind: "tax",
      ...(taxWrong
        ? { flag: "Wrong" as const, reason: `Tax should be ${money(gst)} (18% of ${money(sumOfCharges)})` }
        : taxMatches
          ? { flag: "OK" as const, reason: "Matches 18% GST" }
          : { flag: "Unexplained" as const, reason: "Doesn't match 18% GST — see warning" }),
    });
  }
  if (billTotal !== null) {
    lines.push({
      label: "Total on bill", amount: billTotal, kind: "total",
      ...(totalMismatch
        ? { flag: "Unexplained" as const, reason: `Code's total is ${money(computedTotal)}` }
        : { flag: "OK" as const, reason: "Adds up" }),
    });
  }

  // Extra amount for unexplained charges: full charge, or only the excess over the promised plan price.
  const unexplainedTotal = round2(
    lines
      .filter((l) => l.kind === "charge" && l.flag === "Unexplained")
      .reduce((s, l) => s + (l.amount === planAmount && planDifference !== null ? planDifference : l.amount), 0),
  );

  return {
    lines, promisedPrice, planAmount, planDifference, sumOfCharges, gst, computedTotal,
    billTax, billTotal, expectedTotal, difference, unexplainedTotal, totalMismatch, warning,
  };
}

/** Lines the complaint should mention: non-zero Unexplained/Wrong. */
export function complaintLines(c: BillCheck): CheckedLine[] {
  return c.lines.filter((l) => l.flag !== "OK" && !isZero(l.amount));
}

/** Every number the complaint message is allowed to contain. */
export function allowedNumbers(c: BillCheck): Set<string> {
  const nums = [
    c.promisedPrice, c.planAmount, c.planDifference, c.planDifference !== null ? Math.abs(c.planDifference) : null,
    c.sumOfCharges, c.gst, c.computedTotal, c.billTax, c.billTotal, c.expectedTotal, c.difference,
    c.difference !== null ? Math.abs(c.difference) : null, c.unexplainedTotal, 18, ...c.lines.map((l) => l.amount),
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

export const SIGN_OFF = "[Your name]";

export function ensureSignOff(message: string): string {
  const t = message.trim();
  return t.endsWith(SIGN_OFF) ? t : `${t}\n\n${SIGN_OFF}`;
}

export function templateMessage(c: BillCheck, promise: string): string {
  const flagged = complaintLines(c);
  const list = flagged.map((l) => `- ${l.label}: ${money(l.amount)} (${l.flag}: ${l.reason})`).join("\n");
  return `Dear Customer Care,

I was promised: "${promise}". My bill does not match this.

${flagged.length ? `Please explain the following charges:\n${list}\n\n` : ""}Sum of charges: ${money(c.sumOfCharges)}. GST at 18%: ${money(c.gst)}. ${c.billTotal !== null ? `Billed total: ${money(c.billTotal)}.` : `Calculated total: ${money(c.computedTotal)}.`}${c.difference !== null ? ` This is ${money(Math.abs(c.difference))} ${c.difference >= 0 ? "more" : "less"} than the expected ${money(c.expectedTotal!)}.` : ""}

Please provide:
- What each of these charges is for.
- The details behind them (e.g. the number called, date and time, and whether each call was incoming or outgoing).
- Confirmation of my current account settings (e.g. whether roaming and value-added services are off).
- A reversal of any charge applied in error.

Thank you,
${SIGN_OFF}`;
}
