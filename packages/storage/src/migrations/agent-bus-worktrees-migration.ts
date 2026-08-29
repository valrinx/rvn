export const AGENT_BUS_WORKTREES_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_bus_worktrees (
  worktree_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  base_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('allocated', 'released')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  released_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_bus_worktrees_active_path
  ON agent_bus_worktrees (workspace_id, worktree_path) WHERE status = 'allocated';
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_bus_worktrees_active_task
  ON agent_bus_worktrees (workspace_id, task_id) WHERE status = 'allocated';
CREATE INDEX IF NOT EXISTS idx_agent_bus_worktrees_workspace_status
  ON agent_bus_worktrees (workspace_id, status, updated_at);
`;
