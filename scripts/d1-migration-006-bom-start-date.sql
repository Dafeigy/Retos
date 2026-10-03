-- Existing D1 databases with bom_projects from migration 005.
ALTER TABLE bom_projects ADD COLUMN start_date TEXT NOT NULL DEFAULT '';
UPDATE bom_projects SET start_date = substr(created_at, 1, 10) WHERE start_date = '';
