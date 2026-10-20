/** Short, simple how-to. Each step comes from something a tester got stuck on. */
const STEPS = [
  "Sign up with your email. If we send you an email, check Spam too.",
  "Take a photo or screenshot of your bill. Black out your name, phone number, account number and address.",
  "Type the company name (like Vi or Airtel), not the shop.",
  "Type what you were promised, like \"₹749 plan, roaming off\". For a card bill, leave it empty.",
  "Optional: type the one charge you want to check, like \"Clayton, 1 July\".",
  "Click \"Check my bill\" once. Wait about 30 seconds. Your results show below.",
  "If something looks wrong, copy the message, add your name, and send it to the company.",
];

export function HowToGuide({ collapsible = false }: { collapsible?: boolean }) {
  const list = (
    <ol className="mt-3 space-y-2 text-sm">
      {STEPS.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
          <span className="pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
  if (collapsible)
    return (
      <details className="mb-6 rounded-xl border bg-card p-4 shadow-soft">
        <summary className="cursor-pointer text-sm font-medium">How to use (7 steps)</summary>
        {list}
      </details>
    );
  return (
    <section className="mt-10 rounded-xl border bg-card p-5 shadow-soft">
      <h2 className="font-display text-lg font-semibold">How to use</h2>
      {list}
    </section>
  );
}
