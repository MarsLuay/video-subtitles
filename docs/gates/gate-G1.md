# Gate G1 — More-options subtitle menu chrome

## Identity and decision
- Status: PASS
- Gate kind: feature
- Prerequisite: G0 PASS
- Tested scope: menu model and Obsidian video extension list
- In-scope claims: empty menu is Off + Import; overlay replaces native overflow clicks
- Unproven: live click on a running Obsidian window
- Scope decision for next gate: allowed

## Reproduction
- `npm test -- tests/menu-model.test.ts tests/video-file-types.test.ts`

## Result matrix
| Requirement / row | Baseline | Candidate | Correctness | Classification |
| --- | --- | --- | --- | --- |
| R1-more-options-menu | native Chromium overflow only | Off then Import with no tracks | unit tests | PASS |
| Video extensions | Obsidian Ex | mp4/webm/ogv/mov/mkv | unit tests | PASS |

## Safety and rollback
- Native play/seek/volume stay. Disable plugin to restore native overflow.

## Final classification
- Verdict: PASS — more-options subtitle chrome is Off and Import
- Next eligible gate: G2
