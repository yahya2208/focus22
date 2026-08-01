-- Type: Baseline
-- Notes: pre-contract repair OS tables (legacy subsystem).
-- Repair OS tables for Supabase migration

create table if not exists repair_requests (
  id text primary key,
  repair_code text not null,
  customer_name text not null,
  customer_phone text not null,
  brand_name text not null,
  model_name text not null,
  issue text not null,
  description text not null default '',
  device_working text not null,
  lock_screen text not null,
  previously_repaired text not null,
  latitude double precision,
  longitude double precision,
  location_accuracy double precision,
  google_maps_link text,
  photo_paths jsonb default '[]'::jsonb,
  status text not null default 'Pending Quote',
  admin_notes text not null default '',
  created_at text not null,
  updated_at text not null,
  customer_id text,
  assigned_courier_id text,
  assigned_technician_id text
);

create table if not exists repair_quotes (
  id text primary key,
  repair_id text not null references repair_requests(id),
  estimated_price double precision,
  estimated_days integer,
  admin_notes text not null default '',
  recommended_action text,
  recommendation_reason text,
  sent_at text,
  approved_at text,
  rejected_at text,
  created_at text not null
);

create table if not exists repair_timeline (
  id text primary key,
  repair_id text not null references repair_requests(id),
  status text not null,
  note text not null default '',
  created_at text not null,
  actor text not null
);

create table if not exists repair_courier_jobs (
  id text primary key,
  repair_id text not null references repair_requests(id),
  courier_id text not null,
  courier_name text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_address text,
  latitude double precision,
  longitude double precision,
  google_maps_link text,
  distance double precision,
  status text not null default 'Pending',
  notes text not null default '',
  created_at text not null,
  updated_at text not null
);

create table if not exists repair_notifications (
  id text primary key,
  repair_id text not null references repair_requests(id),
  type text not null,
  recipient text not null,
  title text not null,
  message text not null,
  sent_at text not null,
  read_at text
);

create table if not exists repair_photos (
  id text primary key,
  repair_id text not null references repair_requests(id),
  path text not null,
  uploaded_at text not null
);

create index if not exists idx_repair_requests_phone on repair_requests(customer_phone);
create index if not exists idx_repair_requests_status on repair_requests(status);
create index if not exists idx_repair_requests_code on repair_requests(repair_code);
create index if not exists idx_repair_timeline_repair on repair_timeline(repair_id);
create index if not exists idx_repair_quotes_repair on repair_quotes(repair_id);
create index if not exists idx_repair_courier_repair on repair_courier_jobs(repair_id);
