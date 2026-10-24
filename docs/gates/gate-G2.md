# Gate G2 — Import and overlay captions

## Identity and decision
- Status: PASS
- Gate kind: feature
- Prerequisite: G1 PASS
- Tested scope: SRT/VTT parse, cue windows, imported menu label
- Unproven: OS file-picker click in a live Obsidian window
- Scope decision for next gate: allowed

## Reproduction
- `npm test -- tests/parse-subtitle.test.ts tests/caption-overlay.test.ts tests/menu-model.test.ts`

## Result matrix
| Requirement / row | Baseline | Candidate | Correctness | Classification |
| --- | --- | --- | --- | --- |
| R2-import-and-show | no cues | SRT/VTT cues + lecture menu row | fixtures | PASS |

## Safety and rollback
- This gate does not rewrite video bytes.

## Final classification
- Verdict: PASS — imported tracks list and overlay by time
- Next eligible gate: G3
