export const AGENT_BUS_ARTIFACTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_bus_artifacts (
  artifact_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL,
  path_or_reference TEXT NOT NULL,
  sha256 TEXT,
  metadata_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_bus_artifacts_task_created ON agent_bus_artifacts(task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_bus_artifacts_agent_created ON agent_bus_artifacts(agent_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_bus_artifacts_type_created ON agent_bus_artifacts(type, created_at ASC);
`;
