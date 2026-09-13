---
name: client-status
description: Shows the Blueprint status and pipeline steps for Al-Marketer proposal clients. Use when the user asks where a client/proposal stands.
---

# Client status

Run:
```
node pipeline/cli.js list
```
or for one client:
```
node pipeline/cli.js status <slug>
```
Explain the result in plain language: the Blueprint status, what finished, and what the team needs to do next (answer questions, Gate 1, Gate 2, Gate 3, mark as sent). Point to the Control Center (double-click "Al-Marketer Control Center.cmd") for gates.
