import { describe, expect, it } from "vitest";
import { checkBill, complaintLines, foreignNumbers, parsePromisedPrice, templateMessage } from "./bill-math";

describe("Neeraj's Vi bill (golden pair 1) is unchanged", () => {
  const c = checkBill(
    {
      docType: "bill", currency: "₹",
      charges: [
        { label: "One Time Charges", amount: 0, isPlan: false },
        { label: "Monthly Charges", amount: 751, isPlan: true },
        { label: "Usage Charges", amount: 0, isPlan: false },
        { label: "International Roaming Service Charges", amount: 70, isPlan: false },
      ],
      taxes: [{ label: "State GST @ 9.00%", amount: 73.89 }, { label: "Central GST @ 9.00%", amount: 73.89 }],
      statedTotal: 968.78,
    },
    "₹749 plan, unlimited data, roaming off",
  );
  it("does the same maths", () => {
    expect(c.sumOfCharges).toBe(821);
    expect(c.gst).toBe(147.78);
    expect(c.computedTotal).toBe(968.78);
    expect(c.planDifference).toBe(2);
    expect(c.difference).toBe(84.96);
    expect(c.warning).toBeNull();
    expect(c.lines.map((l) => `${l.label}:${l.flag}`)).toEqual([
      "Monthly Charges:Unexplained",
      "International Roaming Service Charges:Unexplained",
      "State GST @ 9.00%:OK",
      "Central GST @ 9.00%:OK",
      "Total on bill:OK",
    ]);
  });
  it("template uses ₹ and GST", () => {
    const m = templateMessage(c, "₹749 plan, unlimited data, roaming off");
    expect(m).toContain("₹70.00");
    expect(m).toContain("GST at 18%");
    expect(foreignNumbers(m, c)).toEqual([]);
  });
});

describe("US card statement (classmate test)", () => {
  const charges = [
    ["19 Jun – TST* ALDAAR, WILDWOOD MO", 56.84], ["22 Jun – CUTTERS & CO, ST. LOUIS MO", 37], ["26 Jun – AMAZON MARKETPLACE, WA", 385.75],
    ["26 Jun – STL TOASTED, SAINT LOUIS MO", 31.35], ["27 Jun – AMAZON MARKETPLACE, WA", 9.65], ["29 Jun – TST* CASA JUAREZ, MARYLAND HEIGHT MO", 71.31],
    ["29 Jun – WESTLAKE HARDWARE, MARYLAND HEIG MO", 7.57], ["30 Jun – Southwest Airlines, DALLAS TX", 318.4], ["01 Jul – VSI*CENTER OF CLAYTON, CLAYTON MO", 78],
    ["07 Jul – AIRALO, AMSTERDAM NL", 29], ["10 Jul – Southwest Airlines, DALLAS TX", 49], ["11 Jul – JO MALONE CENTURY CITY, LOS ANGELES CA", 442.32],
    ["12 Jul – GOOGLE *YOUTUBE, CA", 9.91], ["12 Jul – AIRBNB, SAN FRANCISCO CA", 190], ["14 Jul – MARCUS THEATRES, MILWAUKEE WI", 9.72],
  ].map(([label, amount]) => ({ label: label as string, amount: amount as number, isPlan: false }));
  const ex = { docType: "card_statement" as const, currency: "$", charges, taxes: [], statedTotal: 1725.82 };

  it("adds no tax and matches the statement total", () => {
    const c = checkBill(ex, "Nothing", "");
    expect(c.hasTax).toBe(false);
    expect(c.gst).toBe(0);
    expect(c.computedTotal).toBe(1725.82);
    expect(c.warning).toBeNull();
    expect(c.currency).toBe("$");
    expect(c.promisedPrice).toBeNull();
    expect(complaintLines(c)).toEqual([]);
  });

  it("flags only the Clayton charge on 1 July", () => {
    const c = checkBill(ex, "", "I wanted to check the bill for Clayton on 1st July");
    expect(complaintLines(c).map((l) => l.label)).toEqual(["01 Jul – VSI*CENTER OF CLAYTON, CLAYTON MO"]);
    const m = templateMessage(c, "");
    expect(m).toContain("$78.00");
    expect(m).not.toContain("GST");
    expect(m).not.toContain("₹");
    expect(foreignNumbers(m, c)).toEqual([]);
  });

  it("date narrows a merchant with several charges", () => {
    const c = checkBill(ex, "", "Southwest on July 10");
    expect(complaintLines(c).map((l) => l.amount)).toEqual([49]);
  });
});

describe("promised price parsing ignores dates", () => {
  it("1st July is not a price", () => expect(parsePromisedPrice("Clayton on 1st July")).toBeNull());
  it("749 plan still parses", () => expect(parsePromisedPrice("749 plan, unlimited data")).toBe(749));
  it("$ works", () => expect(parsePromisedPrice("$45 plan")).toBe(45));
});
