export const AGENT_BUS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_bus_agents (
  agent_id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  current_task_id TEXT,
  last_heartbeat_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_bus_tasks (
  task_id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL,
  owner_agent_id TEXT,
  created_by_agent_id TEXT NOT NULL,
  acceptance_json TEXT NOT NULL,
  file_scope_json TEXT NOT NULL,
  dependencies_json TEXT NOT NULL,
  read_only INTEGER NOT NULL,
  progress TEXT,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS agent_bus_messages (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE NOT NULL,
  from_agent_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  task_id TEXT,
  type TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  acknowledged_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agent_bus_tasks_status_priority ON agent_bus_tasks(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_bus_tasks_owner ON agent_bus_tasks(owner_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_bus_messages_recipient_sequence ON agent_bus_messages(to_agent_id, sequence ASC);
CREATE INDEX IF NOT EXISTS idx_agent_bus_agents_heartbeat ON agent_bus_agents(last_heartbeat_at DESC);
`;
