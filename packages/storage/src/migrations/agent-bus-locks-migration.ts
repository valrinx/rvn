export const AGENT_BUS_LOCKS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_bus_locks (
  resource TEXT PRIMARY KEY NOT NULL,
  lock_type TEXT NOT NULL,
  owner_agent_id TEXT NOT NULL,
  task_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_bus_locks_owner ON agent_bus_locks(owner_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_bus_locks_task ON agent_bus_locks(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_bus_locks_expiry ON agent_bus_locks(expires_at ASC);
`;
