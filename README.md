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
