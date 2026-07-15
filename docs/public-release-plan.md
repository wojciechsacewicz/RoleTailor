# Public release plan

This plan separates application generalisation from the irreversible act of publishing history. A repository is not safe to make public until every gate in Phase 4 passes against a fresh clone.

## Phase 1 — Remove personal runtime assumptions

- [x] Replace repository selection with a structured profile collected during onboarding.
- [x] Persist the profile in the operating system's application-data directory.
- [x] Generate the Base CV, career vault, writing guidance, and editable HTML from confirmed user data.
- [x] Replace the machine-specific writing skill with user-owned tone and writing notes.
- [x] Make the profile photo optional and resolve generated asset names dynamically.
- [x] Keep each application run isolated from the Base CV.

Exit gate: a fresh clone can reach a usable Base CV without any private CV repository, personal skill, home-directory path, or pre-existing profile asset.

## Phase 2 — Neutralise the tracked source tree

- [x] Replace the personal CV package with fictional/placeholder-free neutral templates.
- [x] Remove source CV PDFs, portraits, generated CVs, recruiter messages, and private career notes from the current tree.
- [x] Remove personal package identifiers and demo paths.
- [x] Ignore local profile stores, exports, databases, environment files, generated PDFs, and private migration backups.
- [ ] Choose a public license and add `LICENSE`; this is an ownership decision and should be explicit.
- [x] Add contribution and private security-reporting policies without publishing personal contact details.

Exit gate: a scan of tracked files reports no real contact details, portraits, CVs, employer history, private paths, tokens, or application outputs.

## Phase 3 — Distribution hardening

- [x] Bundle the neutral template, fonts, schema, and Chromium-based PDF renderer as application resources instead of relying on a source checkout at runtime.
- [ ] Add signed release artifacts and a documented update channel.
- [ ] Test onboarding, profile regeneration, PDF output, and upgrades on clean Linux installations.
- [ ] Define schema-versioned profile migrations before changing the stored profile format.
- [ ] Add export, backup, and delete-my-local-data controls.

Exit gate: an installed release can complete onboarding and create a PDF without a developer checkout or globally installed JavaScript dependencies.

## Phase 4 — Create publishable history

- [ ] Replace the existing history with one reviewed clean-root snapshot and a noreply author.
- [ ] Remove legacy local and remote-tracking refs, expire reflogs, prune unreachable objects, and verify the object database.
- [ ] Run secret, PII, path, binary-artifact, and author scans against every remaining ref and the working tree.
- [ ] Clone the candidate repository into an empty directory and run the complete verification suite there.
- [ ] Inspect release archives and generated bundles for unintended local files.
- [ ] Obtain a final independent review of the clean candidate.
- [ ] Create a fresh empty remote or explicitly purge the old private remote before changing visibility.

Exit gate: the fresh public candidate contains only intended source, neutral fixtures, public metadata, and reviewed history.

## Deferred product decisions

- License and governance model.
- Supported operating systems beyond Linux.
- Whether profile import from PDF should retain the original file or delete it after user confirmation.
- Whether the app remains Codex-only or introduces additional local/model providers.
- Whether public releases include automated updates and crash reporting; both need an explicit privacy design.
