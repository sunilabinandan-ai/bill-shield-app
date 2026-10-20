import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SavedMessage } from "@/components/saved-message";
import { HowToGuide } from "@/components/how-to-guide";
import { supabase } from "@/integrations/supabase/client";
import { saveBill } from "@/lib/saved-bills.functions";
import { privateText } from "@/lib/saving-rules";
import { useQueryClient } from "@tanstack/react-query";
import { allClear, allClearMessage, checkBill, templateMessage, type BillCheck, type Extracted } from "@/lib/bill-math";
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
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<{ key: string; data: Extracted } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileKey = (f: File) => [f.name, f.size, f.lastModified].join("|");
  const mimeOf = (f: File) => f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : /\.png$/i.test(f.name) ? "image/png" : "image/jpeg");

  async function readBill(f: File): Promise<Extracted> {
    if (extracted && extracted.key === fileKey(f)) return extracted.data;
    if (f.size > 10 * 1024 * 1024) throw new Error("Choose a bill smaller than 10 MB.");
    const base64 = await toBase64(f);
    const data = await extract({ data: { fileName: f.name, mimeType: mimeOf(f), base64 } });
    setExtracted({ key: fileKey(f), data });
    if (data.provider) setProvider((p) => p.trim() ? p : data.provider ?? "");
    if (data.billPeriod) setBillPeriod((p) => p.trim() ? p : data.billPeriod ?? "");
    return data;
  }

  async function pickFile(f: File | null) {
    setFile(f); setCheck(null); setSaved(null); setMessage(""); setError(null);
    if (!f || !redacted) return;
    try { setStatus("Reading your bill… about 30 seconds"); await readBill(f); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't read the bill."); }
    finally { setStatus(null); }
  }
  const runKey = [file?.name, file?.size, file?.lastModified, provider, billPeriod, promise, focus].join("|");
  const alreadyChecked = !!check && lastRunKey === runKey;
  const showResults = () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  async function run() {
    if (!file || !redacted) return;
    if (alreadyChecked) { showResults(); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Choose a bill smaller than 10 MB."); return; }
    if (privateText(promise) !== promise || privateText(provider) !== provider || privateText(billPeriod) !== billPeriod || privateText(focus) !== focus) { setError("Remove phone numbers, account numbers and addresses from these fields."); return; }
    setSaved(null);
    setError(null);
    setCheck(null);
    setMessage("");
    try {
      setStatus("Reading your bill… about 30 seconds");
      const data = await readBill(file);
      if (!data.charges.length) throw new Error("No charges found on the bill.");
      const c = checkBill(data, promise, focus);
      setCheck(c);
      setLastRunKey(runKey);
      setStatus("Drafting your message…");
      const d = allClear(c)
        ? { message: allClearMessage(c), usedFallback: false }
        : c.totalMismatch
          ? { message: templateMessage(c, promise), usedFallback: true }
          : await draft({ data: { promise, focus, check: c } });
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
        const record = await save({ data: { provider: provider.trim() || data.provider || "Unknown", billPeriod: billPeriod || data.billPeriod || "", filePath, promise, focus, message: d.message, extracted: data } });
        setSaved(record); setMessage(privateText(d.message));
        setTimeout(showResults, 150);
        await cache.invalidateQueries({ queryKey: ["bills"] });
      } catch (error) { await supabase.storage.from("bills-private").remove([filePath]); throw error; }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setTimeout(showResults, 150);
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

      <HowToGuide collapsible />
      <section className="space-y-5 rounded-xl border bg-card p-6 shadow-soft">
        <div>
          <span className="text-sm font-medium">1. Upload your bill (photo, screenshot or PDF)</span>
          <label className="mt-2 flex items-start gap-3 text-sm"><input type="checkbox" checked={redacted} onChange={e => { setRedacted(e.target.checked); if (e.target.checked && file && !extracted) void pickFile(file); }} className="mt-1" />I have blacked out my name, phone number, account number and address.</label>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void pickFile(f); }}
            className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center text-sm transition ${dragging ? "border-primary bg-primary/5" : "bg-muted"} ${!redacted ? "opacity-60" : ""}`}
          >
            <span className="font-medium">{file ? file.name : "Drag and drop your bill here"}</span>
            <span className="mt-1 text-muted-foreground">{file ? "Click to choose a different file" : "or click to choose a file"}</span>
            {!redacted && <span className="mt-2 text-xs text-destructive">Tick the box above first.</span>}
            <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={!redacted} onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <label className="block text-sm">2. Company that sent the bill<span className="mt-1 block text-xs text-muted-foreground">Filled in from your bill. Change it if it's wrong.</span><input value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. Vi, Airtel, Axis Bank" className="mt-2 w-full rounded-md border bg-background px-4 py-3" /></label>
        <label className="block text-sm">3. Bill period (optional)<span className="mt-1 block text-xs text-muted-foreground">Filled in from your bill.</span><input value={billPeriod} onChange={e => setBillPeriod(e.target.value)} placeholder="e.g. 12 Aug – 11 Sep 2026" className="mt-2 w-full rounded-md border bg-background px-4 py-3" /></label>
        <label className="block">
          <span className="text-sm font-medium">4. What were you promised? (optional)</span>
          <span className="mt-1 block text-xs text-muted-foreground">Your plan price and what's included, e.g. "₹749 plan, roaming off". Leave empty for a card statement.</span>
          <input
            value={promise}
            onChange={(e) => setPromise(e.target.value)}
            placeholder="₹749 plan, roaming off"
            className="mt-2 w-full rounded-lg border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">5. Which charge do you want to check? (optional)</span>
          <span className="mt-1 block text-xs text-muted-foreground">The name of the charge or shop, and the date if you know it.</span>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="Clayton charge on 1 July"
            className="mt-2 w-full rounded-lg border bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <Button
          onClick={run}
          disabled={!file || !redacted || !!status}
          className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {status ?? (alreadyChecked ? "Checked ✓ — see results below" : "Check my bill")}
        </Button>
        {status && (
          <div role="status" className="flex items-center gap-3 rounded-lg border bg-muted px-4 py-3 text-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {status} Please keep this page open.
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {check && !status && (
          <button type="button" onClick={showResults} className="w-full rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
            ✓ Done. Your results and draft message are below ↓
          </button>
        )}
      </section>

      <div ref={resultsRef} className="scroll-mt-4" />
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

          {message && allClear(check) && (
            <section className="mt-6 rounded-xl border border-ok-strong/30 bg-ok p-6 text-ok-foreground shadow-soft">
              <h2 className="mb-2 font-display text-lg font-semibold">✓ Every line checks out</h2>
              <p className="text-sm">{message}</p>
              <p className="mt-2 text-xs opacity-80">No complaint needed, so none was drafted.</p>
            </section>
          )}
          {message && saved && !allClear(check) && <SavedMessage key={saved.messageId} id={saved.messageId} draft={message} sent={false} />}
          {message && !saved && !status && !allClear(check) && (
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
