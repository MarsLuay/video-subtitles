# Gate G1 — More-options subtitle menu chrome

## Identity and decision
- Status: PASS
- Gate kind: feature
- Prerequisite: G0 PASS
- Tested scope: menu model and overflow-button hit region
- In-scope claims: player overflow list is Download, Playback speed, Picture in picture, then Off and Import
- Unproven: live click on a running Obsidian window
- Scope decision for next gate: allowed

## Reproduction
- `npm test -- tests/menu-model.test.ts tests/video-file-types.test.ts`

## Result matrix
| Requirement / row | Baseline | Candidate | Correctness | Classification |
| --- | --- | --- | --- | --- |
| R1-more-options-menu | native Chromium overflow | Download / Playback speed / PiP then Off / Import | unit tests | PASS |
| Overflow hit | bottom-right control bar | steal only while controls visible | unit tests | PASS |
| Video extensions | Obsidian Ex | mp4/webm/ogv/mov/mkv | unit tests | PASS |

## Safety and rollback
- Native play/seek/volume stay. Disable plugin to restore native overflow.

## Final classification
- Verdict: PASS — player overflow 3-dot holds native actions plus Off and Import
- Next eligible gate: G2
