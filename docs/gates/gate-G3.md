# Gate G3 — Absorb tracks into the video file

## Identity and decision
- Status: PASS
- Gate kind: feature
- Prerequisite: G2 PASS
- Tested scope: ISO-BMFF uuid round-trip, WebM trailer round-trip, empty-store no rewrite, original buffer unchanged
- Unproven: other players rendering the custom store (explicitly out of claim)
- Scope decision for next gate: allowed

## Reproduction
- `npm test -- tests/absorb.test.ts`

## Result matrix
| Requirement / row | Baseline | Candidate | Correctness | Classification |
| --- | --- | --- | --- | --- |
| ISO-BMFF uuid | ftyp+free | appended uuid store | round-trip, original prefix kept | PASS |
| Trailer | EBML header | VSBT footer | round-trip and strip | PASS |
| Empty store | original bytes | unchanged | equality | PASS |

## Safety and rollback
- Failed `modifyBinary` restores the original buffer
- No ffmpeg; no sidecar

## Final classification
- Verdict: PASS — tracks restore from written video bytes
- Next eligible gate: G4
