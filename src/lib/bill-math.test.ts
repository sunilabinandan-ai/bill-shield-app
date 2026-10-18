import { describe, expect, it } from "vitest";
import { checkBill, foreignNumbers, parsePromisedPrice } from "./bill-math";

const promise = "₹749 plan, roaming off";

describe("bill maths", () => {
  it("parses promised price", () => expect(parsePromisedPrice(promise)).toBe(749));

  it("computes 18% GST and difference from promise", () => {
    const c = checkBill(
      [
        { label: "Monthly plan", amount: 749, kind: "charge" },
        { label: "Roaming calls", amount: 120, kind: "charge" },
        { label: "GST", amount: 156.42, kind: "tax" },
        { label: "Total payable", amount: 1025.42, kind: "total" },
      ],
      promise,
    );
    expect(c.sumOfCharges).toBe(869);
    expect(c.gst).toBe(156.42);
    expect(c.expectedTotal).toBe(883.82);
    expect(c.difference).toBe(141.6);
    expect(c.lines.map((l) => l.flag)).toEqual(["OK", "Unexplained", "OK", "OK"]);
  });

  it("flags Wrong only when maths doesn't add up", () => {
    const c = checkBill(
      [
        { label: "Monthly plan", amount: 749, kind: "charge" },
        { label: "GST", amount: 200, kind: "tax" },
        { label: "Total", amount: 1100, kind: "total" },
      ],
      promise,
    );
    expect(c.lines.map((l) => l.flag)).toEqual(["OK", "Wrong", "Wrong"]);
  });

  it("detects numbers not calculated by code", () => {
    const c = checkBill([{ label: "Monthly plan", amount: 749, kind: "charge" }], promise);
    expect(foreignNumbers("You charged ₹749 plus ₹999", c)).toEqual(["999"]);
  });
});
