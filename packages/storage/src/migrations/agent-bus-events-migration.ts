export const AGENT_BUS_EVENTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_bus_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  task_id TEXT,
  agent_id TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_bus_events_task_sequence ON agent_bus_events(task_id, sequence ASC);
CREATE INDEX IF NOT EXISTS idx_agent_bus_events_agent_sequence ON agent_bus_events(agent_id, sequence ASC);
`;
