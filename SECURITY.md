# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities through GitHub's private vulnerability reporting for this repository. Do not open a public issue for a vulnerability, leaked credential, or report containing personal career data.

Include the affected version or commit, reproduction steps, impact, and any suggested mitigation. Reports will be acknowledged as soon as practical, but this project does not currently promise a fixed response SLA.

## Supported versions

RoleTailor is currently pre-1.0. Security fixes target the latest release and the current `main` branch; older builds may not receive backports.

## Privacy boundary

RoleTailor stores profiles, generated CV workspaces, run history, and its SQLite database in the operating system's local application-data directory. Those files must never be attached to public issues without redacting personal information.
