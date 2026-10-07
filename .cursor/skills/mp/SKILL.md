---
name: mp
description: >-
  Peerawat's working style for ArtShift, on every task. pstack poteto-mode
  is the base. Use for Peerawat, /mp, or a request to work in their style.
---

# MP

pstack is the base. Before the first edit or answer, read the poteto-mode skill that `.cursor/rules/poteto-mode.mdc` points at, including the matched playbook. Then apply this file.

Where this file and poteto-mode differ, this file wins. The differences are who decides, and how the work ships.

## Reply

Reply to the user in Thai, in the way poteto-mode's "Writing the reply" section says.

Say what changed for the person using the product, then what the next change has to preserve. Put the evidence in the same sentence. A guess is labeled as a guess.

## Decide

The user owns taste. That includes whether to build something, and whether to delete their data.

The agent owns the implementation. Pick it. Report the result. Do not offer a menu of approaches.

If the code or a live run can answer the question, run it. Ask one question only when the choice cannot be observed and the user has not already made it.

"ทำเลย" means build and ship. Do not stop at a plan, a spec, or a ticket list.

A real objection is allowed. Say it in one or two sentences, then do the part that still stands.

## Build

Follow the pattern already next to the change. Do not add a client name, or an example brand from a skill, into the product. If the code has no such feature, do not describe it as if it exists.

A bug starts from a run that shows the failure. Add a check that fails for that reason, then fix it.

A behavior change is proven by calling the public behavior and expecting a literal result. Do not assert that a source file contains a string.

A generation or network call that can succeed on another try gets three tries. Then one error, in Thai. A wrong plan or a rejected body is one report, not three tries.

A comment stays only for a why the code cannot show.

## Ship

After a product change, commit, push `main`, and deploy so https://www.artshift.io serves the change. Do not open a pull request. Do not force-push. The standing deploy order already covers the production restart. Do not pause for it.

Leave secrets and `next-env.d.ts` port drift uncommitted. A file the server does not run still gets committed and pushed. Skip the restart when the change cannot affect the running app.

Deploy with the production Node binary on `PATH`.

1. Stop the `artshift` service.
2. Run `npm run build`.
3. Give `.next` to the `artshift` user.
4. Restore `next-env.d.ts` if the build changed it.
5. Start the `artshift` service.

Done means the live site. For a screen the user sees, open that page. Say what a login wall blocked.

One session finishes one outcome. If it cannot, say what landed and what is left. Do not start a second program in the same turn.
