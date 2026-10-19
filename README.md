# Bill Shield App

Build a simple web app called BillShield.

Flow (one screen):

User uploads a phone/utility bill (image or PDF).

User types what they were promised in one box (e.g. “₹749 plan, roaming off”).

Click “Check my bill”.

Show every line on the bill in a table: label, amount, and a flag (OK / Unexplained / Wrong).

Show the maths: sum of lines, tax, total, and the difference from the promised price.

Show a draft complaint message in an editable text box, with a “Copy” button.

Strict rules:

AI only does two things: (a) read the bill image into a list of lines with label and amount, as JSON; (b) write the message.

All maths (totals, 18% GST, difference from promise) is done in code, never by AI.

The message must only use numbers that code calculated.

Any line not covered by the promise is flagged “Unexplained”. Only flag “Wrong” if the maths doesn’t add up.

The message asks the company for evidence: what the charge is for, details behind it (e.g. the number and whether a call was incoming or outgoing), confirmation of the user’s settings, and a reversal if it was applied in error.

Keep the AI key on the server, never in the browser.

Clean, simple design. No login yet.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bill-shield-app.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aa36c9c8-3992-444b-ad1d-4bb444b9c146).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
