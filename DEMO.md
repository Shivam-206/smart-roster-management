# 3–5 Minute Demonstration Plan

Use a configured development environment and existing roster data. Do not run the seed script or generate a duplicate roster during the demo. If the chosen month has no saved roster, select a month that does before recording/presenting.

| Time | Show | Brief narration |
|---|---|---|
| 0:00–0:25 | Sign in, then dashboard | Sign in with a prepared administrator or manager account. “Application APIs require a session; administrator-only account controls are role-protected on the backend.” |
| 0:25–1:00 | Employees, pods, brands, processes, assignments | Show employee code/name and pod, brand/process relationships, and PRIMARY/SECONDARY_BACKUP/FLOAT distinctions. “A backup is eligible, not automatically scheduled; employees can support multiple processes.” |
| 1:00–1:35 | Availability & Rules tabs | Show weekly offs, leaves/comp-offs, holidays, and process calendar/staffing rules. “These are persisted rules consumed by the backend calendar and scheduling logic.” |
| 1:35–2:10 | Monthly roster generation screen | Select a month with no existing roster only if a safe demo database is being used; otherwise show a previously saved generation result. Explain duplicate-month protection, working/non-working status, and coverage conflicts without changing shared data. |
| 2:10–3:10 | Five saved-roster views | Switch Company, Pod, Brand, Process, and Employee views. Point out dates/statuses; on process view compare required versus actual staffing and show a conflict if present. |
| 3:10–4:20 | Manual roster management | On a disposable/demo roster, open an assignment edit, show eligible replacement ordering and validation, then save an intentional edit or explain the explicit fill/remove actions. Revalidate and point to active/resolved conflicts. Do not modify real operational records without permission. |
| 4:20–4:40 | Wrap-up | “Generation is backend-driven; edits remain manager-controlled; revalidation reports current issues and suggestions but never replaces employees automatically.” Mention authentication is required before public deployment. |

If existing generated data does not contain a useful conflict or vacancy, do not manufacture one in a shared database. Demonstrate the empty/normal state and explain how conflicts are surfaced using the actual saved data.
