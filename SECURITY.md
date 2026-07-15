# Security policy

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** action when it is available in the repository's Security tab. If the private channel is not enabled yet, open a minimal public issue asking the maintainer to enable private reporting; do not include vulnerability details, leaked credentials, or personal career data in that issue.

Include the affected version or commit, reproduction steps, impact, and any suggested mitigation. Reports will be acknowledged as soon as practical, but this project does not currently promise a fixed response SLA.

## Supported versions

RoleTailor is currently pre-1.0. Security fixes target the latest release and the current `main` branch; older builds may not receive backports.

## Privacy boundary

RoleTailor stores profiles, generated CV workspaces, run history, and its SQLite database in the operating system's local application-data directory. Those files must never be attached to public issues without redacting personal information.
