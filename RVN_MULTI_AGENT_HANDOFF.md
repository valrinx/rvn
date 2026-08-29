# RVN Multi-Agent Handoff

## 1. Purpose

This handoff defines a concrete design for a multi-agent engineering workflow built around **RVN as the central coordination layer**. Multiple ChatGPT/Codex sessions can work in parallel while sharing durable tasks, messages, ownership, artifacts, status, and verification results.

The coordination layer belongs in RVN. `raven_roblox` remains a downstream Roblox analysis/control tool and must not become the message bus between agents.

```text
                    ┌──────────────────────┐
                    │      Main Agent      │
                    │ planner / integrator │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    RVN Agent Bus     │
                    │ router + shared state│
                    │ SQLite + MCP tools   │
                    └─────┬────┬────┬─────┘
                          │    │    │
             ┌────────────┘    │    └────────────┐
             ▼                 ▼                 ▼
      ┌─────────────┐   ┌──────────────┐  ┌─────────────┐
      │ Code Agent  │   │Research Agent│  │ Test Agent  │
      │ source work │   │ RVN / Roblox │  │ verification│
      └──────┬──────┘   └──────┬───────┘  └──────┬──────┘
             │                 │                 │
             └────────────┬────┴───────┬─────────┘
                          ▼            ▼
                     RVN tools     raven_roblox
```

---

## 2. Core principles

1. **Main Agent owns orchestration.** It interprets the user request, decomposes work, defines acceptance criteria, assigns work, reviews results, and integrates final changes.
2. **Workers own bounded tasks.** Each task must have one objective, explicit scope, dependencies, and measurable acceptance criteria.
3. **RVN is the source of truth.** Agent identity, tasks, messages, locks, artifacts, and task history live in durable RVN storage rather than chat history.
4. **Chat history is context, not state.** A fresh session must be able to resume from RVN without rereading the entire prior conversation.
5. **No uncontrolled concurrent writes.** Two workers must not modify the same file at the same time. Use file locks or isolated Git worktrees.
6. **Completion requires evidence.** Coding work is not complete until the relevant diff/test/syntax checks pass.
7. **Small deterministic API first.** Build a minimal Agent Bus before dashboards, autonomous planning, or complex distributed features.

---

## 3. Recommended agent roles

### Main Agent

Responsibilities:
- requirement analysis
- task decomposition
- dependency graph
- priority
- assignment
- conflict prevention
- result review
- integration
- final report to the user

Main must not:
- let two workers mutate the same file concurrently
- mark a task complete from a vague worker message
- integrate code without required verification

### Code Agent

Responsibilities:
- inspect only relevant source/dependencies
- follow existing conventions
- make minimal diffs
- run targeted verification
- return exact changed files and test results

Recommended isolation:

```text
worktrees/code-agent-a
worktrees/code-agent-b
```

A code agent should never share a writable worktree with another code agent.

### Research Agent

Responsibilities:
- read-only source inspection
- Roblox runtime analysis through RVN → `raven_roblox`
- identify modules, functions, constants, and data flow
- produce evidence-backed results

Examples:
- map recoil calculation
- map projectile spread pipeline
- locate respawn protocol
- inspect UI callback flow

Default permission should be read-only.

### Test Agent

Responsibilities:
- targeted tests
- syntax checks
- regression tests
- live smoke tests when requested
- actual measurements and observed results

It should not redesign implementation unless explicitly assigned.

### Review Agent

Optional but useful in quality mode.

Responsibilities:
- final diff review
- unrelated-change detection
- encoding/mojibake checks
- test coverage review
- acceptance-criteria validation

---

## 4. RVN Agent Bus MCP surface

Start with a small tool set:

```text
agent_register
agent_get
agent_list
agent_heartbeat

task_create
task_get
task_list
task_claim
task_assign
task_update
task_complete
task_fail
task_cancel

message_send
message_inbox
message_ack

lock_acquire
lock_release
lock_list

artifact_add
artifact_get
artifact_list

event_list
```

The MVP does not need every tool above. The minimum useful first release is:

```text
agent_register
agent_heartbeat
task_create
task_claim
task_complete
message_send
message_inbox
```

---

## 5. Agent registry

Suggested fields:

```text
agent_id
role
session_id
status
capabilities_json
current_task_id
last_heartbeat_at
created_at
updated_at
```

Statuses:

```text
online
busy
idle
blocked
offline
```

Example registration:

```json
{
  "agent_id": "research-01",
  "role": "research",
  "session_id": "chat-session-id",
  "capabilities": [
    "rvn_read",
    "raven_roblox",
    "no_source_write"
  ]
}
```

---

## 6. Task model

Each task must be self-contained enough that a fresh worker can start without relying on hidden chat context.

Required fields:

```text
task_id
title
objective
status
priority
owner_agent_id
created_by_agent_id
acceptance_criteria
file_scope
dependencies
read_only
created_at
updated_at
started_at
completed_at
```

Suggested statuses:

```text
queued
assigned
running
blocked
review
completed
failed
cancelled
```

Example:

```json
{
  "task_id": "TWW-RECOIL-001",
  "title": "Map recoil pipeline",
  "objective": "Identify the exact client recoil path from weapon config through camera recoil.",
  "priority": 80,
  "read_only": true,
  "file_scope": [],
  "acceptance_criteria": [
    "Identify recoil function names",
    "Identify config fields",
    "Identify scoped/fanning modifiers",
    "Identify final camera/UI recoil call",
    "Report evidence paths"
  ],
  "dependencies": []
}
```

---

## 7. Assignment and atomic claiming

Two supported modes:

### Main-assigned

```text
Main → task_create(...)
Main → task_assign(task_id, agent_id)
```

### Worker-pull

```text
Worker → task_claim(agent_id, optional_task_id)
```

Claiming must be atomic so two workers cannot take the same task.

SQLite pattern:

```sql
BEGIN IMMEDIATE;
SELECT eligible_task;
UPDATE tasks
SET owner_agent_id = ?, status = 'running'
WHERE task_id = ? AND status IN ('queued','assigned');
COMMIT;
```

If the update affects zero rows, the claim failed and must return a structured conflict response.

---

## 8. Acceptance criteria

Every implementation task must define success before work starts.

Bad:

```text
Fix movement.
```

Good:

```text
Objective:
Prevent the movement routine from stopping on moderate static obstacles.

Acceptance:
1. Existing recovery system unchanged.
2. No new source files.
3. Targeted regression passes.
4. No mojibake introduced.
5. Live test retains full character control for 30 steps.
```

Main must reject completion language such as:

```text
Looks good.
Should work.
Probably fixed.
```

without real verification.

---

## 9. Durable messaging protocol

Message types:

```text
TASK
UPDATE
RESULT
BLOCKER
QUESTION
REVIEW
ACK
CANCEL
```

Suggested schema:

```text
message_id
sequence
from_agent_id
to_agent_id
task_id
type
body
metadata_json
created_at
acknowledged_at
```

Example update:

```json
{
  "from": "research-01",
  "to": "main",
  "task_id": "TWW-RECOIL-001",
  "type": "UPDATE",
  "body": "Found CalculateRecoil in GunItemType. Fire calls CalculateRecoil then UIHandler:AddRecoil."
}
```

Example test result:

```json
{
  "from": "test-01",
  "to": "main",
  "task_id": "TWW-TEST-014",
  "type": "RESULT",
  "body": "Targeted regression passed.",
  "metadata": {
    "command": "powershell.exe -NoProfile -File tests/the_wild_west_v010.ps1",
    "exit_code": 0
  }
}
```

---

## 10. Inbox design

Main should not poll every worker continuously. Workers write durable messages; Main reads only unseen sequences.

```text
Workers → RVN durable inbox
Main → message_inbox(after_sequence=N)
```

Example response:

```json
{
  "next_sequence": 166,
  "messages": [
    {
      "sequence": 163,
      "type": "RESULT",
      "from": "research-01",
      "task_id": "TWW-RECOIL-001"
    },
    {
      "sequence": 164,
      "type": "UPDATE",
      "from": "test-01",
      "task_id": "TWW-TEST-014"
    },
    {
      "sequence": 165,
      "type": "BLOCKER",
      "from": "code-01",
      "task_id": "TWW-CODE-021"
    }
  ]
}
```

A monotonically increasing sequence makes reconnect/resume deterministic.

---

## 11. File locking

Recommended lock types:

```text
file
directory
integration
runtime
```

Example:

```json
{
  "resource": "modules/the_wild_west.lua",
  "type": "file",
  "owner_agent_id": "code-01",
  "task_id": "TWW-CODE-021",
  "ttl_seconds": 1800
}
```

Rules:
1. acquire before mutation
2. release after completion/failure
3. heartbeat extends TTL
4. expired locks can be reclaimed
5. Main can force-release stale locks

Never permit two active writers on the same file.

---

## 12. Git worktree strategy

Recommended layout:

```text
main-workspace/
worktrees/
  code-a/
  code-b/
  integration/
```

Branches:

```text
agent/code-a/TASK-ID
agent/code-b/TASK-ID
```

Workers return:

```text
branch
commit_hash
changed_files
tests
limitations
```

Main reviews before cherry-pick/merge.

---

## 13. Artifact registry

Artifacts should be referenced rather than dumped into chat messages.

Types:

```text
diff
test_report
runtime_capture
screenshot
analysis_summary
commit
patch
benchmark
```

Schema:

```text
artifact_id
task_id
agent_id
type
path_or_reference
sha256
metadata_json
created_at
```

---

## 14. Append-only event log

Important transitions should create durable events:

```text
TASK_CREATED
TASK_ASSIGNED
TASK_STARTED
TASK_BLOCKED
TASK_COMPLETED
MESSAGE_SENT
LOCK_ACQUIRED
LOCK_RELEASED
ARTIFACT_ADDED
AGENT_OFFLINE
```

This provides auditability, reconnect recovery, and a future dashboard timeline.

---

## 15. SQLite storage

Recommended location:

```text
.rvn/agent_bus.db
```

Suggested tables:

```text
agents
tasks
task_dependencies
messages
locks
artifacts
events
```

Core schema:

```sql
CREATE TABLE agents (
    agent_id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    session_id TEXT,
    status TEXT NOT NULL,
    capabilities_json TEXT NOT NULL DEFAULT '[]',
    current_task_id TEXT,
    last_heartbeat_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE tasks (
    task_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    objective TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 50,
    owner_agent_id TEXT,
    created_by_agent_id TEXT,
    acceptance_json TEXT NOT NULL DEFAULT '[]',
    file_scope_json TEXT NOT NULL DEFAULT '[]',
    dependencies_json TEXT NOT NULL DEFAULT '[]',
    read_only INTEGER NOT NULL DEFAULT 0,
    result_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER
);

CREATE TABLE messages (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE NOT NULL,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    task_id TEXT,
    type TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    acknowledged_at INTEGER
);

CREATE TABLE locks (
    resource TEXT PRIMARY KEY,
    lock_type TEXT NOT NULL,
    owner_agent_id TEXT NOT NULL,
    task_id TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE artifacts (
    artifact_id TEXT PRIMARY KEY,
    task_id TEXT,
    agent_id TEXT NOT NULL,
    type TEXT NOT NULL,
    path_or_reference TEXT NOT NULL,
    sha256 TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
);

CREATE TABLE events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    task_id TEXT,
    agent_id TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
);
```

Recommended pragmas:

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
```

---

## 16. Heartbeat and failure recovery

Each active agent sends a heartbeat approximately every 30–60 seconds.

If heartbeat expires:

```text
online/busy → offline
running task → stale/blocked
owned locks → eligible for stale recovery
```

Main can then:
- reassign task
- release stale locks
- inspect last UPDATE
- resume from artifacts

Task progress must never exist only in worker memory.

---

## 17. BLOCKER protocol

Workers must stop instead of guessing indefinitely.

Example:

```json
{
  "type": "BLOCKER",
  "task_id": "TWW-CODE-021",
  "body": "Target function is absent in the current module version.",
  "metadata": {
    "attempts": 2,
    "evidence": [
      "searched exact file",
      "searched relevant dependency"
    ],
    "requested_decision": "Confirm alternate implementation path"
  }
}
```

Keep the existing ROBLOX-MCP execution discipline:

```text
same blocker twice → stop/report
no meaningful progress after bounded calls → stop/report
```

---

## 18. Worker RESULT contract

A coding worker should return:

```text
STATUS: completed | failed | blocked
TASK: <task-id>

FILES CHANGED:
- path

WHY:
- cause
- implementation choice

VERIFICATION:
- command
- exit code
- actual result

LIMITATIONS:
- untested scenario
- environment limitation

ARTIFACTS:
- commit hash
- diff/test reference
```

Example:

```text
STATUS: completed
TASK: TWW-CODE-031

FILES CHANGED:
- modules/the_wild_west.lua
- tests/the_wild_west_v010.ps1

WHY:
- Removed obsolete Auto Money state machine and UI.

VERIFICATION:
- targeted regression: PASS
- git diff --check: PASS
- mojibake scan: CLEAN

LIMITATIONS:
- no live Roblox test required

ARTIFACTS:
- branch: agent/code-a/TWW-CODE-031
- commit: abc123
```

---

## 19. Main integration contract

Before Main accepts a worker result:

```text
1. task result exists
2. acceptance criteria checked
3. changed files inside task scope
4. no conflicting owner/lock
5. diff inspected
6. required tests passed
7. integration state is valid
```

Then:

```text
task → completed
integration event recorded
worker lock released
```

---

## 20. ROBLOX-MCP / Raven routing

Correct routing:

```text
Research Agent
  ↓
RVN Agent Bus
  ↓
RVN mcp_call
  ↓
raven_roblox
  ↓
Roblox client
```

Examples of research-oriented downstream tools:

```text
index_scripts
search_scripts
analyze_script
disassemble_script
inspect_instance
get_player_state
smart_snapshot
```

Do not give all workers unrestricted live mutation.

Suggested capability profiles:

```text
research:
  raven_roblox introspection
  workspace read
  no source write

code:
  workspace read/write
  git worktree
  no live Roblox mutation by default

test:
  targeted process execution
  limited live test calls

main:
  orchestration
  integration
  review
```

---

## 21. Example end-to-end workflow

User request:

```text
Analyze recoil and build Weapon Inspector.
```

Main creates:

```text
TWW-R-001  Research recoil/spread internals
TWW-C-002  Implement Weapon Inspector     depends_on TWW-R-001
TWW-T-003  Targeted regression            depends_on TWW-C-002
TWW-V-004  Review final diff              depends_on TWW-T-003
```

Flow:

```text
Main → research-01
research-01 → UPDATE
research-01 → RESULT

RVN marks dependent task eligible

Main/code scheduler → code-01
code-01 → RESULT + commit

Main/test scheduler → test-01
test-01 → RESULT + verification

Main/review scheduler → review-01
review-01 → RESULT

Main integrates
Main reports to user
```

---

## 22. Dependency scheduling

Task is eligible only when:

```text
status == queued
all dependencies == completed
no conflicting lock exists
required capability is available
```

Optional priority formula:

```text
effective_priority =
    task.priority
    + dependency_unblock_bonus
    + age_bonus
```

Do not over-engineer scheduling in the MVP.

---

## 23. Bus snapshot

Main should be able to read one compact status snapshot after reconnect:

```json
{
  "agents": {
    "online": 3,
    "busy": 2,
    "blocked": 0
  },
  "tasks": {
    "queued": 2,
    "running": 2,
    "review": 1,
    "completed": 14
  },
  "new_messages": 3,
  "active_locks": 1
}
```

---

## 24. Session resume

A fresh Main session should need only:

```text
agent_register(role=main)
bus_snapshot()
message_inbox(after_sequence=last_seen)
task_list(status=running,blocked,review)
```

It should not need the full historical chat transcript.

---

## 25. Dashboard

Dashboard is optional and belongs after the backend protocol works.

Suggested layout:

```text
SESSIONS
- Main ONLINE
- Code-A BUSY
- Research ONLINE
- Test OFFLINE

TASKS
- TWW-R-001 completed
- TWW-C-002 running
- TWW-T-003 queued

MESSAGES
- UPDATE research → main
- RESULT code → main
- BLOCKER test → main
```

Backend durability and correctness are higher priority than UI.

---

## 26. Structured errors

Example:

```json
{
  "ok": false,
  "error": {
    "code": "LOCK_CONFLICT",
    "message": "modules/the_wild_west.lua is locked by code-01",
    "owner": "code-01",
    "task_id": "TWW-CODE-031"
  }
}
```

Useful codes:

```text
TASK_NOT_FOUND
TASK_ALREADY_CLAIMED
DEPENDENCY_NOT_READY
LOCK_CONFLICT
AGENT_NOT_REGISTERED
TASK_SCOPE_VIOLATION
STALE_HEARTBEAT
INVALID_TRANSITION
```

---

## 27. Task state transitions

Valid transitions:

```text
queued → assigned
queued → running
assigned → running
running → blocked
blocked → running
running → review
review → completed
review → running
running → failed
* → cancelled
```

`completed → running` should require an explicit reopen action rather than being silently accepted.

---

## 28. Security and scope

Do not persist credentials in the Agent Bus.

Never store:

```text
API keys
cookies
passwords
session tokens
connector credentials
```

Persist references only.

Capability enforcement must happen server-side. Examples:

```text
research cannot call workspace-write tools
worker cannot force-release integration lock
one worker cannot complete another worker's task without authority
```

---

## 29. Resource economy rules

Keep the current RVN engineering constraints:

```text
- no whole-machine scan
- no whole-repo scan unless explicitly required
- bounded search results
- bounded file reads
- targeted tests only
- no unnecessary GUI/game/server execution
- do not repeat an identical failed command
- stop on repeated blocker
```

Agent Bus tasks may carry these policies in metadata so workers inherit them.

---

## 30. Encoding safety

For source mutation:

```text
UTF-8
preserve BOM
preserve newline style
use targeted edits
avoid unsafe whole-file PowerShell replacement
```

After source edits scan for:

```text
Ã
Â
â
ðŸ
ï¿½
�
```

Any match should fail verification until inspected and repaired with a targeted patch.

---

## 31. Quality mode workflow

When Main is told to use quality mode:

```text
1. analyze requirement
2. define acceptance criteria
3. identify ownership/scope
4. assign research if needed
5. assign implementation
6. syntax/compile check
7. targeted tests
8. final diff review
9. encoding check
10. integrate only after pass
```

No agent may declare success before required verification passes.

---

## 32. Implementation phases

### Phase 1 — Core Bus

Implement:

```text
SQLite persistence
agent_register
agent_heartbeat
task_create
task_list
task_claim
task_update
task_complete
message_send
message_inbox
```

Acceptance:

```text
two sessions can exchange durable messages
two sessions see identical task state
task claim is atomic
state survives reconnect/restart
```

### Phase 2 — Locks

Implement:

```text
lock_acquire
lock_release
TTL
stale lock cleanup
```

Acceptance:

```text
second writer gets LOCK_CONFLICT
stale lock is recoverable
```

### Phase 3 — Artifacts

Implement:

```text
artifact_add
artifact_list
commit/diff/test references
```

### Phase 4 — Worktree integration

Implement:

```text
worker worktree allocation
task branch creation
commit reporting
Main integration
```

### Phase 5 — Dashboard

Only after the backend is stable.

---

## 33. MVP acceptance test

Open three sessions:

```text
Session A = Main
Session B = Worker
Session C = Worker
```

Test sequence:

1. Main creates a task.
2. B claims it.
3. C attempts to claim the same task and is rejected.
4. B sends UPDATE.
5. Main receives UPDATE.
6. B completes task.
7. Main sees completed result.
8. Main disconnects/reconnects.
9. Task/result/message history remains available.

If all nine pass, the core Agent Bus concept is proven.

---

## 34. Proposed tool schemas

### task_create

```json
{
  "title": "string",
  "objective": "string",
  "priority": 50,
  "acceptance_criteria": ["string"],
  "file_scope": ["string"],
  "dependencies": ["task-id"],
  "read_only": false,
  "preferred_role": "code"
}
```

### task_claim

```json
{
  "agent_id": "code-01",
  "task_id": "optional"
}
```

### task_update

```json
{
  "agent_id": "code-01",
  "task_id": "T-001",
  "status": "running",
  "progress": "Implemented parser, testing now."
}
```

### task_complete

```json
{
  "agent_id": "code-01",
  "task_id": "T-001",
  "result": {
    "files_changed": [],
    "tests": [],
    "artifacts": [],
    "limitations": []
  }
}
```

### message_send

```json
{
  "from_agent_id": "code-01",
  "to_agent_id": "main",
  "task_id": "T-001",
  "type": "UPDATE",
  "body": "string",
  "metadata": {}
}
```

### message_inbox

```json
{
  "agent_id": "main",
  "after_sequence": 162,
  "limit": 50
}
```

---

## 35. Naming recommendation

Service:

```text
rvn_agent_bus
```

Database:

```text
.rvn/agent_bus.db
```

MCP namespace:

```text
agent_bus.*
```

Example:

```text
agent_bus.agent_register
agent_bus.task_create
agent_bus.task_claim
agent_bus.message_send
agent_bus.message_inbox
```

---

## 36. Non-goals for MVP

Do not implement initially:

```text
LLM-to-LLM autonomous negotiation
complex planner AI
automatic merge-conflict resolution
cloud database
distributed network transport
websocket dashboard
semantic/vector memory
large RBAC system
```

First prove deterministic local coordination.

---

## 37. Key architectural decision

**RVN is the coordination host.**

Reasons:
- RVN already owns local tool routing
- RVN knows project/workspace context
- RVN can enforce filesystem scope
- RVN can store durable local state
- RVN can integrate Git/worktrees
- RVN already forwards selected work to `raven_roblox`

Correct:

```text
Agent → RVN Agent Bus → raven_roblox
```

Incorrect:

```text
Agent A → raven_roblox → Agent B
```

---

## 38. Recommended first engineering task

The next implementation session should inspect only the RVN repository areas responsible for:

```text
MCP tool registration
local persistence/database
request validation
structured errors
tests
```

Then implement Phase 1 using existing repository conventions.

Do not guess folder names before inspecting the actual repo. A likely conceptual grouping is:

```text
agent_bus/
  db
  service
  mcp_tools
```

but the real paths must follow current RVN structure.

---

## 39. Definition of done

The multi-agent system becomes production-usable when:

- durable state survives process/session restart
- task claims are atomic
- file conflicts are prevented
- workers can reconnect
- Main can resume from a compact snapshot
- messages have monotonic ordering
- task history is auditable
- failed agents do not permanently lock work
- worker results contain actual verification
- integration authority remains with Main

---

## 40. Recommended ROBLOX-MCP team layout

```text
Main
│
├── Research Agent
│   └── Raven / Roblox internals
│
├── Code Agent
│   └── source implementation
│
├── Test Agent
│   └── regression + live smoke test
│
└── Review Agent
    └── diff + encoding + acceptance
```

For small changes Main may use one worker only. Parallelism is useful only when task boundaries are independent.

---

## 41. Handoff instruction for the next session

The next engineering session should:

1. Read this handoff.
2. Inspect only relevant RVN MCP registration and persistence code.
3. Identify existing conventions for database access, schemas, validation, error format, and tests.
4. Write a Phase 1 implementation plan.
5. Implement the smallest viable Agent Bus.
6. Add targeted tests for registration, atomic claim, durable sequence ordering, and reconnect persistence.
7. Run only targeted verification.
8. Review the final diff.
9. Check encoding/mojibake.
10. Do not implement dashboard/locks/worktrees until Phase 1 passes.

---

## 42. Final target behavior

A user should eventually be able to open several ChatGPT/Codex sessions and use them as one coordinated engineering team:

```text
Main:
"Research recoil, implement inspector, test it."

RVN:
- creates tasks
- routes workers
- preserves messages
- enforces ownership
- records results

Research:
RESULT → Main

Code:
RESULT + commit → Main

Test:
RESULT + verification → Main

Main:
reviews → integrates → reports
```

That is the intended RVN Multi-Agent architecture.

---

## 43. Phase 1 implementation status (2026-08-28)

Implemented in the primary development repository `C:\Users\teens\OneDrive\Documents\GitHub\rvn`.

- Added migration `006_agent_bus` to the existing RVN SQLite database. Agent Bus state is stored in `agent_bus_agents`, `agent_bus_tasks`, and `agent_bus_messages`; this keeps coordination durable across reconnect/restart while preserving the existing `%APPDATA%\\rvn\\rvn.sqlite` backup and WAL lifecycle.
- Added `SqliteAgentBusRepository` with agent registration/heartbeat, task creation/listing/atomic claiming, ownership-checked updates/completion, durable typed messages, and monotonic inbox cursors.
- Added the nine Phase 1 MCP tools: `agent_register`, `agent_heartbeat`, `task_create`, `task_list`, `task_claim`, `task_update`, `task_complete`, `message_send`, and `message_inbox`.
- Desktop MCP now supplies the shared Agent Bus service. The generic MCP server advertises these tools only when a host provides durable Agent Bus storage, so other MCP servers remain compatible and no `raven_roblox` behavior is hardcoded.
- Added bounded schemas, structured Agent Bus error codes, and mutation-policy classification so coordination writes do not require workspace-file mutation approval. Existing placeholder `task_create`/`task_list` catalog entries are suppressed only when the real Agent Bus is available to prevent duplicate tool names.
- Added RED-first tests for reconnect persistence, message sequence delivery, dependency readiness, ownership/transition rules, atomic concurrent claims, MCP routing, and non-bus compatibility. A non-Roblox generic agent fixture is used by the MCP tests.

Verification completed:

- `corepack pnpm@10.15.0 typecheck` passed.
- `corepack pnpm@10.15.0 build` passed.
- Full workspace test run passed after updating the desktop acceptance count from 212 to 219 tools for the desktop runtime; standalone stdio remains 212 because it does not provide a durable Agent Bus service.
- `git diff --check` passed and no mojibake was found in the new source.

### Single next action

Use the running primary installed RVN only after promoting a new packaged build. For the next phase, add durable agent/task lookup and acknowledgement/event APIs, then implement locks/worktrees only after Phase 1 is exercised through two real MCP sessions.

---

## 44. Phase 1 live MCP acceptance (2026-08-28)

- The latest v5.0.0 source was built and packaged with the repository convention. The normal NSIS invocation reached packaging but failed in the host signing-tool extraction because Windows denied creation of Darwin symbolic links (`A required privilege is not held by the client`). A second, changed invocation used `win.signAndEditExecutable=false`; it produced `apps\\desktop\\dist\\installers\\rvn-Setup-5.0.0.exe` and refreshed `apps\\desktop\\dist\\installers\\win-unpacked` without changing repository configuration.
- The refreshed unpacked artifact was promoted to the primary installed runtime at `C:\\Users\\teens\\AppData\\Local\\Programs\\rvn` after verifying every running `rvn.exe` belonged to that exact path. The previous installation was preserved at `C:\\Users\\teens\\AppData\\Local\\Programs\\rvn-recovery-agentbus-25690828-134509`.
- Source and installed `resources\\app.asar` match at SHA-256 `5F23025A61C2C96F4B519BB0245E1E1E474993DE91680F7F099F63F816C4CA4A`. Both contain embedded package version `5.0.0`, `agent_register`, and migration `006_agent_bus`.
- Live MCP was exercised against the installed runtime endpoint `http://127.0.0.1:18765/mcp` with three independent sessions: Main, Worker A, and Worker B. The result was `PASS`: catalog had 225 unique tools (Codex settings enabled), all nine Agent Bus tools were present, Worker A owned the task, Worker B was rejected with `TASK_ALREADY_CLAIMED`, Main received UPDATE sequence `1`, `task_complete` persisted `{ packaged: true, passed: true }`, and a reconnected Main read the same task/message while `after_sequence=1` returned no duplicate.
- Targeted verification after the live run: storage Agent Bus `3/3` passed; MCP routing/no-bus `2/2` passed; desktop live acceptance `1/1` passed; root typecheck passed; package build passed; `git diff --check` passed; mojibake scan (`Ã`, `Â`, `â`, `ðŸ`, `ï¿½`, `�`) was CLEAN. The existing full workspace suite had already passed before this test-only acceptance addition and was not repeated unnecessarily.

### Single next action

Keep Phase 2 paused. If work resumes, implement only `agent_get`/`task_get`/`message_ack` or durable event/snapshot APIs after reviewing this live evidence; do not add locks, worktrees, or dashboard yet.

## 45. Multi-Agent phases D-G completion (2026-08-28)

The roadmap was continued from the Phase 1 live acceptance evidence above. No commit or push was performed.

### Phase D: durable worktree coordination

- Added SQLite migration `010_agent_bus_worktrees` and repository methods for deterministic worktree allocation, release, and listing.
- Allocation is owner-scoped, atomic, idempotent for the same owner/task/path, and rejects active task/path conflicts with structured `WORKTREE_CONFLICT` errors.
- Branches and default paths are deterministic (`agent/<agent>/<task>` and `.worktrees/<agent>/<task>`). Physical Git materialization is optional and guarded by the existing mutation/approval boundary.
- Added `WORKTREE_ALLOCATED` and `WORKTREE_RELEASED` durable events plus storage and MCP routing tests.

### Phase E: role/capability enforcement

- Tool invocation now checks the durable Agent Bus agent role when an agent record exists.
- Research agents cannot perform source mutations; Code agents require an owned active worktree and cannot mutate outside it; non-Main agents cannot run Git integration commands.
- Unknown agents and hosts without Agent Bus keep the existing generic MCP behavior.
- Added targeted role/capability regression coverage.

### Phase F: Agent Bus dashboard

- Added bounded `DashboardSnapshot.agentBus` data for agents, tasks, messages, locks, artifacts, events, and latest sequences.
- Desktop IPC/preload and the home dashboard now render the durable coordination state.
- The renderer keeps backward compatibility with older dashboard fixtures that do not include `agentBus`.
- Added a dashboard persistence test covering agents, tasks, events, locks, and artifacts.

### Phase G: build, promote, and runtime evidence

- `corepack pnpm@10.15.0 build`: PASS.
- NSIS package: `C:\Users\teens\OneDrive\Documents\GitHub\rvn\apps\desktop\dist\installers\rvn-Setup-5.0.0.exe`.
- The known Windows winCodeSign symbolic-link privilege issue was handled with the repository-compatible `win.signAndEditExecutable=false` packaging override; repository configuration was not changed.
- Final unpacked `resources\\app.asar` SHA-256: `BCC366872663DDF28B2D70A3CD1B9D3B287FC9844778E14DE4C5E01483874C2A`.
- The final unpacked build was promoted to the primary runtime `C:\Users\teens\AppData\Local\Programs\rvn\rvn.exe`; the previous install was preserved at `C:\Users\teens\AppData\Local\Programs\rvn-recovery-phase-g-final-25690828-154548`.
- Final installed smoke against `http://127.0.0.1:18765/mcp`: PASS; `240` unique tools, `agent_get`, `agent_list`, `task_get`, and `bus_snapshot` advertised, durable agent list returned `9` records, and `agent_get` returned the persisted `e2e-main` record with `status=online`.

### Verification

- Full workspace test run: PASS (`19/19` participating packages; desktop `49` files / `282` tests; MCP server `45` files / `339` tests; storage `7` files / `28` tests).
- Targeted dashboard regression test: PASS (`1/1`); legacy security/incident UI fixtures: PASS (`9/9`).
- Root typecheck: PASS.
- Build/package: PASS.
- `git diff --check`: PASS.
- Mojibake scan for `Ã`, `Â`, `â`, `ðŸ`, `ï¿½`, and `�`: CLEAN.
- Earlier real multi-session Agent Bus acceptance remains PASS: Main, Research, Code A, Code B, Test, and Review contexts; claim conflict, lock conflict, UPDATE delivery/ack, artifact/result persistence, dependent task completion, event/task/agent lookups, and reconnect cursor de-duplication were all observed. The durable worktree path was exercised with `materialize=false` and cleaned up afterward.

### Limitations

The live installed run allocated and released a durable worktree record but did not create a physical Git worktree on disk. Physical materialization is covered by the guarded MCP implementation and tests, but was intentionally not run against the user's workspace during acceptance.

### Single next action

If work resumes, take only the `task_get` follow-up; do not start another dashboard, worktree, or larger subsystem.

## 46. task_get verification (2026-08-28)

The requested next item was already implemented in the Phase A Agent Bus work, so no duplicate source change was made.

- Repository `getTask` returns the complete durable task record, including ownership, lifecycle timestamps, progress, result, dependencies, acceptance criteria, and file scope; reconnect lookup and `TASK_NOT_FOUND` are covered.
- MCP `task_get` uses the bounded `task_id` schema, routes to the durable repository, is read-only, and preserves no-bus compatibility.
- Targeted verification: storage Agent Bus repository `11/11` tests passed; MCP Agent Bus routing/schema `2/2` tests passed.
- Installed runtime verification: `task_list(statuses=[completed])` followed by `task_get` returned a persisted completed task with `hasResult=true`.

### Single next action

If work resumes, implement only `message_ack` follow-up; do not start events, locks, worktrees, or dashboard changes.

## 47. message_ack verification (2026-08-28)

The requested `message_ack` follow-up was already implemented in Phase A, so no duplicate source change was made.

- Repository acknowledgement persists `acknowledged_at`, is restricted to the message recipient, supports either `message_id` or monotonic `sequence`, and is idempotent.
- `MESSAGE_NOT_FOUND` and `MESSAGE_SCOPE_VIOLATION` are structured errors; `MESSAGE_ACKNOWLEDGED` is recorded in durable event history.
- MCP uses the bounded schema requiring exactly one identifier, routes as a coordination mutation, and preserves no-bus compatibility.
- Targeted verification: storage Agent Bus repository `11/11` tests and MCP Agent Bus routing/schema `2/2` tests passed.
- Installed runtime smoke passed: new UPDATE message acknowledged by ID, acknowledged again by sequence, and returned the same acknowledgement timestamp.

### Single next action

If work resumes, implement only the next durable event-history follow-up; do not start locks, worktrees, or dashboard changes.

## 48. event_list verification (2026-08-28)

The durable event-history follow-up was already implemented in Phase A, so no duplicate source change was made.

- Repository `listEvents` returns bounded, ordered event history with `afterSequence`, `taskId`, and `agentId` filters and a monotonic `nextSequence` cursor.
- MCP uses the bounded `event_list` schema, routes read-only, and remains compatible when Agent Bus is absent.
- Targeted verification: storage Agent Bus repository `11/11` tests and MCP Agent Bus routing/schema `2/2` tests passed.
- Installed runtime smoke read `30` durable events with unique increasing sequences `1..30`; after reconnect, `after_sequence=30` returned zero events and cursor `30`.

### Single next action

If work resumes, implement only the next durable snapshot/resume follow-up; do not start locks, worktrees, or dashboard changes.

## 49. bus_snapshot verification (2026-08-28)

The durable snapshot/resume follow-up was already implemented in Phase A, so no duplicate source change was made.

- Repository `getSnapshot` returns agent/task status counts, active tasks, latest message/event sequences, and SQLite WAL durability metadata.
- MCP `bus_snapshot` is bounded, read-only, and compatible with hosts that do not provide Agent Bus.
- Targeted verification: storage Agent Bus repository `11/11` tests and MCP Agent Bus routing/schema `2/2` tests passed.
- Installed runtime smoke passed across reconnect: `latestEventSequence=30`, `latestMessageSequence=3`, `activeTaskCount=0`, and persistence metadata reported `sqlite / durable / WAL` with unchanged cursors.

### Single next action

If work resumes, review only the complete Agent Bus acceptance evidence; do not add another subsystem without a new scoped request.

## 50. Manual installed-runtime acceptance (2026-08-28)

An operational test was run against the primary installed executable and its MCP HTTP endpoint. No source change was required.

- Endpoint: `http://127.0.0.1:18765/mcp`.
- Four independent protocol sessions were used: Main, Worker A, Worker B, and a reconnected Main.
- Tool catalog: `240` unique tools.
- Worker A claimed task `48773865-51b3-4763-aa8c-64e6ccecf6f1`; Worker B was rejected with `TASK_ALREADY_CLAIMED` and ownership stayed with Worker A.
- Worker A progress and UPDATE reached Main at message sequence `4`; Main acknowledged it at `1787922422993`.
- Task completion persisted as `completed` with the manual installed-MCP result.
- `event_list` returned the six task/message lifecycle events in increasing order.
- Reconnected Main fetched the completed task and `message_inbox(after_sequence=4)` returned `0` duplicates. Snapshot latest event sequence was `40`.
- Temporary test script was removed. The test's durable agent/task/message/event records remain in the installed SQLite database as acceptance evidence; no destructive cleanup API exists.

### Single next action

Review the complete Agent Bus acceptance evidence before starting any new subsystem.

## 51. Server-bound MCP agent sessions (2026-08-28)

- `agent_register` now ignores a client-supplied `session_id` whenever the server has a trusted MCP request scope, and persists the server-derived session (`http-<fingerprint(mcp-session-id)>` for HTTP or the serving lifetime for stdio).
- Agent Bus ownership operations (`agent_heartbeat`, task mutations, message send/inbox/ack, locks, artifact add, and worktree allocate/release) now reject an agent ID bound to another MCP protocol session with structured `AGENT_SESSION_MISMATCH`.
- Role enforcement resolves the durable agent by the trusted protocol session and uses that agent ID for worktree ownership checks. Read-only cross-agent inspection such as `agent_get` remains available; hosts without Agent Bus remain unchanged.
- Targeted MCP verification: session-binding `3/3`, existing Agent Bus routing/no-bus `2/2`, role/request-scope tests `6/6`; full MCP package `46` files / `342` tests passed. Desktop Agent Bus live/dashboard tests `2/2` passed.
- Root typecheck and build passed. Packaged unpacked runtime was promoted to `C:\Users\teens\AppData\Local\Programs\rvn\rvn.exe`; source/installed `resources\\app.asar` SHA-256 is `68C7DF1373C37EDE62224015B667445BA8DDE76B890882E2DF4BD80949357731`. Previous install is recoverable at `C:\Users\teens\AppData\Local\Programs\rvn-recovery-25690828-202339`.
- Installed live smoke used two independent MCP sessions: server sessions `http-044421afefb199cfb17433dd12e8bbd4` and `http-b055ea10d1889ef392d9caf771642304`; spoofed client session was ignored, wrong-session heartbeat/inbox returned `AGENT_SESSION_MISMATCH`, bound operations and UPDATE delivery passed, and tool names were unique.
- `git diff --check` passed and source mojibake scan was CLEAN. No commit or push was performed. Temporary smoke script was removed.

### Single next action

If work resumes, take only the `task_get` follow-up; do not add another subsystem without a new scoped request.

## 52. Chat routing and dashboard message identity fix (2026-08-29)

The installed desktop chat surface was corrected after a live UI review. No commit or push was performed.

- Root cause of the duplicate `TEST`: the dashboard projected `agent_bus_events.sequence` as the message sequence. One durable message therefore appeared once as the local user message and again as a `Main Agent` event with a different sequence.
- Added a bounded durable message listing path and project dashboard messages from `agent_bus_messages`, preserving the real `messageId`, `message.sequence`, sender, recipient, body, and timestamp.
- The renderer now uses `messageId` plus a legacy fingerprint for user-origin matching, so existing locally-sent messages remain labeled `คุณ` after restart and are not duplicated.
- Removed the agent target dropdown. The composer now routes with `@agent`, `@role`, `@agent-id`, or a configured profile name (for example `@Code Agent TEST` sends body `TEST` to Code Agent); a datalist provides non-blocking suggestions.
- Added regression coverage for real message sequence projection, message listing, `@` routing, and the no-dropdown UI contract.
- Installed runtime was rebuilt and promoted to `C:\Users\teens\AppData\Local\Programs\rvn\rvn.exe`; source/installed `resources\\app.asar` SHA-256: `3AA21210748A933A9111E83FF0CDEE1228148BF36ABE129DF2883A696D1AAF58`.

### Verification

- Desktop targeted tests: PASS (`5` files / `10` tests), including Main plus Code/Research/Test/Review MCP routing.
- Storage Agent Bus tests: PASS (`12/12`); MCP routing/session tests: PASS (`7/7`).
- Root typecheck: PASS; workspace build: PASS; Windows NSIS package: PASS.
- Installed smoke: `4` `rvn.exe` processes, MCP listening on `127.0.0.1:18765`, app version `v5.0.0`; UI shows one message composer with `@` placeholder, no target dropdown, and `TEST` labeled `คุณ` without a duplicate Main Agent row.
- `git diff --check`: PASS. Mojibake scan (`Ã`, `Â`, `â`, `ðŸ`, `ï¿½`, `�`): CLEAN.

### Limitation

Workers still need to read `message_inbox` and reply with `message_send` from their own bound MCP protocol session; the desktop composer does not fabricate agent replies.

### Single next action

If work resumes, take only the `task_get` follow-up; do not add another dashboard or messaging subsystem without a new scoped request.

## 53. Architecture direction: RVN Session + Shared Room / Runner (2026-08-29)

The preferred next investment is **RVN-managed sessions plus a durable Shared Agent Room and Agent Runner**. Directly bridging multiple ChatGPT Web conversation tabs is not the primary architecture. ChatGPT Web may remain a user/Main interface, while worker identity, routing, persistence, recovery, and execution stay under RVN control.

### Decision

Keep the existing Agent Bus as the coordination foundation. Do not build a second messaging/task system beside it.

```text
User / Main UI
      |
      v
RVN Shared Agent Room
      |
      v
RVN Session Manager / Runner
  |       |        |       |
 Main   Research   Code    Test / Review
  |       |        |       |
  +-------+--------+-------+
              |
              v
        RVN Agent Bus
   tasks / messages / events
   locks / artifacts / resume
```

The trusted server-bound MCP session remains the security and ownership boundary. A logical worker must bind to one trusted RVN/MCP session, and duplicate/cross-session ownership must continue to fail with the existing session-mismatch rules.

### Phase H — Shared Agent Room

Add a durable project room on top of existing Agent Bus messaging rather than replacing it.

Target capabilities:

- `room_create`
- `room_join`
- `room_leave`
- `room_send`
- `room_inbox`
- `room_history`
- `room_participants`
- `room_snapshot`
- monotonic room/message sequence and reconnect-safe cursors
- acknowledgement using the existing durable acknowledgement model where practical
- route to `@main`, `@agent-id`, `@role`, configured profile names, and `@all`
- user messages are first-class room messages rather than fabricated agent messages
- bounded history/list results

The room should reuse existing agent/message identities, structured errors, SQLite WAL durability, and session-bound authorization. Avoid duplicating task state, message persistence, event history, or agent presence in a parallel store.

### Phase I — Agent Runner

Add an RVN-owned worker execution loop that can consume room/inbox work without requiring a human to manually trigger every worker session.

Runner responsibilities:

1. register or resume the bound agent
2. heartbeat while active
3. read only new room/inbox sequences
4. accept messages/tasks addressed to its agent or role
5. execute one bounded task at a time
6. publish `UPDATE`, `RESULT`, `BLOCKER`, `QUESTION`, or `REVIEW`
7. acknowledge consumed messages
8. persist cursor/checkpoint state
9. resume after runner/RVN restart without replaying acknowledged work
10. stop/report on repeated blockers instead of guessing indefinitely

Runner execution must preserve the existing role/capability policy, file/worktree ownership rules, lock enforcement, resource economy rules, and approval boundaries.

### Phase J — Session Manager

Add durable management for worker session identity and lifecycle.

Required behavior:

- map `agent_id` to one trusted active MCP/RVN session
- distinguish Main, Research, Code, Test, and Review workers by real server-bound session identity
- expose presence such as online, idle, busy, blocked, and offline
- detect duplicate session/agent binding
- allow safe reconnect/rebind according to explicit ownership rules
- retain enough durable cursor/task state for recovery
- never trust a client-supplied conversation/session ID over the server request scope

The acceptance evidence must prove five workers are not merely five aliases in one protocol session. At minimum, Main, Research, Code, Test, and Review must have distinct trusted session identities and cross-session ownership attempts must be rejected.

### Phase K — Interactive multi-agent UX

Extend the existing desktop Agent Bus chat/dashboard into a shared-room view after the backend phases above pass.

The user should be able to interact naturally with the team:

```text
@main continue the plan
@code inspect the repository implementation
@test run the targeted regression
@research report the runtime evidence
@all stop current work
```

The UI should show:

- room timeline
- sender identity (`You`, Main, Code, Research, Test, Review)
- agent presence and current task
- `@` mention suggestions
- message acknowledgement/delivery state where useful
- task/artifact/result references without dumping large payloads
- reconnect-safe history using backend cursors

The UI is not the source of truth. It must project durable Agent Bus/room/session state and must not fabricate worker responses.

### ChatGPT Web position

Do not make direct ChatGPT Web conversation bridging a dependency for this roadmap.

Preferred use:

```text
ChatGPT Web = optional User/Main frontend
RVN Session = worker/session identity
Shared Room = cross-agent/user conversation
Agent Runner = automatic worker execution
Agent Bus = durable coordination source of truth
```

A future ChatGPT Web bridge may be added only as an optional frontend adapter if a stable, supported bidirectional conversation/session interface can be proven. It must not replace RVN session identity or Agent Bus durability.

### Implementation order

Proceed only through phase gates:

```text
H. Shared Agent Room
I. Agent Runner
J. Session Manager
K. Interactive multi-agent UX
L. Installed-runtime end-to-end acceptance
```

Each phase must pass targeted storage/MCP/session tests, typecheck/build where relevant, `git diff --check`, and mojibake inspection before the next phase starts. Do not rerun the full workspace suite after every phase; run it once at final integration unless a failure requires broader coverage.

### Final end-to-end acceptance

The roadmap is complete only when a real installed RVN run demonstrates all of the following:

1. User, Main, Research, Code, Test, and Review appear as distinct participants.
2. Main/Research/Code/Test/Review are bound to distinct trusted RVN/MCP sessions.
3. User can send a room message to one worker, one role, Main, or all participants.
4. An addressed idle worker is picked up by the Runner without manual inbox polling from the user.
5. Workers can exchange `UPDATE`, `RESULT`, `QUESTION`, `BLOCKER`, and `REVIEW` messages through the room/Agent Bus.
6. Messages keep monotonic ordering and acknowledgement state across reconnect.
7. Worker task ownership, role enforcement, locks, artifacts, and worktree boundaries remain enforced.
8. Cross-session spoofing or ownership attempts return structured rejection.
9. Restart/reconnect resumes from durable cursors without duplicate execution or duplicate visible messages.
10. The user can interrupt or redirect a worker through the shared room and the new instruction is auditable.
11. Dashboard/room state matches durable backend state.
12. Generic MCP hosts without Agent Bus/Room support remain compatible and do not advertise duplicate tools.

### Non-goals for this investment

Do not prioritize:

- five separate ChatGPT Web tabs as worker transport
- UI automation that types into ChatGPT Web
- autonomous agent-to-agent negotiation without Main/user visibility
- a second task/message database
- large RBAC redesign
- automatic merge-conflict resolution
- cloud/distributed transport before the local installed workflow is proven

### Single next action

Start with **Phase H only: design and implement the durable Shared Agent Room by extending the existing Agent Bus conventions**. Do not start the Runner, Session Manager, or additional UI behavior until the Shared Room storage/MCP contract and reconnect acceptance pass.

## 54. Phase H Shared Agent Room (2026-08-29)

Phase H backend contract is implemented on top of the existing Agent Bus. No Runner, Session Manager, or new room UI was started.

- Added migration `011_agent_bus_rooms` with durable room metadata, participant membership, room message targeting, and per-participant acknowledgement state.
- Room messages reuse `agent_bus_messages` with a nullable `room_id`; direct Agent Bus message listing remains room-excluded so the existing dashboard projection is unchanged.
- Added repository operations: `createRoom`, `joinRoom`, `leaveRoom`, `sendRoomMessage`, `roomInbox`, `roomHistory`, `roomParticipants`, `roomSnapshot`, and `acknowledgeRoomMessage`.
- Added MCP tools: `room_create`, `room_join`, `room_leave`, `room_send`, `room_inbox`, `room_history`, `room_participants`, `room_snapshot`, and `room_ack`.
- Targets are bounded `@all`, `@role`, or `@agent-id` mentions. User-origin room messages use the durable `user` sender identity; agent-origin mutations remain subject to the trusted MCP session binding.
- Room cursors use the existing monotonic message sequence. Room history and acknowledgement state survive SQLite reconnect.
- Added structured room error codes and mutation-policy/session-binding coverage. Hosts without Agent Bus do not advertise room tools.

### Verification

- Storage Agent Room regression: PASS (`13/13` repository tests), including targeted delivery, reconnect history, participant leave/rejoin, and acknowledgement.
- MCP Agent Bus routing/schema: PASS (`3/3` tests); room tool names are unique and bounded schema rejection is covered.
- Desktop Agent Bus candidate tests: PASS (`5` files / `10` tests); existing live multi-session and dashboard behavior remains green.
- Root typecheck and workspace build: PASS.
- `git diff --check`: PASS. Source mojibake scan is CLEAN (the handoff's literal checklist tokens are excluded by design).

### Limitation

Phase H provides the durable room contract and MCP transport only. Automatic worker execution remains Phase I; a worker must still poll `room_inbox`/`message_inbox` and publish its own result.

### Single next action

Proceed to **Phase I only: Agent Runner**, after promoting a new packaged build if installed-runtime evidence is required. Do not start Session Manager or room UI work before Runner acceptance passes.

## 55. Phase I Agent Runner (2026-08-29)

Phase I adds an RVN-owned bounded worker loop on top of the Phase H room contract. The runner is deterministic when driven through `tick()` and can also schedule polling/heartbeat timers when `autoStart` is enabled.

- Added `packages/mcp-server/src/agent-runner.ts` and exported `AgentRunner` from the MCP server package.
- Runner startup registers/resumes the bound agent, joins the configured room, loads a durable cursor, and sends an idle/busy heartbeat.
- Each tick reads one new room sequence, resolves an optional `taskId` from message metadata, claims/updates/completes the task through the existing Agent Bus rules, publishes `UPDATE`/`RESULT`/`BLOCKER`/`QUESTION`/`REVIEW`, acknowledges the consumed room message, and persists its checkpoint.
- Reconnect resumes from `agent_bus_runner_checkpoints` (`012_agent_bus_runner`) without replaying the acknowledged sequence. Repeated executor blockers publish a final stop report and mark the runner blocked/offline.
- Runner state remains server-owned; the executor is an injected bounded capability and no ChatGPT Web session bridge was introduced.

### Verification

- Runner behavior: PASS (`3/3` targeted MCP-server tests), including durable resume/no duplicate execution, repeated-blocker stop/report, and continuing a task already owned before runner reconnect without re-claiming it.
- Runner checkpoint persistence: PASS (`14/14` storage Agent Bus repository tests), including SQLite reconnect restoration of cursor/task/error state.
- Existing Agent Bus/session/role targeted tests: PASS (`10/10`).
- Root typecheck: PASS.
- Workspace build: PASS (19/20 workspace scope).
- `git diff --check`: PASS (normal Git LF/CRLF warnings only).
- Source mojibake scan: CLEAN.

### Limitation

Phase I supplies the execution loop and checkpoint contract but does not yet manage a fleet of distinct trusted protocol sessions or add runner controls to the desktop UI. Those are Phase J and Phase K responsibilities. The runner accepts a durable task already owned by the same agent when it resumes.

### Single next action

Proceed to **Phase J only: Session Manager**. Add durable session/agent binding and lifecycle presence on top of the existing server request scope; do not start the interactive room UI before the Session Manager acceptance passes.

## 56. Phase J Session Manager (2026-08-29)

Phase J adds explicit server-owned lifecycle rules around the durable Agent Bus agent record.

- Added `packages/mcp-server/src/agent-session-manager.ts` and exported `AgentSessionManager`.
- MCP `agent_register` and `agent_heartbeat` use the manager when configured, receiving the trusted request-scope protocol session rather than a client-supplied conversation/session ID.
- The manager rejects one active protocol session being bound to multiple agents (`SESSION_ALREADY_BOUND`), verifies session ownership for heartbeat/disconnect, exposes bounded durable presence, and supports explicit same-agent reconnect/rebind to the latest trusted session.
- Desktop runtime wires the manager into MCP services and the desktop agent-session bridge. HTTP session close paths disconnect matching Agent Bus agents where the transport exposes a DELETE/session-close signal.
- Existing Agent Bus ownership enforcement still checks the current durable `sessionId`, so a previous session cannot continue task/message/lock/worktree ownership after a rebind.

### Verification

- Session Manager unit/integration tests: PASS (`2/2`), including duplicate-session rejection, explicit disconnect/rebind, status presence, and SQLite reconnect.
- MCP routing/session-binding tests: PASS (`8/8` across runner/session suites), including server-session injection and manager routing.
- Installed-style desktop live Agent Bus acceptance: PASS (`1/1`) across three MCP sessions plus reconnect; dashboard/chat/concurrency candidate tests remained green in the same run except no new regressions.
- Root typecheck: PASS.
- Workspace build: PASS (19/20 workspace scope).
- `git diff --check`: PASS (normal Git LF/CRLF warnings only).
- Source mojibake scan: CLEAN.

### Limitation

The manager uses the durable Agent Bus agent row as its source of truth; transport metadata is request-scoped and no ChatGPT Web conversation bridge is introduced. A client that disappears without a close signal remains online until its next explicit rebind/heartbeat policy check.

### Single next action

Proceed to **Phase K only: Interactive multi-agent UX**. Project the durable shared room/session state into the desktop view with `@` routing and reconnect-safe history; do not add another backend coordination store.

## 57. Phase K Interactive multi-agent UX (2026-08-29)

Phase K now projects the durable Shared Room into the existing desktop Multi-Agent surface while retaining the direct Agent Bus conversation path.

- Added first-class desktop IPC for user-origin room messages through `sendAgentRoomMessage`; the renderer sends bounded `@agent-id` targets and `UPDATE` bodies without fabricating an agent response.
- Desktop dashboard snapshots include the durable `rvn-main-room` summary and the latest 50 room messages. Active durable agents are joined to the room automatically; room history and message sequence remain owned by the Agent Bus repository.
- The Multi-Agent panel now shows room name, participant count, latest sequence, session presence/avatar cards, and a reconnect-safe timeline that merges durable room messages with existing direct Agent Bus messages.
- The composer uses `@` mention suggestions for `@all`, `@main`, role names, agent IDs, and saved display names, and routes user messages through the shared room. Direct Agent Bus messages remain compatible and are still projected in the same timeline.

### Verification

- Desktop shared-room UI regression: PASS (`5/5`), including room timeline/status projection, worker routing, and `@main`/`@all` room targets.
- Desktop targeted acceptance: PASS (`5` files / `12` tests), including IPC room send, dashboard projection, live multi-session ownership/reconnect, and workspace concurrency.
- Root typecheck: PASS.
- Workspace build: PASS (19/20 workspace scope); renderer bundle regenerated with the Phase K surface.
- `git diff --check`: PASS.
- Source mojibake scan: CLEAN.

### Limitation

Phase K supplies the interactive projection and user-to-room send path. Full installed-runtime evidence still needs Phase L packaging and an end-to-end smoke run; the UI does not replace the durable Agent Bus source of truth.

### Single next action

Proceed to **Phase L only: installed-runtime end-to-end acceptance**. Package using `scripts/package-windows.ps1`, verify the generated `rvn-Setup-5.0.0.exe`/`win-unpacked` layout, and run the live room/session workflow against the installed `rvn.exe` without introducing new product behavior.

## 58. Phase L Installed-runtime end-to-end acceptance (2026-08-29)

Phase L was completed against the canonical installed runtime, using the latest desktop build.

- Read and followed the repository packaging convention in `scripts/package-windows.ps1`, `apps/desktop/package.json`, and `apps/desktop/electron-builder.yml`.
- The normal NSIS packaging script reached the packaging step but could not fetch/extract the Windows signing cache because this machine lacks the privilege required for its symbolic link. No source packaging configuration was changed. A CLI-only `signAndEditExecutable=false` fallback built the same `win-unpacked` payload and produced `apps/desktop/dist/installers/rvn-Setup-5.0.0.exe`.
- Promoted the validated `apps/desktop/dist/installers/win-unpacked` payload to `C:\Users\teens\AppData\Local\Programs\rvn`. The source and installed `rvn.exe` SHA-256 are identical: `D28FB19E1EECEA88088411494694AF0401F02029AE24DF3852919F8633271730`.
- The installed runtime is the canonical executable used for final acceptance; no alternate copy was used.

### Verification

- Canonical installed dashboard and MCP client smoke tests: PASS (`2/2`).
- Real installed multi-session room workflow: PASS. Three independent MCP protocol sessions registered Main, Code, and Test; Worker A claimed the task; Worker B was rejected with structured `TASK_ALREADY_CLAIMED`; ownership stayed with Worker A; a room `TASK` dispatch was consumed by the installed runner; Main received the durable `RESULT`; completion/result persisted; room sequence was monotonic and unique (`1, 2, 3`); Main reconnected with a new protocol session; `agent_get` and room history remained durable; the cursor returned no duplicate messages.
- Targeted storage regression: PASS (`14/14`). Targeted MCP runner/session/routing tests: PASS (`12/12`). Targeted desktop Agent Bus/UI/concurrency tests: PASS (`5` files / `13` tests).
- Packaging/identity/layout tests: PASS (`3` files / `9` tests), after removing a contradictory identity assertion that required the same shortcut string to be both present and absent.
- Root typecheck: PASS. Workspace build: PASS (`19/20` workspace scope).
- `git diff --check`: PASS (only normal Git line-ending warnings). Source mojibake scan: CLEAN.

### Root cause fixed during final acceptance

After reconnect, a runner was trying to claim a task that was already durably owned by the same agent. That produced a false blocker and prevented execution. The runner now recognizes an active same-agent owner (`running`, `review`, or `blocked`) and continues without re-claiming; a targeted regression test covers this path.

### Limitation

The standard signing-cache path still requires the missing Windows symbolic-link privilege on this machine, so the final installer was generated through the documented CLI-only fallback. ChatGPT Web remains an optional frontend and is not a transport dependency; worker execution is driven by the server-owned `AgentRunner` contract.

### Single next action

Add a permanent installed multi-session E2E fixture for CI so this exact room/runner/reconnect acceptance runs automatically on future packages.

## 59. Interactive user acceptance gap (2026-08-29)

A real user interaction exposed a gap that the Phase L acceptance did not prove: a message sent from the RVN shared-room UI to an agent did not produce an automatic agent reply.

This changes the interpretation of the current status:

- Phase H room persistence/routing is implemented and verified.
- Phase I provides the `AgentRunner` loop/checkpoint contract, but the product must still prove that a live installed worker runner is actually active and attached to an executable model/agent backend when the user sends a normal room message.
- Phase J session identity/binding remains valid and does not itself cause a worker to execute.
- Phase K UI can persist and route user messages, but routing success is not equivalent to worker execution.
- Phase L proved the installed room/runner/reconnect path under the acceptance workflow, but it is not sufficient evidence for an always-on interactive worker fleet responding from the normal desktop UX.

### Required operational flow

The normal installed product must prove this exact path without a manual inbox poll or a test-only runner driver:

```text
User room message
      |
      v
Durable Shared Room
      |
      v
Live Session Manager
      |
      v
Active Agent Runner for addressed worker
      |
      v
Configured model / agent executor
      |
      v
Agent response -> room_send
      |
      v
User sees durable reply in the same room
```

If any stage is missing, the UI must expose the worker as unavailable/offline rather than making a routed message look like an active agent conversation.

### Updated acceptance criteria

Before the multi-agent system is considered interactively complete, verify all of the following against the primary installed `rvn.exe`:

1. Start RVN normally; do not use a test-only runner harness.
2. Main, Research, Code, Test, and Review expose truthful runner/session presence.
3. Send `@code ping` from the desktop room UI.
4. Code consumes the message automatically without the user manually calling `room_inbox` or `message_inbox`.
5. A real configured model/agent executor generates the response.
6. Code publishes the response through the durable room path and the UI displays it.
7. Repeat with another worker to prove workers are independently addressable.
8. Restart/reconnect RVN and verify no duplicate execution or duplicate reply.
9. If an executor/session is absent, return a durable structured unavailable/blocker state instead of silently waiting forever.
10. Preserve existing role, session-binding, task, lock, worktree, and acknowledgement enforcement.

### Single next action

Diagnose and close the **live Runner activation/executor binding gap** only. Trace one user message from the installed Shared Room through Session Manager -> Agent Runner -> executor -> durable reply, identify the first stage that is not active in normal desktop operation, fix that bounded path, and rerun the `@code ping` installed-runtime acceptance before adding new features or CI fixtures.

## 60. Interactive runner activation and installed reply acceptance (2026-08-29)

The live Runner activation/executor gap is closed with a bounded desktop-side supervisor and a process-stdio fix.

### Root causes

- Desktop UI persisted and routed a room message, but did not activate an `AgentRunner` for the addressed worker or bind it to the configured Codex executor.
- `ProcessManager` left child stdin open even though managed processes have no stdin API. Non-interactive Codex execution could therefore wait indefinitely for input.
- A prior promotion copied only `rvn.exe`; the canonical install still had a stale `resources/app.asar`, so it did not contain the latest runner wiring.

### Minimal fix

- Added `apps/desktop/src/main/agent-runner-supervisor.ts` to activate one runner per durable worker session, route worker output back through the durable room, and publish a durable `BLOCKER` when the worker session/executor is unavailable.
- Wired runner creation, dispatch, stop, and shutdown in `apps/desktop/src/main/desktop-services.ts`. Main remains the coordinating identity; addressed workers respond without duplicating Main's reply.
- Updated `packages/process/src/process-manager.ts` to close stdin for managed non-interactive processes and added a targeted regression test.
- Promoted the complete `win-unpacked` payload, including `resources/app.asar` and MCP stdio resources, to `C:\Users\teens\AppData\Local\Programs\rvn`.

### Live installed result

- Canonical executable: `C:\Users\teens\AppData\Local\Programs\rvn\rvn.exe`.
- The installed Playwright acceptance starts RVN normally, opens two independent MCP protocol sessions (`ui-main` and `ui-code`), registers both agents, and verifies the worker `agent_get` session binding.
- The desktop UI sends `@ui-code` room message `Reply exactly RVN_AGENT_PING and do not edit files.`
- The real configured Codex executor runs, publishes a durable `RESULT` from `ui-code` to `@main`, and the UI displays `RVN_AGENT_PING`.
- Result: `1 passed (14.1s)`.

### Verification

- Desktop runner/session targeted tests: `12/12` passed.
- Process manager targeted tests: `10/10` passed.
- Installed interactive E2E: `1/1` passed (`14.1s`).
- Typecheck: PASS.
- Workspace build: PASS (`19/20` scope).
- Source and installed `rvn.exe` SHA-256 match: `3E7E7A596092FFD11623DBA2F1B9F23BE5B56265EA938BDC9FD60538349260D6`.
- Source and installed `resources/app.asar` SHA-256 match: `49576CDF6FB7DEDB35132EDA65455DC5783B28F7426DE50AF60090B5B2D40EBC`.
- `git diff --check`: PASS (only normal line-ending warnings).
- Mojibake scan: CLEAN.

### Limitation

Codex invocation still intentionally preserves the existing Git-workspace policy. The installed acceptance uses a temporary Git fixture; a non-Git workspace receives a durable executor `BLOCKER` rather than silently waiting.

### Phase status

Phase 1 interactive acceptance: **PASSED**. Existing Agent Bus task, message, session-binding, reconnect, and enforcement behavior remains unchanged.

### Single next action

Proceed with **`task_get`** only.

## 64. Recent MCP activity projection for Agent Work Flow (2026-08-29)

The earlier live check exposed a real correlation gap: `mcp-activity.log` contained calls for session `fb0ed409-e507-495d-9dbc-d7b841175c92`, while the durable Agent Bus database had no agent bound to that protocol session. Completed short calls therefore left every visible card at `รอรับงาน`.

### Minimal fix

- `getDashboard()` now passes the recent MCP work log into the Agent Work Flow projection.
- Agent cards expose `lastActivityToolName` and `lastActivityAt` for the newest completed activity for their bound protocol session.
- If a connected Main agent has no matching durable session, the newest unbound activity (within a 10-minute window) is shown on Main as the latest observed tool; no synthetic durable agent is created.
- An unbound in-flight call is likewise projected to Main only while it is actually running.
- The renderer keeps `รอรับงาน` truthful when no call is in flight and adds `ล่าสุด: <tool>` so completed short calls are visible without falsely claiming they are still running.

### Verification

- Targeted regression/UI/HTTP tests: `3 files / 11 tests` passed.
- Installed canonical E2E against `C:\Users\teens\AppData\Local\Programs\rvn\rvn.exe`: `1/1` passed (`13.8s`), including a real MCP `agent_get` call observed in the installed UI as `ล่าสุด: agent_get` and the durable worker response path.
- Typecheck: PASS.
- Workspace build: PASS (`19/20` scope).
- Packaged `apps/desktop/dist/installers/win-unpacked` and promoted to the canonical install. Source/install hashes match: `rvn.exe` `EFC99952DF6D678073FF007745F5F3443FE2A5E2E5DBF682821FF0D35FE250EB`; `resources/app.asar` `4668CB3608F2C06637DC569556F8A001392324C4789C734837330D6F31F04C19`.
- `git diff --check`: PASS (normal line-ending warnings only).
- Source mojibake scan: CLEAN.

### Phase status

Agent Work Flow now reflects both live in-flight MCP work and recent completed MCP activity. Phase 1 live acceptance remains **PASSED**; no existing Agent Bus or generic MCP behavior was changed.

### Single next action

Proceed with **`task_get`** only.

## 62. Agent Work Flow stage display (2026-08-29)

The desktop Multi-Agent heading is now `Agent Work Flow`. Each session card displays the current workflow step derived from durable Agent Bus state and the associated task record.

### Displayed stages

- `ออฟไลน์` when the protocol session is absent or the agent is offline.
- `รอรับงาน` when the agent is connected without an active task.
- `อยู่ในคิว`, `รับงานแล้ว`, `กำลังทำงาน`, `กำลังตรวจทาน`, `เสร็จแล้ว`, `ติดขัด`, `ล้มเหลว`, or `ยกเลิก` from the durable task/agent state.
- The active task title is shown beneath the stage when a task is attached.

### Verification

- Workflow-stage unit test covers `กำลังทำงาน`, `รอรับงาน`, and `ออฟไลน์`.
- Desktop UI/IPC targeted tests: `2 files / 9 tests` passed.
- Installed E2E against `C:\Users\teens\AppData\Local\Programs\rvn\rvn.exe`: `1/1` passed (`15.5s`), including the `Agent Work Flow` heading, visible `รอรับงาน` stage, absence of the removed Chat surface, and a durable worker response through MCP room routing.
- Typecheck: PASS.
- Workspace build: PASS (`19/20` scope).
- `git diff --check`: PASS (only normal line-ending warnings).
- Source mojibake scan: CLEAN.

### Limitation

The dashboard exposes the durable stage snapshot at refresh cadence; it does not add a separate chat or manual workflow control. Agent-to-agent communication continues through MCP/Agent Bus.

### Single next action

Proceed with **`task_get`** only.

## 61. Desktop Chat surface removed (2026-08-29)

The user-facing desktop Chat/Coordination panel has been removed from the Multi-Agent dashboard. The durable Agent Bus and MCP room/message APIs remain available for agent-to-agent communication; only the desktop conversation history and composer were removed.

### Changes

- Removed the `COORDINATION` timeline, room banner, message bubbles, `@agent` composer, local chat-message state, and mention resolver from `apps/desktop/src/renderer/features/home/ControlCenterPage.tsx`.
- Removed the associated chat-only CSS from `apps/desktop/src/renderer/styles.css` while retaining session cards, profiles, alerts, task/resource counters, and the backend Agent Bus.
- Updated `apps/desktop/tests/agent-sessions-ui.test.ts` to assert that the desktop Chat surface is absent.
- Updated `apps/desktop/e2e/desktop-agent-runner.e2e.ts` to assert no composer or `COORDINATION` heading is rendered, while continuing to verify that routed MCP room messages still reach the worker backend.

### Verification

- Desktop UI and Agent Bus IPC targeted tests: `2 files / 8 tests` passed.
- Installed runtime E2E: `1/1` passed (`12.1s`), including absence of the Chat surface and a durable worker response through MCP room routing.
- Typecheck: PASS.
- Workspace build: PASS (`19/20` scope).
- `git diff --check`: PASS (only normal line-ending warnings).
- Source mojibake scan: CLEAN.

### Limitation

Agent communication remains MCP/Agent Bus based and is no longer displayed or composed from the desktop dashboard. To send a message, use the MCP room tools from the relevant agent session.

### Single next action

Proceed with **`task_get`** only.

## 63. Activity-driven Agent Work Flow status (2026-08-29)

The desktop `Agent Work Flow` cards no longer infer “working” from a stale `busy` status alone. The backend correlates the durable agent's bound MCP protocol session with the live `ActivityTracker` in-flight calls and exposes the current `activeToolName` through the dashboard IPC snapshot.

### Minimal fix

- Added optional `activeToolName` to the Agent Bus dashboard agent projection and preload validation.
- `getDashboard()` now joins in-flight MCP calls to agents by their protocol session id. A completed call immediately clears the field.
- The renderer maps real active tools to role-specific stages: Main `กำลังวิเคราะห์`, Code file mutations `กำลังเขียน`, Research discovery `กำลังค้นคว้า`, Test verification `กำลังทดสอบ`, and Review inspection `กำลังตรวจทาน`.
- With no active call, a connected agent with no durable task is `รอรับงาน`, even if its persisted status is still `busy`. Existing durable task stages remain the fallback when a task is attached.
- Spinner/working alerts now use the live active-tool signal rather than `currentTaskId` alone.

### Verification

- Targeted UI workflow tests: `4/4` passed, including all five role stages and busy-without-activity returning `รอรับงาน`.
- Desktop Agent Bus dashboard test: `1/1` passed, proving active tool correlation and clearing after completion.
- MCP HTTP integration tests: `6/6` passed, proving in-flight calls carry the protocol session id used for correlation.
- Combined targeted result: `3 files / 11 tests` passed.
- Typecheck: PASS.
- Workspace build: PASS (`19/20` scope).
- Installed canonical E2E against `C:\Users\teens\AppData\Local\Programs\rvn\rvn.exe`: `1/1` passed (`13.1s`), including visible `รอรับงาน` when no MCP call is active and durable worker routing.
- Packaged `apps/desktop/dist/installers/win-unpacked` and promoted the complete payload to the canonical install. `rvn.exe` SHA-256 matches source/install (`9FC323E90CA009C1501D58B95B4A08097CF7AA4CF7B4AB63A8FB18E35EC4CB99`); `resources/app.asar` matches (`093195EC8D5B3C0691934AE326706A8F5D47673D9BF8770A8BF597F165503C8A`).
- `git diff --check`: PASS (normal line-ending warnings only).
- Source mojibake scan: CLEAN.

### Limitation

The live phase is visible while a MCP tool request is in flight; short calls may complete before the dashboard's two-second refresh observes them. Durable task state remains authoritative for attached work after the request completes.

### Phase status

Phase 1 live Agent Work Flow acceptance: **PASSED**. No generic MCP behavior or existing Agent Bus tool behavior was changed.

### Single next action

Proceed with **`task_get`** only.
