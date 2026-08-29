export const AGENT_BUS_ROOMS_MIGRATION_SQL = `
ALTER TABLE agent_bus_messages ADD COLUMN room_id TEXT;
ALTER TABLE agent_bus_messages ADD COLUMN room_broadcast INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_bus_messages ADD COLUMN room_target TEXT;

CREATE TABLE IF NOT EXISTS agent_bus_rooms (
  room_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_by_agent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_bus_room_participants (
  room_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  PRIMARY KEY (room_id, agent_id)
);

CREATE TABLE IF NOT EXISTS agent_bus_room_message_targets (
  room_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (message_id, agent_id)
);

CREATE TABLE IF NOT EXISTS agent_bus_room_message_acks (
  room_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  acknowledged_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_bus_messages_room_sequence ON agent_bus_messages(room_id, sequence ASC);
CREATE INDEX IF NOT EXISTS idx_agent_bus_room_participants_active ON agent_bus_room_participants(room_id, left_at, agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_bus_room_targets_agent_sequence ON agent_bus_room_message_targets(room_id, agent_id, message_id);
CREATE INDEX IF NOT EXISTS idx_agent_bus_room_acks_agent ON agent_bus_room_message_acks(room_id, agent_id, message_id);
`;
