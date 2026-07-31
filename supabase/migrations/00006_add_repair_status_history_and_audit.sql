-- Repair status history + audit log tables

create table if not exists repair_status_history (
  id text primary key,
  repair_id text not null references repair_requests(id),
  from_status text,
  to_status text not null,
  changed_by text not null default 'system',
  changed_by_id text,
  note text not null default '',
  ip_address text,
  device_info text,
  created_at text not null
);

create index if not exists idx_repair_status_history_repair on repair_status_history(repair_id);
create index if not exists idx_repair_status_history_created on repair_status_history(created_at);

alter table repair_status_history enable row level security;

create policy "Anyone can read status history"
  on repair_status_history for select using (true);
create policy "Authenticated can insert status history"
  on repair_status_history for insert with check (auth.role() = 'authenticated');

create table if not exists repair_audit_log (
  id text primary key,
  repair_id text,
  action text not null,
  details text not null default '',
  performed_by text not null default 'system',
  performed_by_id text,
  ip_address text,
  user_agent text,
  created_at text not null
);

create index if not exists idx_repair_audit_repair on repair_audit_log(repair_id);
create index if not exists idx_repair_audit_created on repair_audit_log(created_at);
create index if not exists idx_repair_audit_action on repair_audit_log(action);

alter table repair_audit_log enable row level security;

create policy "Authenticated can read audit log"
  on repair_audit_log for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert audit log"
  on repair_audit_log for insert with check (auth.role() = 'authenticated');
