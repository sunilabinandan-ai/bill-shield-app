import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { checkBill, type BillCheck } from "@/lib/bill-math";
import { draftComplaint, extractBill } from "@/lib/bill.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BillShield — Check your phone or utility bill" },
      { name: "description", content: "Upload your bill, say what you were promised, and get unexplained charges flagged with a ready complaint." },
      { property: "og:title", content: "BillShield" },
      { property: "og:description", content: "Catch unexplained bill charges and draft a complaint in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function Index() {
  const extract = useServerFn(extractBill);
  const draft = useServerFn(draftComplaint);
  const [file, setFile] = useState<File | null>(null);
  const [promise, setPromise] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<BillCheck | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!file || !promise.trim()) return;
    setError(null);
    setCheck(null);
    setMessage("");
    try {
      setStatus("Reading your bill…");
      const base64 = await toBase64(file);
      const extracted = await extract({ data: { fileName: file.name, mimeType: file.type, base64 } });
      if (!extracted.charges.length) throw new Error("No charges found on the bill.");
      const c = checkBill(extracted, promise);
      setCheck(c);
      setStatus("Drafting your message…");
      const d = await draft({ data: { promise, check: c } });
      setMessage(d.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStatus(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          Bill<span className="text-primary">Shield</span>
        </h1>
        <p className="mt-2 text-muted-foreground">Upload a bill, tell us what you were promised, and see what doesn't add up.</p>
      </header>

      <section className="space-y-5 rounded-xl border bg-card p-6 shadow-soft">
        <label className="block">
          <span className="text-sm font-medium">1. Your bill (image or PDF)</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full rounded-lg border border-dashed bg-muted p-4 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">2. What were you promised?</span>
          <input
            value={promise}
            onChange={(e) => setPromise(e.target.value)}
            placeholder="₹749 plan, roaming off"
            className="mt-2 w-full rounded-lg border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <button
          onClick={run}
          disabled={!file || !promise.trim() || !!status}
          className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {status ?? "Check my bill"}
        </button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      {check && (
        <>
          {check.warning && (
            <div className="mt-8 rounded-xl border border-warn-foreground/30 bg-warn px-5 py-4 text-sm text-warn-foreground">
              <strong>Warning:</strong> {check.warning}. Code's total is {inr(check.computedTotal)} but the bill says {inr(check.billTotal ?? 0)}.
            </div>
          )}
          <section className="mt-8 overflow-hidden rounded-xl border bg-card shadow-soft">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Line</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                {check.lines.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-3">
                      {l.label}
                      {l.flag !== "OK" && <div className="text-xs text-muted-foreground">{l.reason}</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(l.amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        title={l.reason}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          l.flag === "OK" ? "bg-ok text-ok-foreground" : l.flag === "Wrong" ? "bg-destructive text-destructive-foreground" : "bg-warn text-warn-foreground"
                        }`}
                      >
                        {l.flag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6 rounded-xl border bg-card p-6 shadow-soft">
            <h2 className="mb-4 font-display text-lg font-semibold">The maths</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm tabular-nums">
              <dt className="text-muted-foreground">Sum of charges</dt><dd className="text-right">{inr(check.sumOfCharges)}</dd>
              <dt className="text-muted-foreground">GST (18%)</dt><dd className="text-right">{inr(check.gst)}</dd>
              <dt className="text-muted-foreground">Calculated total</dt><dd className="text-right">{inr(check.computedTotal)}</dd>
              {check.billTotal !== null && (<><dt className="text-muted-foreground">Total on bill</dt><dd className="text-right">{inr(check.billTotal)}</dd></>)}
              {check.planDifference !== null && check.planDifference !== 0 && (<><dt className="text-muted-foreground">Plan line vs promised</dt><dd className="text-right text-destructive">{check.planDifference > 0 ? "+" : ""}{inr(check.planDifference)}</dd></>)}
              {check.billTax !== null && (<><dt className="text-muted-foreground">Tax on bill</dt><dd className="text-right">{inr(check.billTax)}</dd></>)}
              {check.expectedTotal !== null && (<><dt className="text-muted-foreground">Promised {inr(check.promisedPrice!)} + GST</dt><dd className="text-right">{inr(check.expectedTotal)}</dd></>)}
              {check.difference !== null && (
                <>
                  <dt className="border-t pt-2 font-medium">Difference from promise</dt>
                  <dd className={`border-t pt-2 text-right font-semibold ${check.difference > 1 ? "text-destructive" : "text-ok-strong"}`}>
                    {check.difference > 0 ? "+" : ""}{inr(check.difference)}
                  </dd>
                </>
              )}
            </dl>
            {check.promisedPrice === null && <p className="mt-3 text-xs text-muted-foreground">Add a price (e.g. ₹749) to your promise to see the difference.</p>}
          </section>

          {message && (
            <section className="mt-6 rounded-xl border bg-card p-6 shadow-soft">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Draft complaint</h2>
                <button
                  onClick={async () => { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={16} className="w-full rounded-lg border bg-background p-4 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring" />
            </section>
          )}
        </>
      )}
    </main>
  );
}
