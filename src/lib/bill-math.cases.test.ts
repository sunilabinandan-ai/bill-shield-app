import { describe, expect, it } from "vitest";
import { allClear, allClearMessage, checkBill, complaintLines, foreignNumbers, parsePromisedPrice, templateMessage } from "./bill-math";

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
    expect(m).toContain("CLAYTON MO: $78.00\n");
    expect(m).not.toContain("You asked");
    expect(m).not.toMatch(/credit|refund|revers/i);
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

describe("every line checks out (Shobhit's test)", () => {
  it("a correct bill gets no complaint", () => {
    const c = checkBill(
      { docType: "bill", currency: "₹", charges: [{ label: "Pro plan", amount: 1000, isPlan: true }], taxes: [{ label: "IGST @ 18%", amount: 180 }], statedTotal: 1180 },
      "₹1000 plan",
    );
    expect(allClear(c)).toBe(true);
    expect(allClearMessage(c)).toContain("Every line checks out");
    expect(allClearMessage(c)).toContain("₹1180.00");
  });
  it("Neeraj's bill is NOT all clear", () => {
    const c = checkBill(
      { docType: "bill", currency: "₹", charges: [{ label: "Monthly Charges", amount: 751, isPlan: true }], taxes: [{ label: "GST", amount: 135.18 }], statedTotal: 886.18 },
      "₹749 plan",
    );
    expect(allClear(c)).toBe(false);
  });
});

describe("Varun's Axis card statement (stranger test)", () => {
  const L = (label: string, amount: number) => ({ label, amount, isPlan: false });
  const charges = [
    L("20 Sep – EMI INTEREST - 2/3", 120), L("20 Sep – GST", 21.6), L("20 Sep – EMI PRINCIPAL - 2/3", 4485), L("25 Sep – NETFLIX, MUMBAI", 649),
    L("28 Sep – ADOBE SYSTEMS, GURUGRAM", 1516.3), L("01 Oct – GOOGLE PLAY, MUMBAI", 399), L("03 Oct – GOOGLE WORKSPACE, MUMBAI", 116.82),
    L("03 Oct – GOOGLE WORKSPACE, MUMBAI", 325.68), L("05 Oct – HDFC ERGO GIC, MUMBAI", 21718.79), L("08 Oct – ANTHROPIC* CLAUDE SUB", 2399),
    L("09 Oct – ANTHROPIC* CLAUDE SUB", 2284.72), L("10 Oct – DCC MARKUP", 83.97), L("10 Oct – GST", 15.12), L("11 Oct – GST", 14.4),
    L("11 Oct – FOREIGN CURRENCY TRANSACTION FEE", 79.97), L("12 Oct – RAZ*WIXCOM, BENGALURU", 330.4), L("13 Oct – YOUTUBE, MUMBAI", 299),
    L("16 Oct – AMAZON INDIA, MUMBAI", 199), L("17 Oct – M S PUTCHI NEXUS, COIMBATORE", 2878),
  ];
  const ex = { docType: "card_statement" as const, currency: "₹", charges, taxes: [], statedTotal: null,
    totalParts: [{ label: "Purchase", amount: 37600.71 }, { label: "Cash Advance", amount: 0 }, { label: "Other Debit & Charges", amount: 335.06 }] };
  it("code adds the summary parts and every line checks out", () => {
    const c = checkBill(ex, "", "");
    expect(c.billTotal).toBe(37935.77);
    expect(c.computedTotal).toBe(37935.77);
    expect(c.totalMismatch).toBe(false);
    expect(allClear(c)).toBe(true);
  });
  it("a real mismatch gets its own sentence, never 'Total on bill' as a transaction", () => {
    const c = checkBill({ ...ex, charges: charges.filter((l) => l.label !== "11 Oct – GST") }, "", "");
    expect(c.totalMismatch).toBe(true);
    expect(complaintLines(c).some((l) => l.label === "Total on bill")).toBe(false);
    const m = templateMessage(c, "");
    expect(m).toContain("a difference of ₹14.40");
    expect(m).not.toContain("- Total on bill");
    expect(foreignNumbers(m, c)).toEqual([]);
  });
});

describe("Varun's Axis statement: fees and GST count, code adds the summary parts", () => {
  const debits = [120, 21.6, 4485, 649, 1516.3, 399, 116.82, 325.68, 21718.79, 2399, 2284.72, 83.97, 15.12, 14.4, 79.97, 330.4, 299, 199, 2878];
  const charges = debits.map((amount, i) => ({ label: `line ${i}`, amount, isPlan: false }));
  const parts = [{ label: "Purchase", amount: 37600.71 }, { label: "Cash Advance", amount: 0 }, { label: "Other Debit & Charges", amount: 335.06 }];
  it("all 19 debits match purchase + other charges: no false ₹284 gap", () => {
    const c = checkBill({ docType: "card_statement", currency: "₹", charges, taxes: [], statedTotal: null, totalParts: parts }, "", "");
    expect(c.billTotal).toBe(37935.77);
    expect(c.computedTotal).toBe(37935.77);
    expect(c.totalMismatch).toBe(false);
    expect(allClear(c)).toBe(true);
  });
  it("a real mismatch is one sentence, never a 'transaction'", () => {
    const c = checkBill({ docType: "card_statement", currency: "₹", charges: charges.slice(1), taxes: [], statedTotal: null, totalParts: parts }, "", "");
    expect(c.totalMismatch).toBe(true);
    const m = templateMessage(c, "");
    expect(m).not.toMatch(/following transaction|Total on bill/);
    expect(m).toContain("a difference of ₹120.00");
    expect(foreignNumbers(m, c)).toEqual([]);
  });
});
