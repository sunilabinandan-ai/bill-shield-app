import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SavedMessage } from "@/components/saved-message";
import { supabase } from "@/integrations/supabase/client";
import { saveBill } from "@/lib/saved-bills.functions";
import { privateText } from "@/lib/saving-rules";
import { useQueryClient } from "@tanstack/react-query";
import { checkBill, type BillCheck } from "@/lib/bill-math";
import { draftComplaint, extractBill } from "@/lib/bill.functions";

export const Route = createFileRoute("/_authenticated/check")({
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

const fmt = (cur: string) => (n: number | null | undefined) => {
  const v = n ?? 0;
  const s = Math.abs(v).toLocaleString(cur === "₹" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}${cur}${s}`;
};

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
  const [focus, setFocus] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<BillCheck | null>(null);
  const [message, setMessage] = useState("");
  const save = useServerFn(saveBill);
  const cache = useQueryClient();
  const [provider, setProvider] = useState("");
  const [billPeriod, setBillPeriod] = useState("");
  const [redacted, setRedacted] = useState(false);
  const [saved, setSaved] = useState<{ billId: string; messageId: string } | null>(null);

  async function run() {
    if (!file || !(promise.trim() || focus.trim()) || !provider.trim() || !redacted) return;
    if (file.size > 10 * 1024 * 1024) { setError("Choose a bill smaller than 10 MB."); return; }
    if (privateText(promise) !== promise || privateText(provider) !== provider || privateText(billPeriod) !== billPeriod || privateText(focus) !== focus) { setError("Remove phone numbers, account numbers and addresses from these fields."); return; }
    setSaved(null);
    setError(null);
    setCheck(null);
    setMessage("");
    try {
      setStatus("Reading your bill…");
      const base64 = await toBase64(file);
      const mimeType = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.png$/i.test(file.name) ? "image/png" : "image/jpeg");
      const extracted = await extract({ data: { fileName: file.name, mimeType, base64 } });
      if (!extracted.charges.length) throw new Error("No charges found on the bill.");
      const c = checkBill(extracted, promise, focus);
      setCheck(c);
      setStatus("Drafting your message…");
      const d = await draft({ data: { promise, focus, check: c } });
      setMessage(privateText(d.message));
      setStatus("Saving your bill…");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Please sign in again.");
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
      const ext = isPdf ? "pdf" : isPng ? "png" : "jpg";
      const contentType = isPdf ? "application/pdf" : isPng ? "image/png" : "image/jpeg";
      const filePath = `${userData.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("bills-private").upload(filePath, file, { contentType, upsert: false });
      if (uploadError) {
        console.error("Bill upload failed", uploadError);
        throw new Error(`Your results are below, but the bill file could not be saved (${uploadError.message}). Try again on a computer or with a smaller file.`);
      }
      try {
        const record = await save({ data: { provider: provider.trim(), billPeriod, filePath, promise, focus, message: d.message, extracted } });
        setSaved(record); setMessage(privateText(d.message));
        await cache.invalidateQueries({ queryKey: ["bills"] });
      } catch (error) { await supabase.storage.from("bills-private").remove([filePath]); throw error; }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStatus(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-10">
        <h1 className="font-display text-4xl font-semibold ">
          Bill<span className="text-primary">Shield</span>
        </h1>
        <p className="mt-2 text-muted-foreground">Upload a bill or card statement, tell us what you were promised or which charge looks wrong, and see what doesn't add up.</p>
      </header>

      <section className="space-y-5 rounded-xl border bg-card p-6 shadow-soft">
        <label className="block text-sm">Provider<input required value={provider} onChange={e => setProvider(e.target.value)} placeholder="Vi" className="mt-2 w-full rounded-md border bg-background px-4 py-3" /></label>
        <label className="block text-sm">Bill period (optional)<input value={billPeriod} onChange={e => setBillPeriod(e.target.value)} placeholder="October 2026" className="mt-2 w-full rounded-md border bg-background px-4 py-3" /></label>
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
          <span className="mt-1 block text-xs text-muted-foreground">For a phone or utility bill. Leave blank for a card statement.</span>
          <input
            value={promise}
            onChange={(e) => setPromise(e.target.value)}
            placeholder="₹749 plan, roaming off"
            className="mt-2 w-full rounded-lg border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">3. Which charge do you want to question? (optional)</span>
          <span className="mt-1 block text-xs text-muted-foreground">Merchant or charge name, and the date if you know it.</span>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="Clayton charge on 1 July"
            className="mt-2 w-full rounded-lg border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={redacted} onChange={e => setRedacted(e.target.checked)} className="mt-1" />I have removed all phone numbers, account numbers and addresses from this file.</label>
        <Button
          onClick={run}
          disabled={!file || !(promise.trim() || focus.trim()) || !provider.trim() || !redacted || !!status}
          className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {status ?? "Check my bill"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      {check && (() => { const inr = fmt(check.currency || "₹"); return (
        <>
          {check.docType === "card_statement" && !check.lines.some((l) => l.flag !== "OK") && (
            <div className="mt-8 rounded-xl border bg-muted px-5 py-4 text-sm">
              This looks like a card statement. Type the charge you want to question in box 3 (e.g. "Clayton, 1 July") and check again.
            </div>
          )}
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
              {check.hasTax && (<><dt className="text-muted-foreground">GST (18%)</dt><dd className="text-right">{inr(check.gst)}</dd></>)}
              <dt className="text-muted-foreground">Calculated total</dt><dd className="text-right">{inr(check.computedTotal)}</dd>
              {check.billTotal != null && (<><dt className="text-muted-foreground">Total on bill</dt><dd className="text-right">{inr(check.billTotal)}</dd></>)}
              {check.planDifference != null && check.planDifference !== 0 && (<><dt className="text-muted-foreground">Plan line vs promised</dt><dd className="text-right text-destructive">{check.planDifference > 0 ? "+" : ""}{inr(check.planDifference)}</dd></>)}
              {check.billTax != null && (<><dt className="text-muted-foreground">Tax on bill</dt><dd className="text-right">{inr(check.billTax)}</dd></>)}
              {check.expectedTotal != null && (<><dt className="text-muted-foreground">Promised {inr(check.promisedPrice)}{check.hasTax ? " + GST" : ""}</dt><dd className="text-right">{inr(check.expectedTotal)}</dd></>)}
              {check.difference != null && (
                <>
                  <dt className="border-t pt-2 font-medium">Difference from promise</dt>
                  <dd className={`border-t pt-2 text-right font-semibold ${check.difference > 1 ? "text-destructive" : "text-ok-strong"}`}>
                    {check.difference > 0 ? "+" : ""}{inr(check.difference)}
                  </dd>
                </>
              )}
            </dl>
            {check.promisedPrice == null && check.docType !== "card_statement" && <p className="mt-3 text-xs text-muted-foreground">Add a price (e.g. ₹749) to your promise to see the difference.</p>}
          </section>

          {message && saved && <SavedMessage key={saved.messageId} id={saved.messageId} draft={message} sent={false} />}
          {message && !saved && !status && (
            <section className="mt-6 rounded-xl border bg-card p-6 shadow-soft">
              <h2 className="mb-2 font-display text-lg font-semibold">Draft message (not saved)</h2>
              <textarea readOnly value={message} rows={14} className="w-full rounded-md border bg-background p-3 text-sm" />
            </section>
          )}

        </>
      ); })()}
    </main>
  );
}
