# Eval cases (AI-00)

One JSON object per line: `{ "id", "input", "checks" }`.

- `input` matches the request body the legacy function accepted, so the same case can run against the old function and the new module.
- `checks` are plain-language criteria taken from each prompt's own rules. AI-04 turns them into rubric scores.

Every case is synthetic. There are no real student, teacher or school names, and the student writing and scripts were written for this set. Keep it that way (README rule: no real student data in eval sets).

| File                       | Cases | Notes                                                                |
| -------------------------- | ----- | -------------------------------------------------------------------- |
| `lesson-classroom.jsonl`   | 24    | NERDC, NaCCA and CBC; every teaching style; some with objectives     |
| `lesson-online.jsonl`      | 20    | Zoom, Meet, Teams, Classroom; ages 6 to 18                           |
| `quiz.jsonl`               | 20    | Short synthetic lesson texts across subjects                         |
| `resource-worksheet.jsonl` | 20    | Nursery to university; some with "Extra details"                     |
| `resource-slides.jsonl`    | 20    | Same topics; some with teacher notes                                 |
| `resource-rubric.jsonl`    | 20    | Same topics                                                          |
| `resource-video.jsonl`     | 20    | Same topics                                                          |
| `lesson-images.jsonl`      | 20    | Subject and topic pairs from the lesson cases                        |
| `slide-images.jsonl`       | 20    | One image prompt each; slide and worksheet styles                    |
| `assess-writing.jsonl`     | 20    | Primary to Form 4; strong, average and weak writing                  |
| `assess-script.jsonl`      | 20    | With and without marking schemes; right, partly right and wrong work |

`assess-batch` uses the same marker as `assess-script`, so it reuses `assess-script.jsonl` (one batch of 20 items).

Not covered yet:

- `ocr-handwriting` needs scanned pages of synthetic handwriting (images or PDFs). Someone on the team should handwrite 20 or so pages from the scripts above and scan them, including a few that are blank, blurred or upside down to test `UNREADABLE_UPLOAD`.
- `video-scene` has no prompt of its own; it is covered through `resource-video`.

Status: draft. A teacher should review the cases and the expected marks before AI-04 baselines against them.
