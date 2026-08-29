export const AGENT_BUS_RUNNER_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_bus_runner_checkpoints (
  agent_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  current_task_id TEXT,
  last_error TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_bus_runner_checkpoints_updated ON agent_bus_runner_checkpoints(updated_at DESC);
`;
