PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  package TEXT NOT NULL,
  value TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity INTEGER CHECK (min_quantity >= 0),
  location TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  unit_price REAL CHECK (unit_price >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('in', 'out', 'adjustment')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storage_boxes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

INSERT OR IGNORE INTO storage_boxes (id, label, subtitle) VALUES
  ('A', '盒 01', '电阻 / 电容'),
  ('B', '盒 02', '二极管 / 连接器'),
  ('C', '盒 03', '芯片 / 模块');

CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);
CREATE INDEX IF NOT EXISTS idx_components_location ON components(location);
CREATE INDEX IF NOT EXISTS idx_movements_component ON stock_movements(component_id);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON stock_movements(created_at DESC);

CREATE TABLE IF NOT EXISTS bom_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  completed_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT '采购中' CHECK (status IN ('采购中', '焊接中', '测试中', '完成')),
  start_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
