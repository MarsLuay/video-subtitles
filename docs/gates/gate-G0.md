# Gate G0 — Owned plugin scaffold

## Identity and decision
- Status: PASS
- Gate kind: foundation
- Target repository / baseline commit / tested commit: `.Projects/video-subtitles` new main
- Gate requirement IDs / phase IDs / prerequisite gate reports: R0-plugin-loads, P0-scaffold, none
- Tested scope: package, TypeScript, eslint, vitest, production esbuild deploy
- In-scope claims: plugin id `video-subtitles` builds and deploys into this vault
- Scope decision for next gate: allowed

## Entry / prerequisites
- Verified applicable entry criteria: vault on main, MarsLuay GitHub auth, explicit project name
- Missing/uncertain facts: none
- Hardware/API skip rows: none

## Reproduction
- `npm test && npm run lint && npx tsc --noEmit && npm run build`
- Deploy path: `.obsidian/plugins/video-subtitles/`

## Result matrix
| Requirement / row | Baseline | Candidate | Correctness | Impact | Confidence | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| R0-plugin-loads | no project | owned plugin scaffold | 17 tests, lint, tsc, build deploy | none | high | PASS |

## Safety and rollback
- Native Obsidian video path unchanged until the plugin is enabled
- Rollback: delete the project folder and GitHub repo

## Final classification
- Verdict: PASS — compiling plugin `video-subtitles` deploys `main.js` and `manifest.json`
- Next eligible gate: G1
