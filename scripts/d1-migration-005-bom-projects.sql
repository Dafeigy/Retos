CREATE TABLE IF NOT EXISTS bom_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  completed_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT '采购中' CHECK (status IN ('采购中', '焊接中', '测试中', '完成')),
  start_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
