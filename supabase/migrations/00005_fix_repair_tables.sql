-- Type: Additive
-- Notes: pre-contract repair OS fixes (legacy subsystem).
-- Fix repair_requests schema: add condition, make old fields nullable, add RLS

-- Add condition column (was missing in original migration)
alter table repair_requests add column if not exists condition text not null default '';

-- Make old physical-condition fields nullable (they're optional in new simplified flow)
alter table repair_requests alter column device_working drop not null;
alter table repair_requests alter column lock_screen drop not null;
alter table repair_requests alter column previously_repaired drop not null;

-- Change default status to Pending (was 'Pending Quote')
alter table repair_requests alter column status set default 'Pending';

-- Add unique constraint on repair_code
delete from repair_requests a using repair_requests b
  where a.id < b.id and a.repair_code = b.repair_code;
create unique index if not exists idx_repair_requests_code_unique on repair_requests(repair_code);

-- Add index for customer_name search
create index if not exists idx_repair_requests_customer_name on repair_requests(customer_name);

-- Enable RLS
alter table repair_requests enable row level security;
alter table repair_quotes enable row level security;
alter table repair_timeline enable row level security;
alter table repair_courier_jobs enable row level security;
alter table repair_notifications enable row level security;
alter table repair_photos enable row level security;

-- Allow anyone to insert repair requests (public form submission)
create policy "Anyone can insert repair requests"
  on repair_requests for insert
  with check (true);

-- Allow anyone to read repair requests (tracking by code/phone/name)
create policy "Anyone can read repair requests"
  on repair_requests for select
  using (true);

-- Only authenticated users can update
create policy "Authenticated users can update repair requests"
  on repair_requests for update
  using (auth.role() = 'authenticated');

-- Quotes: anyone can read, only authenticated can insert/update
create policy "Anyone can read quotes" on repair_quotes for select using (true);
create policy "Authenticated can insert quotes" on repair_quotes for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update quotes" on repair_quotes for update using (auth.role() = 'authenticated');

-- Timeline: anyone can read, anyone can insert (for tracking)
create policy "Anyone can read timeline" on repair_timeline for select using (true);
create policy "Anyone can insert timeline" on repair_timeline for insert with check (true);

-- Courier jobs: any authenticated
create policy "Authenticated can read courier jobs" on repair_courier_jobs for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert courier jobs" on repair_courier_jobs for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update courier jobs" on repair_courier_jobs for update using (auth.role() = 'authenticated');

-- Notifications: any authenticated
create policy "Authenticated can read notifications" on repair_notifications for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert notifications" on repair_notifications for insert with check (auth.role() = 'authenticated');

-- Photos: anyone can insert, any authenticated can read
create policy "Anyone can insert photos" on repair_photos for insert with check (true);
create policy "Authenticated can read photos" on repair_photos for select using (auth.role() = 'authenticated');
