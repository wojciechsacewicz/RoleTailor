# Job Radar architecture

Job Radar is a local-first source aggregation layer inside RoleTailor.

## Sources

- Just Join IT and RocketJobs use their current candidate-facing JSON feeds.
- Pracuj.pl and TheProtocol parse the structured `__NEXT_DATA__` payload already
  shipped to their listing pages.
- No Fluff Jobs discovers listing links and reuses RoleTailor's existing
  `JobPosting`/HTML extractor for details.
- freehire supplies startup and direct-ATS coverage through its public agent API.

A source failure is isolated and reported in the UI. `403`, `429`, timeouts and
server errors never prove that a job is dead.

## Lifecycle

Search results are normalized and deduplicated before being cached in the local
`roletailor.sqlite3` database. Clicking **Tailor CV** first re-fetches the
original posting. A definitive `404`, `410`, or expiry phrase marks it expired;
blocked or ambiguous responses remain uncertain.

## Ranking

The deterministic score prioritises remote work, early-career wording, overlap
with the saved RoleTailor target roles and skills, AI/product/full-stack work,
and a published salary that improves on the current IDEGO path. Two-year
experience requirements are treated as a stretch rather than an automatic
rejection; explicit senior/lead/staff roles and four-plus-year requirements are
penalised heavily.

The score is a triage heuristic, not a promise of an interview.
