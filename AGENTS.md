<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- All bill maths and flagging lives in src/lib/bill-math.ts (tested); AI only extracts lines and writes prose, and AI messages containing numbers not computed by code fall back to a code template — keeps numbers trustworthy.
- Account-only pages live under the client-only authenticated layout, with authenticated server functions for AI and mutations; this protects both pages and endpoints.
- Save checks through the owner-scoped transactional save_bill_check RPC; this prevents partially saved bill histories without adding extra tables.
- Count word changes with word-level edit distance in saving-rules.ts; insertions, deletions and substitutions each count once.
- Require pre-redacted uploads, use random private object names, and sanitize saved text; raw documents cannot be reliably stripped of personal data automatically.
