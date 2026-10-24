# Gate G4 — Vault registration and docs

## Identity and decision
- Status: PASS
- Gate kind: release
- Prerequisite: G3 PASS
- Tested scope: full suite, MarsLuay origin, vault registry, community plugin enablement
- Scope decision for next gate: none; product path is complete

## Reproduction
- `npm test && npm run lint && npx tsc --noEmit && npm run build`
- `git remote -v` → `https://github.com/MarsLuay/video-subtitles.git`
- Registry path `.Projects/video-subtitles`
- `.obsidian/community-plugins.json` contains `video-subtitles`

## Result matrix
| Requirement / row | Baseline | Candidate | Correctness | Classification |
| --- | --- | --- | --- | --- |
| R4-vault-and-docs | unregistered | owned repo + enabled plugin | 18 tests, lint, build, classifyDirectProject allowed | PASS |

## Safety and rollback
- Obsidian must be reloaded by the user to load the new plugin
- Disable **Video Subtitles** to restore the native player

## Final classification
- Verdict: PASS — project is registered, documented, and enabled in this vault
- Next eligible gate: none
