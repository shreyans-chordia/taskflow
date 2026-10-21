# Requirements

TaskFlow was specified up front in an IEEE 830-style Software Requirements Specification, and the code is traced back
to it: tests name the requirement they cover (for example `TASK-6 rejects an empty title`). This page is the
public catalogue of those IDs. Priority is the product priority of the feature: **H**igh, **M**edium or **L**ow.

## Task management (H)

| ID | Requirement |
| --- | --- |
| TASK-1 | Create a task with a title (required), description, categories, deadline and priority (defaults to the default level). |
| TASK-2 | List all of the user's tasks. |
| TASK-3 | View the full details of a task. |
| TASK-4 | Edit any field of a task. |
| TASK-5 | Delete a task after a confirmation. |
| TASK-6 | Reject an empty title with an inline error. |
| TASK-7 | Deleting a task deletes its subtasks. |

## Categories (M)

| ID | Requirement |
| --- | --- |
| CAT-1 | Create a category with a unique name. |
| CAT-2 | Assign one or more categories to a task. |
| CAT-3 | Remove a category from a task without deleting the category. |
| CAT-4 | Delete a category; it is removed from every task, and the tasks stay. |
| CAT-5 | No duplicate category names per user. |

Categories can also be renamed, recoloured and reordered; the first six appear as trays on the desk. A built-in
**Others** category cannot be renamed or deleted.

## Deadlines (H)

| ID | Requirement |
| --- | --- |
| DL-1 | Set an optional deadline: a date, optionally with a time. |
| DL-2 | Edit or remove a deadline. |
| DL-3 | Flag open tasks whose deadline has passed as overdue. |
| DL-4 | Show deadlines on the calendar. |

## Priority (M)

| ID | Requirement |
| --- | --- |
| PR-1 | The user sets a task's priority level (Low, Medium and High out of the box). |
| PR-2 | A task without an explicit level gets the default level (Medium out of the box). |
| PR-3 | Change a task's priority at any time. |
| PR-4 | Priority levels are visually distinct (sticky-note colour). |
| PR-5 | The system never calculates, infers or suggests a priority. |

Levels can be added, renamed, recoloured, reordered and deleted. Deleting a level moves its tasks to the neighbouring
level; the last level cannot be deleted.

## Subtasks (M)

| ID | Requirement |
| --- | --- |
| SUB-1 | Add checklist items (title only) to a task. |
| SUB-2 | Tick and untick a checklist item. |
| SUB-3 | Delete a checklist item without affecting the task. |
| SUB-4 | Checklist items have no deadline, priority or category of their own. |
| SUB-5 | Show checklist progress on the task (for example 2/5). |

## Calendar (M)

| ID | Requirement |
| --- | --- |
| CAL-1 | Month view with tasks on their deadline dates. |
| CAL-2 | Move between months. |
| CAL-3 | Open a task from the calendar. |
| CAL-4 | Tasks without a deadline do not appear on the calendar. |

## Search and filter (M)

| ID | Requirement |
| --- | --- |
| SF-1 | Keyword search over title and description. |
| SF-2 | Filter by category. |
| SF-3 | Filter by priority. |
| SF-4 | Filter by status (open / done). |
| SF-5 | Combine search and filters (logical AND). |
| SF-6 | Show a "no matching tasks" message for an empty result. |

## Pomodoro timer (L)

| ID | Requirement |
| --- | --- |
| POM-1 | Start a focus session (25 minutes by default). |
| POM-2 | Notify (visual and audio) when a focus session or break ends. |
| POM-3 | Start the break automatically after a focus session (5 minutes by default). |
| POM-4 | Pause, resume and reset at any time. |
| POM-5 | The timer has no association with tasks. |
| POM-6 | Session lengths are configurable: presets of 15, 25, 45 and 60 minutes, or a custom focus length of 1–120 minutes and break of 1–30 minutes. |

## Accounts and security (H)

| ID | Requirement |
| --- | --- |
| AUTH-1 – AUTH-5 | Sign up, sign in and sign out; sessions as a short-lived access token plus a rotating refresh token in HttpOnly cookies; passwords hashed with bcrypt; every account's data isolated from every other account. |
| AUTH-6 | Two-step sign-in: a correct password emails a one-time code, and the session starts only when the code is entered. |
| AUTH-7 | One-time codes are six digits, expire, work once, allow a limited number of tries and are bound to the browser that requested them. |
| AUTH-8 | "Forgot password" emails a reset code without revealing whether the email has an account. |
| AUTH-9 | Resetting the password with a code signs out every other session and emails a notice. |

## Non-functional

| Area | Requirement |
| --- | --- |
| Performance | Task list loads within 2 s for under 500 tasks; at least 1,000 tasks per user without noticeable slowdown; CRUD responses within 500 ms. |
| Security | See [SECURITY.md](SECURITY.md) for the full threat model. |
| Usability | A first-time user can create a task without instructions. |
| Appearance | A dark mode toggle applied consistently to every screen, as a presentation-only theme. |
| Reliability | No task data is lost through normal use. |
| Compatibility | The latest two major versions of Chrome, Firefox and Edge, on desktop and mobile; a 2D fallback without WebGL. |
