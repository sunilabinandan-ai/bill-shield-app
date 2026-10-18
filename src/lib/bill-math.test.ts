import { describe, expect, it } from "vitest";
import { checkBill, complaintLines, ensureSignOff, foreignNumbers, parsePromisedPrice } from "./bill-math";

const promise = "₹749 plan, roaming off";

describe("bill maths", () => {
  it("parses promised price", () => expect(parsePromisedPrice(promise)).toBe(749));

  it("marks tax and total OK when they match within ₹1", () => {
    const c = checkBill(
      {
        charges: [
          { label: "Monthly plan", amount: 749, isPlan: true },
          { label: "Roaming calls", amount: 120, isPlan: false },
        ],
        taxes: [{ label: "CGST", amount: 78.21 }, { label: "SGST", amount: 78.21 }],
        statedTotal: 1025,
      },
      promise,
    );
    expect(c.sumOfCharges).toBe(869);
    expect(c.gst).toBe(156.42);
    expect(c.lines.map((l) => l.flag)).toEqual(["OK", "Unexplained", "OK", "OK", "OK"]);
    expect(c.warning).toBeNull();
  });

  it("hides ₹0.00 lines", () => {
    const c = checkBill(
      { charges: [{ label: "Monthly plan", amount: 749, isPlan: true }, { label: "SMS", amount: 0, isPlan: false }], taxes: [], statedTotal: null },
      promise,
    );
    expect(c.lines.map((l) => l.label)).toEqual(["Monthly plan"]);
  });

  it("flags plan ₹751 vs promised ₹749 as Unexplained with ₹2 difference", () => {
    const c = checkBill({ charges: [{ label: "Plan 749", amount: 751, isPlan: true }], taxes: [], statedTotal: null }, promise);
    expect(c.lines[0]?.flag).toBe("Unexplained");
    expect(c.planDifference).toBe(2);
  });

  it("warns instead of flagging tax Wrong when totals don't match", () => {
    const c = checkBill(
      { charges: [{ label: "Monthly plan", amount: 749, isPlan: true }], taxes: [{ label: "GST", amount: 200 }], statedTotal: 1500 },
      promise,
    );
    expect(c.warning).toBe("Lines may be missing or counted twice");
    expect(c.lines.some((l) => l.flag === "Wrong")).toBe(false);
  });

  it("flags tax Wrong when bill adds up but tax isn't 18%", () => {
    const c = checkBill(
      { charges: [{ label: "Monthly plan", amount: 749, isPlan: true }], taxes: [{ label: "GST", amount: 200 }], statedTotal: 949 },
      promise,
    );
    expect(c.lines.find((l) => l.kind === "tax")?.flag).toBe("Wrong");
  });

  it("complaint covers only non-OK lines and ends with [Your name]", () => {
    const c = checkBill(
      { charges: [{ label: "Monthly plan", amount: 749, isPlan: true }, { label: "VAS", amount: 30, isPlan: false }], taxes: [], statedTotal: null },
      promise,
    );
    expect(complaintLines(c).map((l) => l.label)).toEqual(["VAS"]);
    expect(ensureSignOff("Thanks").endsWith("[Your name]")).toBe(true);
  });

  it("detects numbers not calculated by code", () => {
    const c = checkBill({ charges: [{ label: "Monthly plan", amount: 749, isPlan: true }], taxes: [], statedTotal: null }, promise);
    expect(foreignNumbers("You charged ₹749 plus ₹999", c)).toEqual(["999"]);
  });
});
