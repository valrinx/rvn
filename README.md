<p align="center">
  <img src="assets/logo/logo-256x256.png" width="150" alt="RVN logo" />
</p>

<h1 align="center">RVN</h1>

<p align="center">
  Windows-first local AI agent runtime and MCP gateway.<br />
  218 configurable tools for files, Git, processes, Windows, browser automation, WSL, Office, recovery, skills, and child MCP servers.
</p>

<p align="center">
  <a href="https://github.com/valrinx/rvn/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/valrinx/rvn" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-0078D4" />
  <img alt="MCP tools" src="https://img.shields.io/badge/MCP-218%20tools-5B8CFF" />
</p>

## ติดตั้งแบบง่ายที่สุด

1. เปิดหน้า [Latest Release](https://github.com/valrinx/rvn/releases/latest)
2. ดาวน์โหลด `rvn-Setup-4.10.0.exe`
3. เปิดไฟล์และกดติดตั้ง จากนั้นเปิด **RVN** จาก Start Menu
4. เข้า **Projects** เพื่อเพิ่มโฟลเดอร์งาน แล้วเลือกเป็น Active Project
5. เข้า **Settings** เลือกระดับสิทธิ์ที่ต้องการ

ตัวติดตั้งรวม Desktop, MCP server และ Node.js runtime ส่วนตัวไว้แล้ว ผู้ใช้ทั่วไปไม่ต้องติดตั้ง Node.js, pnpm หรือ clone source code

> Windows อาจแสดง SmartScreen หาก release ยังไม่ได้ลงนามด้วย certificate ที่ Windows เชื่อถือ ตรวจชื่อไฟล์และ SHA-256 ใน release ก่อนเปิดเสมอ

## Current version: v4.10.0

The v4.10.0 release target and runtime contract contain **218 configurable tools**, with **212 advertised by default** because the six `codex_*` delegation tools are opt-in. The Windows installer for the current version is `rvn-Setup-4.10.0.exe`.

## RVN คืออะไร

RVN ทำหน้าที่เป็นสะพานระหว่าง AI client กับเครื่อง Windows ของผู้ใช้ผ่านมาตรฐาน MCP โดยรวมความสามารถที่จำเป็นไว้ใน runtime เดียว:

- อ่าน ค้นหา สร้าง และแก้ไขไฟล์ภายในขอบเขตที่กำหนด
- ตรวจ Git และเรียกคำสั่ง Git ที่ผ่าน policy
- รัน build, test, lint, typecheck และ process แบบ foreground/background
- ควบคุม Windows UI, browser, clipboard, notification และ screen tools
- ใช้งาน WSL, Office, PDF/document adapters และ local databases
- โหลด Skills และเชื่อม MCP server ลูกผ่าน `mcp_list`, `mcp_describe`, `mcp_call`
- เก็บ Work Log, Live Logs, checkpoints และ Recovery Trash
- เชื่อม ChatGPT ผ่าน OpenAI Secure MCP Tunnel

ข้อมูลและ process ทำงานอยู่บนเครื่องผู้ใช้ RVN เปิด HTTP MCP เฉพาะ loopback (`127.0.0.1`) และรองรับ STDIO สำหรับ client ในเครื่อง ส่วน Secure Tunnel เป็นการเชื่อมต่อ HTTPS ขาออก ไม่เปิด public inbound port

## ภาพรวมระบบ

```text
AI client
   ├─ Local STDIO: Claude Desktop / FreeBuff / MCP clients
   └─ Secure Tunnel: ChatGPT Web
            │
            ▼
       RVN MCP Gateway
            │
   ┌────────┼───────────┬───────────┐
   ▼        ▼           ▼           ▼
Files/Git  Processes   Windows/UI  Skills/Child MCP
   │        │           │           │
   └────────┴──────┬────┴───────────┘
                   ▼
       Policy + Active Project boundary
                   ▼
      Audit, Checkpoints, Recovery Trash
```

### ส่วนประกอบหลัก

| Component | หน้าที่ |
| --- | --- |
| Desktop | Dashboard, Projects, Settings, Git, Work Log, Live Logs, Doctor และ Tunnel control |
| MCP Gateway | ตรวจ schema, session, permission, run budget และ dispatch เครื่องมือ |
| Workspace boundary | ผูก mutation กับ Active Project และตรวจ canonical path/reparse-point escape |
| Capability backends | Files, Git, process, Windows, browser, WSL, Office, database และ media |
| Recovery layer | checkpoint ก่อนแทนที่ไฟล์ และ Recovery Trash สำหรับรายการที่รองรับ |
| Extension layer | ค้น Skills และเชื่อม local child MCP server |
| Storage | SQLite state, settings, audit metadata และ durable task state |
| Secure Tunnel | ส่ง MCP ผ่าน outbound HTTPS ไปยัง ChatGPT โดยใช้ Desktop HTTP MCP |

## เชื่อมกับ Claude Desktop

เพิ่ม server นี้ใน `claude_desktop_config.json` แล้วปิด/เปิด Claude Desktop ใหม่:

```json
{
  "mcpServers": {
    "rvn": {
      "command": "C:\\Users\\YOUR_NAME\\AppData\\Local\\Programs\\rvn\\rvn-node.exe",
      "args": [
        "C:\\Users\\YOUR_NAME\\AppData\\Local\\Programs\\rvn\\rvn-mcp-stdio.cjs"
      ]
    }
  }
}
```

## เชื่อมกับ FreeBuff

เพิ่มใน `%USERPROFILE%\.agents\mcp.json`:

```json
{
  "mcpServers": {
    "rvn": {
      "command": "C:\\Users\\YOUR_NAME\\AppData\\Local\\Programs\\rvn\\rvn-node.exe",
      "args": [
        "C:\\Users\\YOUR_NAME\\AppData\\Local\\Programs\\rvn\\rvn-mcp-stdio.cjs"
      ]
    }
  }
}
```

จากนั้นเปิด **Workspace settings → Connectors → rvn → Review** และเลือก **Safe only** สำหรับค่าเริ่มต้นที่แนะนำ

## เชื่อมกับ ChatGPT Web

1. ติดตั้งและลงชื่อเข้าใช้ RVN Desktop
2. เปิด **Settings → OpenAI Secure MCP Tunnel**
3. ใส่ Runtime API key ที่มีสิทธิ์ `Tunnels: Read + Use`
4. กด **Configure Tunnel** แล้ว **Start Tunnel**
5. ใน ChatGPT ให้ Refresh connector และเริ่มแชตใหม่

Tunnel ใช้ Active Project และ permission profile จาก Desktop จึงควรเปิด RVN ไว้ระหว่างใช้งาน

ในโหมดนี้ Secure Tunnel จะชี้ไปที่ **Desktop loopback HTTP MCP** ไม่ใช่ headless STDIO โดย profile ตัวอย่างใน ChatGPT คือ `sample_mcp_remote_no_auth` หลังเชื่อมต่อสำเร็จให้ Refresh connector และเริ่มแชตใหม่

### Session resilience / การทำงานต่อเนื่อง

งานที่ใช้เวลานานควรรันเป็น background task แล้วเก็บ task ID ไว้ติดตามผ่าน status, logs และ result แทนการรอ request เดียวนานเกินไป หากเกิดปัญหาให้ใช้ **Capture Incident** ก่อนรีสตาร์ต เพื่อเก็บรายงานแบบจำกัดขนาดและลบข้อมูลลับที่รู้จักออก

Desktop และสคริปต์ `start-rvn-tunnel.ps1` ใช้ profile lock เดียวกัน จึงไม่เปิด tunnel ซ้ำ หากต้องตรวจ tunnel ที่ตั้งค่าแล้ว ให้ใช้ runtime health address ที่ client รายงานแทนการกำหนดพอร์ตตายตัว:

```powershell
$profile = Join-Path $env:APPDATA 'tunnel-client'
$tc = if ($env:RVN_TUNNEL_CLIENT_PATH) { $env:RVN_TUNNEL_CLIENT_PATH } else { Join-Path $env:USERPROFILE 'Downloads\tunnel\tunnel-client.exe' }
if (-not (Test-Path -LiteralPath $tc -PathType Leaf)) { throw "Missing tunnel-client executable: $tc" }
& $tc doctor --profile rvn --profile-dir $profile --explain
if ($LASTEXITCODE -ne 0) { throw 'tunnel-client doctor failed' }
$match = Select-String -LiteralPath (Join-Path $profile 'rvn-tunnel.log') -Pattern 'health.*(?:listening|listen_addr).*?(127\.0\.0\.1|localhost):(\d{2,5})' | Select-Object -Last 1
if ($null -eq $match) { throw 'No runtime health address was reported' }
$address = [regex]::Match($match.Line, '(127\.0\.0\.1|localhost):(\d{2,5})').Value
Invoke-WebRequest -UseBasicParsing "http://$address/healthz"
```

## Security and operational model

## Permission และความปลอดภัย

RVN มีสิทธิ์สูงและไม่ใช่ OS sandbox โปรดใช้กับเครื่องและ repository ที่เชื่อถือเท่านั้น

- **Safe** — เน้นการอ่านและปฏิเสธ mutation ส่วนใหญ่
- **Balanced** — อนุญาตงานพัฒนาทั่วไป พร้อมถามในจุดเสี่ยง
- **Full** — อนุญาต mutation ปกติใน Active Project แต่การลบ/ทำลายข้อมูลและ opaque actions ยังถูกตรวจแยก
- **Custom** — เลือก permission รายความสามารถ
- **Strict Roots** — จำกัด visibility ของ standalone STDIO ให้เฉพาะ root ที่เลือก

หลักสำคัญ:

- Mutation ถูกผูกกับ Active Project ที่ผู้ใช้เลือกใน Desktop
- คำสั่งต้องผ่าน typed policy และ host approval ตามระดับความเสี่ยง
- การเขียนทับที่รองรับจะสร้าง checkpoint หรือ backup ก่อน
- Secret-like files อาจถูกอ่านได้หาก policy และ root อนุญาต อย่าเปิด root ที่ไม่ต้องการแชร์กับ AI
- Audit ไม่บันทึก API key, password หรือ environment values แบบเต็ม

## เครื่องมือสำคัญ

| กลุ่ม | ตัวอย่าง |
| --- | --- |
| Workspace/File | `workspace_list`, `read_file`, `search_text`, `edit_file`, `apply_patch` |
| Git | `git_status`, `git_diff`, `git_log`, `git` |
| Process/Project | `process_start`, `shell`, `project_test`, `project_build` |
| Recovery | `list_checkpoints`, `restore_checkpoint`, `list_recovery_items`, `restore_deleted_file` |
| Windows | `accessibility`, `input_event`, `vision`, `window`, `clipboard` |
| Browser | `dom_cdp`, `web_fetch` |
| Extensions | `skills_list`, `skills_read`, `mcp_list`, `mcp_describe`, `mcp_call` |
| Operations | `health`, `system_info`, `session_handoff`, `verify_incremental` |

ดูสัญญาเครื่องมือฉบับเต็มที่ [Tool Contract](docs/architecture/TOOL_CONTRACT.md) และโครงสร้าง runtime ที่ [Upgrade Architecture](docs/architecture/UPGRADE_ARCHITECTURE.md)

<!-- BEGIN GENERATED README TOOL REGISTRY -->
## Complete MCP tool catalog (218 configurable tools; 212 advertised by default)

This index is generated from the current `ToolRegistry`, not copied from an older release document. Optional/planned tools still appear in the advertised contract and report their availability/requirements at runtime where applicable.

| # | Tool | Permission | Runtime description |
| ---: | --- | --- | --- |
| 1 | `workspace_list` | DANGEROUS | List all registered workspaces/drive roots available to rvn. Call this first to discover workspace IDs. Entries include kind=machine_root\|project. |
| 2 | `workspace_register` | WRITE | Register an existing project directory under a machine-root drive. parentWorkspaceId must be a machine root from workspace_list. Idempotent for the same path. |
| 3 | `workspace_info` | READ | Return the configured workspace summary. |
| 4 | `workspace_tree` | READ | List a bounded workspace tree. Absolute path does not require workspaceId. |
| 5 | `project_snapshot` | READ | Return a bounded project snapshot without source contents. |
| 6 | `read_file` | READ | Read a workspace file as UTF-8 text or as an image/binary payload. Absolute paths (C:\...) do not require workspaceId. For large files or an unknown location, prefer search_text first and then read_file_page for the relevant range instead of reading the whole file. |
| 7 | `read_files` | READ | Read up to twenty bounded workspace files in parallel. Absolute paths do not require workspaceId. For large files, locate text with search_text and page with read_file_page instead of loading entire files. |
| 8 | `search_files` | READ | Search workspace filenames with automatic context-economy filters; set includeIgnored for an explicit full path search. Absolute path does not require workspaceId. |
| 9 | `search_text` | READ | Preferred tool to locate relevant code/lines before reading files. Searches workspace text using direct ripgrep arguments with automatic binary/generated filters; set includeIgnored for an explicit full path search. Absolute path does not require workspaceId. Follow with read_file_page for large files. |
| 10 | `git_status` | READ | Inspect parsed read-only Git status. For writes (init, add, commit, remote, push, rm, clean, reset) use the git tool. |
| 11 | `git_diff` | READ | Return a bounded read-only Git diff. For writes use the git tool. |
| 12 | `git_log` | READ | Return bounded structured Git history. For writes use the git tool. |
| 13 | `git` | EXECUTE | Run a Git subcommand with a separate args array. Full Access runs ordinary read and non-destructive Git mutations without confirmation. Destructive/data-loss Git forms ask unless their exact scoped family is enabled for auto-approval; scope overrides, aliases, unsafe pathspecs, unknown commands, and destructive remote/history rewrites remain guarded or denied. Mutating calls require workspaceId to match the host-selected Active Project. Do not wrap Git in PowerShell/cmd. |
| 14 | `write_file` | WRITE | Create or replace a UTF-8 text file and missing parents. Balanced/Safe refuse existing targets unless overwriteExisting is explicit; Full may replace an existing target without a confirmation prompt and still creates a checkpoint. Prefer edit_file for narrow repairs. |
| 15 | `apply_patch` | WRITE | Apply reviewed whole-file replacement content to at most twenty files. Existing targets are checkpointed first; Full profile does not prompt for non-destructive replacement. Prefer edit_file for narrow repairs. |
| 16 | `edit_file` | WRITE | Prefer this for narrow repairs. Replaces exact text only when the expected occurrence count matches, checkpoints the original, and refuses conflicts instead of rewriting an unverified whole file. Full Access performs ordinary edits without a confirmation prompt; destructive deletion remains separately guarded. |
| 17 | `move_file` | WRITE | Move a file or directory within the Active Project, creating missing destination parents. Full Access performs ordinary moves without a confirmation prompt; conflicting or destructive forms remain policy-gated. |
| 18 | `copy_file` | WRITE | Copy a file or directory within one workspace, creating missing destination parents. |
| 19 | `delete_file` | DANGEROUS | Move one file or empty directory from the host-selected Active Project into Recovery Trash. This structured delete can be auto-approved when its saved setting is enabled and the exact target is proven safe. Other destructive Git/shell/WSL families have separate exact-scope settings; critical paths, workspace roots, non-empty directories, ambiguous paths, and mismatched workspaces remain guarded. Returns a recoveryId and local recovery path. |
| 20 | `list_recovery_items` | READ | List trusted Recovery Trash entries for one workspace, including deleted items, binary pre-replacement backups, original paths, timestamps, payload availability, and the local Recovery Trash root. |
| 21 | `restore_deleted_file` | WRITE | Restore one Recovery Trash item to its original path. Deleted-item restores refuse existing targets. A pre-replacement restore first backs up the current live version for undo, then restores the older binary or text payload. Full runs recoverable restores without an extra prompt; stricter profiles may require confirmation. The operation remains scoped to the recorded workspace. |
| 22 | `list_checkpoints` | READ | List encrypted pre-mutation checkpoints for one workspace without returning saved file content. |
| 23 | `restore_checkpoint` | WRITE | Restore a reviewed pre-mutation checkpoint. Requires explicit confirmation and creates a new rollback checkpoint before replacing current content. |
| 24 | `process_start` | EXECUTE | Immediate-return managed process launcher. Normal policy-allowed commands run without confirmation; only risky command shapes, protected scope changes, or permission-profile ASK decisions require explicit confirmation. Starts one policy-checked executable with separate arguments and returns processId as soon as the child is spawned; it never waits for command completion. Follow with process_status/process_logs/process_stop. For restart-safe durable work, use shell, whose MCP run mode is forced to background. |
| 25 | `process_list` | READ | List managed process handles owned by this client in a workspace, including launches whose response was cancelled. |
| 26 | `process_status` | READ | Read one status snapshot for an owned process handle. Do not tight-poll this tool; use project_* for normal project verification, or shell background + durable task_id for work expected to exceed ~5 minutes. |
| 27 | `process_logs` | READ | Read bounded logs for an owned process handle. Prefer one bounded log read after meaningful progress rather than repeated status polling. |
| 28 | `process_stop` | EXECUTE | Stop an owned managed process tree after explicit chat confirmation. |
| 29 | `project_dev` | EXECUTE | Immediate-return launcher for the detected project dev command. The gateway previews the exact executable/argv for host approval and re-resolves it immediately before spawn; any change requires fresh approval. Project-owned script bodies remain opaque and are not covered by Recovery Trash. |
| 30 | `project_test` | EXECUTE | Immediate-return launcher for the detected project test command. The gateway previews the exact executable/argv for host approval and re-resolves it immediately before spawn; any change requires fresh approval. Project-owned script bodies remain opaque and are not covered by Recovery Trash. |
| 31 | `project_lint` | EXECUTE | Immediate-return launcher for the detected project lint command. The gateway previews the exact executable/argv for host approval and re-resolves it immediately before spawn; any change requires fresh approval. Project-owned script bodies remain opaque and are not covered by Recovery Trash. |
| 32 | `project_typecheck` | EXECUTE | Immediate-return launcher for the detected project typecheck command. The gateway previews the exact executable/argv for host approval and re-resolves it immediately before spawn; any change requires fresh approval. Project-owned script bodies remain opaque and are not covered by Recovery Trash. |
| 33 | `project_build` | EXECUTE | Immediate-return launcher for the detected project build command. The gateway previews the exact executable/argv for host approval and re-resolves it immediately before spawn; any change requires fresh approval. Project-owned script bodies remain opaque and are not covered by Recovery Trash. |
| 34 | `codex_status` | READ | Report local Codex installation and capabilities without credential inspection. |
| 35 | `codex_run` | EXECUTE | Delegate an instruction to the local Codex CLI in the Active Project. Starting Codex always requires explicit chat confirmation and userConfirmed: true. |
| 36 | `codex_task_list` | READ | List local Codex task handles owned by this client, including launches whose response was cancelled. |
| 37 | `codex_task_status` | READ | Read status for an owned Codex task. |
| 38 | `codex_task_logs` | READ | Read bounded logs for an owned Codex task. |
| 39 | `codex_stop` | EXECUTE | Stop an owned Codex task process after explicit chat confirmation. |
| 40 | `shell` | EXECUTE | Non-blocking command runner for system operations and CLI tasks. MCP run calls are ALWAYS forced to execution=background, even if a client requests foreground or auto, so the call returns a task_id immediately instead of waiting for command completion. Follow with status/logs/result; wait uses the user-configurable MCP poll window (5-60 seconds, default 5). After one or two checks still show running, do not keep polling in the same chat turn: preserve task_id and return control so the durable task can continue without risking a ChatGPT turn timeout. Full Access runs ordinary policy-allowed commands without confirmation. Destructive/data-loss command forms ask unless an exact scoped destructive family is enabled for auto-approval; broad, recursive, critical, outside-project, or unparseable destructive forms remain interactive. dry_run and task observation are non-mutating. Active Project is the default cwd/ownership context, but an explicitly absolute cwd outside it may be used when the active capability policy allows that location; executable paths are never required to live inside the Active Project. |
| 41 | `dom_cdp` | DANGEROUS | Default for web-page DOM work inside managed Chrome: inspect content, query selectors, click, type, navigate, evaluate JavaScript, wait, manage tabs, and capture screenshots. Any action that can change local or remote state requires explicit chat confirmation and userConfirmed: true. Use steps to batch related DOM actions in one call. |
| 42 | `accessibility` | DANGEROUS | Semantic native Windows UI tool. Inspect UI trees and named controls, then click, focus, read or set values, select controls and menus, or manage a native element. Prefer shell for direct system work and dom_cdp for web pages. |
| 43 | `input_event` | DANGEROUS | Low-level keyboard and pointer fallback. Use only when DOM/CDP and Accessibility cannot operate the target. Supports text, keys, mouse movement, clicks, drag, scroll, held buttons, release_all, and batched sequences. |
| 44 | `vision` | READ | Visual and OCR fallback for content unavailable through DOM or Accessibility. Capture a display, window, or region, or run local Vision OCR. It never clicks or types. |
| 45 | `vision_annotated_capture` | READ | Capture a local Windows screen/region/window and return a short-lived Set-of-Marks observation with numbered bounds, a content hash, and an annotated PNG. This tool only observes; use ui_target_action for a separately gated action. |
| 46 | `ui_target_action` | DANGEROUS | Act on one mark from a current vision_annotated_capture observation. The observation ID, optional hash, TTL, workspace owner, and current Accessibility element are checked before the action is sent. |
| 47 | `window` | DANGEROUS | Direct native Windows window management. List, inspect, activate, move, resize, minimize, maximize, restore, or close windows without raw coordinates when a window operation is sufficient. |
| 48 | `health` | READ | Diagnostics only. Check all rvn backends or one public tool after a failure, when asked for status, or while diagnosing permissions. Do not use as a preflight before normal work. |
| 49 | `system_info` | READ | Read-only system information: OS, CPU, memory, disks, battery, uptime, and top processes by memory. Use for environment checks and diagnostics. |
| 50 | `notification` | EXECUTE | Show a Windows notification (toast when BurntToast is installed, balloon otherwise). Use to tell the user when a long task finishes. |
| 51 | `file_dialog` | EXECUTE | Open a native Windows file open/save dialog and return the chosen path(s). The dialog does not read or write files itself; use the guarded file tools afterwards. |
| 52 | `clipboard` | DANGEROUS | Read or write the Windows clipboard (text, or PNG image as base64). Use get_text/get_image to read and set_text to write. |
| 53 | `web_fetch` | DANGEROUS | Fetch an http/https URL (GET/POST/PUT/DELETE/HEAD) with bounded size and timeout. Every POST, PUT, or DELETE requires explicit chat confirmation and userConfirmed: true; dry_run remains safe. Returns status, headers, and text or base64 body. |
| 54 | `audio` | DANGEROUS | Record the microphone to a WAV file or play a local audio file through MCI. Recording requires the host-selected Active Project workspaceId, explicit confirmation, and a Recovery Trash backup before an existing output is replaced. record is synchronous and limited to 600 seconds. Use stop to abort an ongoing record/play. |
| 55 | `screen_record` | DANGEROUS | Record the screen to an MP4 using ffmpeg gdigrab (requires ffmpeg on PATH). Starting a recording requires the host-selected Active Project workspaceId, explicit confirmation, and a Recovery Trash backup before an existing output is replaced. start spawns a background capture, status checks it, stop finalizes the file. Recording stops automatically after 3600 seconds. |
| 56 | `office` | DANGEROUS | Automate Excel, Word, PowerPoint, or Outlook through COM. Every write, replace, merge, or save_as action requires an Active Project workspaceId, explicit chat confirmation, userConfirmed: true, and a Recovery Trash backup before an existing target is replaced. Requires Microsoft Office installed. |
| 57 | `scheduler` | DANGEROUS | Manage Windows scheduled tasks with schtasks.exe. list is read-only; create, run, and delete always require explicit chat confirmation and userConfirmed: true. |
| 58 | `wsl_exec` | EXECUTE | Non-blocking WSL2 developer runner. MCP run calls are ALWAYS forced to background and return a task_id immediately; foreground/auto requests are normalized by the server. Follow with status/logs/result; wait uses the user-configurable MCP poll window (5-60 seconds, default 5). After one or two checks still show running, do not keep polling in the same chat turn: preserve task_id and return control so the durable task can continue without risking a ChatGPT turn timeout. It executes one Linux executable with argv, an explicit distribution, and a Windows workspace cwd, and never accepts shell command strings. Full Access runs ordinary WSL commands without confirmation. Destructive/data-loss forms ask unless an exact scoped WSL destructive family is enabled for auto-approval; broad, recursive, outside-project, or unparseable forms remain interactive. Active Project remains the default cwd/ownership context, while an explicitly requested external cwd may be used when the capability policy allows it; the Linux executable itself is not restricted to the Active Project. |
| 59 | `wsl_fs` | READ | Translate paths and inspect metadata between a registered Windows workspace and WSL without exposing raw \\wsl$ read/write access. |
| 60 | `skills_list` | DANGEROUS | List local agent skills discovered from Cursor, Claude, Agents, workspace skill roots, and rvn settings. Filter with query or source. |
| 61 | `skills_read` | DANGEROUS | Read a local skill SKILL.md (or a relative file inside the skill folder). Follow the skill instructions with rvn tools and mcp_call. |
| 62 | `mcp_list` | READ | List local MCP servers discovered from Cursor, Claude Desktop, and rvn settings. This inspection is read-only and does not flatten child tools into the rvn catalog. |
| 63 | `mcp_describe` | READ | Connect to one local MCP server (if needed) and return its tool names, descriptions, and input schemas. This operation only inspects the child tool catalog. |
| 64 | `mcp_call` | DANGEROUS | Call a tool on a discovered local MCP server. Child side effects and filesystem/network scope are controlled by that child server, so every mcp_call is treated as opaque mutation and requires explicit chat plus host exact-action approval. |
| 65 | `workspace_context` | READ | Aggregate ranked workspace context with snippets, symbols, Git/test relevance, economy metadata, and continuation; automatic discovery can be explicitly expanded. |
| 66 | `workspace_context_continue` | READ | Continue a workspace_context result without discarding unreturned candidates. |
| 67 | `workspace_full_scan` | READ | Enumerate workspace files with full access by default; set includeIgnored false to use the persistent automatic index. |
| 68 | `workspace_full_scan_continue` | READ | Continue a workspace_full_scan result page. |
| 69 | `workspace_snapshot` | READ | Return workspace identity and project snapshot metadata without source contents. |
| 70 | `search_all` | READ | Search text and filenames across one or all registered workspaces with automatic economy filters or an explicit includeIgnored override. |
| 71 | `read_many_files` | READ | Read many workspace files in parallel while preserving one result or error per requested path. |
| 72 | `read_file_page` | READ | Preferred reader for large files after search_text identifies the relevant area. Reads a deterministic line chunk with explicit continuation instead of silently truncating or loading the whole file. |
| 73 | `read_file_page_continue` | READ | Continue read_file_page from the next deterministic line chunk only when more surrounding context is needed; avoid re-reading earlier pages. |
| 74 | `workspace_index` | READ | Build or refresh the persistent workspace index using automatic context filters unless ignored paths are explicitly included. |
| 75 | `workspace_index_status` | READ | Return persistent index metadata and lossless watcher queue telemetry. |
| 76 | `workspace_index_watch` | READ | Watch all workspace paths and incrementally re-index only changed paths with configurable debounce/concurrency. |
| 77 | `workspace_index_stop` | READ | Stop a workspace watcher after draining all queued path updates. |
| 78 | `session_handoff` | READ | Create a concise same-chat continuation message from the real phase tracker, current git status/diff, and durable background task IDs. Use near the end of a run so the next run can resume without re-reading the whole project. If a tool schema looks stale, Refresh connector first; open a new chat only if refresh does not fix it. |
| 79 | `verify_incremental` | EXECUTE | Run the detected project typecheck only when the current git status/diff fingerprint changed. Starting a new verification process requires explicit user confirmation. Returns cache=hit when unchanged and cache=miss after a new verification. Prefer this during iterative edits; use project_test/project_lint/project_build only when that specific verification is needed. For full suites or packaging expected to exceed ~5 minutes, launch a durable shell background task and record its task_id in the tracker. |
| 80 | `symbol_search` | READ | Search indexed symbols across the workspace. |
| 81 | `find_definition` | READ | Find deterministic symbol definitions. |
| 82 | `find_references` | READ | Find textual and indexed references to a symbol. |
| 83 | `find_implementations` | READ | Find interface and class implementations. |
| 84 | `call_hierarchy` | READ | Return a deterministic call hierarchy approximation. |
| 85 | `import_graph` | READ | Return indexed imports and exports for a module. |
| 86 | `dependency_graph` | READ | Return package and module dependency metadata. |
| 87 | `module_graph` | READ | Return the workspace module graph. |
| 88 | `type_search` | READ | Search indexed TypeScript, JavaScript, and Python types. |
| 89 | `trace_symbol` | READ | Combine definition, references, imports, tests, and recent context. |
| 90 | `context_ranking` | READ | Explain ranking signals without removing lower-ranked context. |
| 91 | `debug_context` | READ | Gather deterministic debugging context and continuation metadata. |
| 92 | `review_context` | READ | Gather code-review context. |
| 93 | `change_context` | READ | Gather changed files, symbols, dependencies, and tests. |
| 94 | `symbol_context` | READ | Gather context around a symbol. |
| 95 | `test_context` | READ | Gather relevant test context. |
| 96 | `dependency_context` | READ | Gather dependency-related context. |
| 97 | `git_context` | READ | Gather Git status, diff, and history context. |
| 98 | `frontend_context` | READ | Gather frontend project context. |
| 99 | `backend_context` | READ | Gather backend project context. |
| 100 | `route_intent` | READ | Classify a prompt with a deterministic, overridable route. |
| 101 | `recipe_list` | READ | List built-in and user recipe names. |
| 102 | `recipe_describe` | READ | Describe a recipe plan and permissions. |
| 103 | `recipe_run` | EXECUTE | Preview or run a deterministic recipe plan. |
| 104 | `dry_run` | READ | Return a no-side-effect execution preview. |
| 105 | `review_changes` | READ | Review current Git changes and affected context. |
| 106 | `changed_symbols` | READ | Find symbols in changed files. |
| 107 | `affected_modules` | READ | Find modules affected by current changes. |
| 108 | `git_history_context` | READ | Return relevant recent Git history. |
| 109 | `git_blame_context` | READ | Return line ownership context for a file. |
| 110 | `discover_tests` | READ | Discover project tests without imposing an execution limit. |
| 111 | `run_affected_tests` | EXECUTE | Plan or run tests affected by changed files. |
| 112 | `test_failures` | READ | Summarize recorded test failures. |
| 113 | `coverage_context` | READ | Return coverage context when project tooling provides it. |
| 114 | `test_history` | READ | Return recent test execution history. |
| 115 | `cache_stats` | READ | Return shared cache hit/miss telemetry. |
| 116 | `cache_clear` | WRITE | Clear safe local runtime caches. |
| 117 | `cache_invalidate` | WRITE | Invalidate cache entries for a path or workspace. |
| 118 | `hook_list` | READ | List registered lifecycle hooks. |
| 119 | `hook_register` | WRITE | Register a deterministic lifecycle hook descriptor. |
| 120 | `hook_remove` | WRITE | Remove a lifecycle hook descriptor. |
| 121 | `skill_match` | READ | Match relevant local skills without loading all skill text. |
| 122 | `skill_load` | READ | Load a selected local skill by identifier. |
| 123 | `plugin_install` | DANGEROUS | Install a declared plugin after permission evaluation. |
| 124 | `plugin_list` | READ | List installed and enabled plugins. |
| 125 | `plugin_enable` | WRITE | Enable an installed plugin. |
| 126 | `plugin_disable` | WRITE | Disable an installed plugin. |
| 127 | `plugin_remove` | DANGEROUS | Remove an installed plugin. |
| 128 | `session_context` | READ | Return persisted development-session context. |
| 129 | `session_checkpoint` | WRITE | Persist a development-session checkpoint. |
| 130 | `session_resume` | READ | Resume a persisted session context. |
| 131 | `session_history` | READ | Return session checkpoints and decisions. |
| 132 | `response_mode` | READ | Select compact, normal, verbose, or stream formatting. |
| 133 | `inspect_web_app` | READ | Combine DOM, console, network, URL, and screenshot metadata. |
| 134 | `debug_ui` | READ | Gather deterministic UI debugging context. |
| 135 | `capture_ui_state` | READ | Capture a structured UI state. |
| 136 | `form_context` | READ | Inspect form controls and values metadata. |
| 137 | `network_context` | READ | Summarize browser network context. |
| 138 | `console_context` | READ | Summarize browser console context. |
| 139 | `browser_debug_context` | READ | Combine browser diagnostics for one request. |
| 140 | `windows_environment` | READ | Inspect Windows environment metadata. |
| 141 | `service_context` | READ | Inspect Windows service metadata. |
| 142 | `process_context` | READ | Inspect process-tree context. |
| 143 | `port_context` | READ | Inspect local listening-port context. |
| 144 | `registry_context` | READ | Inspect registry context through the Windows capability boundary. |
| 145 | `event_log_context` | READ | Inspect Windows event-log context. |
| 146 | `installed_runtime_context` | READ | Inspect installed runtimes and package managers. |
| 147 | `path_context` | READ | Resolve executable and PATH context. |
| 148 | `startup_context` | READ | Inspect startup configuration context. |
| 149 | `mcp_discover` | READ | Discover external MCP servers without flattening native tools. |
| 150 | `mcp_health` | READ | Return external MCP connection health. |
| 151 | `mcp_resources` | READ | List resources exposed by connected MCP servers. |
| 152 | `task_create` | EXECUTE | Create a visible managed runtime task. |
| 153 | `task_status` | READ | Read managed task state. |
| 154 | `task_cancel` | EXECUTE | Cancel a managed runtime task. |
| 155 | `task_result` | READ | Read a managed task result. |
| 156 | `task_list` | READ | List managed runtime tasks. |
| 157 | `delegate` | EXECUTE | Delegate a task through a policy/audit adapter. |
| 158 | `delegate_status` | READ | Read delegated agent state. |
| 159 | `delegate_cancel` | EXECUTE | Cancel a delegated agent task. |
| 160 | `delegate_result` | READ | Read a delegated agent result. |
| 161 | `parallel_delegate` | EXECUTE | Run isolated read-only agent tasks with collision metadata. |
| 162 | `permission_check` | READ | Evaluate an action class without limiting allowed context reads. |
| 163 | `permission_profile` | READ | Return the active Permission v2 profile. |
| 164 | `live_logs_query` | READ | Query structured activity/log metadata with correlation IDs. |
| 165 | `live_logs_status` | READ | Return Live Logs pipeline health and source status. |
| 166 | `telemetry_dashboard` | READ | Return runtime performance telemetry. |
| 167 | `context_economy_stats` | READ | Return context discovery, deduplication, ledger, and token-efficiency telemetry. |
| 168 | `execution_plan` | READ | Return the cheapest deterministic execution plan and reason. |
| 169 | `repo_map` | READ | Return a traversable repository structural map. |
| 170 | `context_expand` | READ | Return optional import, caller, type, test, and change references. |
| 171 | `recovery_status` | READ | Return reconnect, retry, continuation, cache, and worker recovery state. |
| 172 | `tool_schema_list` | READ | List versioned tool schema metadata. |
| 173 | `tool_schema_register` | WRITE | Register a backward-compatible tool schema descriptor. |
| 174 | `capabilities` | READ | Discover capability categories without requiring every full schema. |
| 175 | `tool_search` | READ | Search tools, tags, phases, and descriptions deterministically. |
| 176 | `tool_dynamic_filter` | READ | Return a bounded ranked tool set using deterministic scoring with optional local rerank fallback. |
| 177 | `tool_describe` | READ | Describe one tool contract on demand. |
| 178 | `tool_categories` | READ | List tool categories and counts. |
| 179 | `tool_function_find` | READ | Find the best local tool/function candidates for a prompt. |
| 180 | `tool_aliases` | READ | List stable shorthand aliases and their primitive tool targets. |
| 181 | `mcp_hub` | READ | Describe the additive MCP hub boundary without flattening child tools or retaining credentials. |
| 182 | `dev_context` | READ | Run the unified deterministic development-context facade. |
| 183 | `recipe_catalog` | READ | Return inspectable developer automation recipes. |
| 184 | `capture_screenshot` | READ | Capture a Windows screenshot and return MCP image content for visual validation. |
| 185 | `compare_screenshot` | READ | Compare screenshot metadata or supplied artifacts. |
| 186 | `dom_snapshot` | READ | Return a structured DOM snapshot. |
| 187 | `layout_metadata` | READ | Return layout metadata for visual validation. |
| 188 | `visual_context` | READ | Combine screenshot, DOM, layout, console, and network references. |
| 189 | `inspect_workbook` | READ | Inspect workbook sheets, used ranges, and a bounded sample through Excel COM. |
| 190 | `compare_workbook_layout` | READ | Compare workbook layout metadata through an optional spreadsheet plugin. |
| 191 | `render_excel_preview` | READ | Render an Excel preview through an optional spreadsheet plugin. |
| 192 | `inspect_pdf` | READ | Inspect PDF page structure and text through the local PDF provider. |
| 193 | `compare_pdf_pages` | READ | Compare PDF page metadata through an optional PDF plugin. |
| 194 | `project_profile_get` | READ | Read project intelligence conventions. |
| 195 | `project_profile_set` | WRITE | Update project intelligence conventions. |
| 196 | `handoff_context` | READ | Build a structured cross-agent handoff bundle. |
| 197 | `benchmark_run` | EXECUTE | Run or preview a benchmark scenario. |
| 198 | `regression_report` | READ | Return benchmark and regression results. |
| 199 | `sandbox_exec` | EXECUTE | Run an artifact-based Windows Sandbox job with networking disabled and read-only mapped input. |
| 200 | `event_watch` | EXECUTE | Watch an allowlisted user-mode ETW or Windows Event Log diagnostic stream. |
| 201 | `crash_trace` | READ | Return bounded crash and service-diagnostic context from allowlisted user-mode sources. |
| 202 | `lsp_diagnostics` | READ | Read diagnostics from an owned language-server child process. |
| 203 | `lsp_rename` | WRITE | Create a cross-file LSP rename edit plan before any workspace write. |
| 204 | `debug_attach` | EXECUTE | Attach a DAP client only to an owned workspace debug adapter. |
| 205 | `debug_step` | EXECUTE | Perform a bounded DAP stepping/read operation in an owned debug session. |
| 206 | `git_worktree_spawn` | DANGEROUS | Create an owned Git worktree for isolated agent work with collision metadata. |
| 207 | `git_worktree_remove` | DANGEROUS | Remove a ledger-owned Git worktree after dry-run and explicit confirmation. |
| 208 | `db_inspect` | READ | Inspect a local database schema through a configured, read-only connection. |
| 209 | `db_query` | DANGEROUS | Run a bounded local database query under explicit connection and mutation policy. |
| 210 | `office_ppt` | DANGEROUS | Automate PowerPoint through the existing Office policy boundary. |
| 211 | `office_outlook` | READ | Read Outlook folder and message headers through the existing Office policy boundary. |
| 212 | `pdf_extract_tables` | READ | Extract bounded PDF text and tables through a local document provider. |
| 213 | `docx_merge` | WRITE | Create a deterministic DOCX merge plan and write only after approval. |
| 214 | `self_heal_plan` | READ | Propose safe, deterministic, reversible recovery steps without applying mutations. |
| 215 | `self_heal_apply` | DANGEROUS | Apply an approved reversible recovery plan without automatic destructive retries. |
| 216 | `skills_import` | WRITE | Import a compatible skill descriptor after validation and permission review. |
| 217 | `agent_swarm_run` | EXECUTE | Plan bounded parallel subagents with ownership, collision, approval, and cancellation metadata. |
| 218 | `tool_batch` | DANGEROUS | Execute multiple MCP tools with parallel, dependency-aware, timeout, cancellation, and partial-result handling. |
<!-- END GENERATED README TOOL REGISTRY -->

## Detailed capability guide

ตารางด้านบนเป็นดัชนีอ้างอิงที่แม่นยำ ส่วนตัวอย่างการใช้งานหลักดูได้จากหัวข้อเครื่องมือสำคัญและเอกสารสถาปัตยกรรม

## แก้ปัญหาเบื้องต้น

| อาการ | วิธีตรวจ |
| --- | --- |
| Client ไม่เห็น tools | ปิด/เปิด client ใหม่ ตรวจ path ของ `rvn-node.exe` และ `rvn-mcp-stdio.cjs` |
| ChatGPT ไม่เห็น connector | เปิด RVN, Start Tunnel, ตรวจ Doctor แล้ว Refresh connector |
| `WORKSPACE_NOT_FOUND` | เพิ่ม project ในหน้า Projects และเลือกเป็น Active Project |
| `PATH_OUTSIDE_WORKSPACE` | ใช้ path ภายใต้ root/project ที่ลงทะเบียนไว้ |
| Tool ถูกปฏิเสธ | ตรวจ permission profile, Active Project และหน้าต่าง approval |
| งาน build ใช้เวลานาน | ใช้ background task แล้วติดตามด้วย status/logs/result |

## Build จาก source

ต้องใช้ Windows x64, Git และ Node.js 24.x:

```powershell
git clone https://github.com/valrinx/rvn.git
cd rvn
corepack pnpm@10.15.0 install --frozen-lockfile
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 test
corepack pnpm@10.15.0 build
corepack pnpm@10.15.0 package:windows
```

ผลลัพธ์อยู่ใน `apps/desktop/dist/installers/`

## Repository layout

```text
apps/desktop/          Electron desktop application
apps/cli/              CLI and STDIO entrypoints
packages/mcp-server/   MCP registry and transports
packages/capabilities/ Windows/browser/WSL capability backends
packages/permissions/  Permission profiles and command policy
packages/workspace/    Workspace registry and path boundary
packages/storage/      SQLite, audit, backup, checkpoint, durable state
packages/extensions/   Skills and child MCP bridge
docs/                  Architecture, security, task and benchmark documents
```

## Development verification

```powershell
corepack pnpm@10.15.0 lint
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 test
corepack pnpm@10.15.0 test:integration
corepack pnpm@10.15.0 test:packaging
corepack pnpm@10.15.0 build
```

## License

MIT — see [LICENSE](LICENSE). The preserved copyright signature in that file remains part of the license notice.
