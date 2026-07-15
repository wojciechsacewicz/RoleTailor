# Contributing

RoleTailor is a local-first Tauri application. Contributions should preserve its core boundary: career data comes from the user at runtime and never from repository fixtures, developer home directories, or committed generated artifacts.

## Development setup

Install the prerequisites listed in `README.md`, then run:

```bash
npm install
npm run tauri:dev
```

Before submitting a change, run:

```bash
npm run build
npm run lint
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

UI changes should also be exercised in the running app. Changes to onboarding, profile persistence, templates, PDF generation, filesystem boundaries, or Codex prompts should include focused regression coverage.

## Data and fixtures

- Use fictional names and `example.com` addresses in tests and screenshots.
- Do not commit real CVs, portraits, job applications, database files, exports, tokens, local absolute paths, or generated PDFs.
- Keep secrets in ignored environment files and document only variable names in `.env.example` when needed.
- Treat job listings, imported writing profiles, attachments, and editor-generated HTML as untrusted input.

By contributing, you confirm that you have the right to submit the code. The project license is intentionally still pending an explicit maintainer decision; contributions should not assume a specific open-source license until one is added.
