/** Short, simple how-to. Each step comes from something a tester got stuck on. */
const STEPS = [
  "Sign up with your email. Check your inbox & spam folders for a verification email.",
  "Take a photo / screenshot of your bill. Black out name, phone number, account number & address.",
  "Enter the service provider's name from the bill.",
  "Enter what you were promised.",
  "Optional: enter any specific line item's charges you want to check.",
  "Click \u201cCheck my bill\u201d once. Wait about 30 seconds. Your results show below.",
  "If something looks wrong, copy the message, add your name, and send it to the company.",
  "Edit the message in the box as needed.",
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
        <summary className="cursor-pointer text-sm font-medium">How to use (8 steps)</summary>
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
