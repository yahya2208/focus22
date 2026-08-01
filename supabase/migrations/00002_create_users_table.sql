-- Type: Baseline
-- Notes: users.id is declared TEXT here but is UUID on the live DB — reconciled
-- in the 00008 baseline.
-- Users table for auth profiles (mirrors auth.users)
create table if not exists users (
  id text primary key,
  email text,
  display_name text,
  role text not null default 'user',
  avatar_url text,
  is_anonymous boolean not null default false,
  created_at text not null default (now()::text),
  updated_at text not null default (now()::text),
  last_login_at text
);

alter table users enable row level security;

-- Allow users to read their own row
create policy "Users can read own row"
  on users for select
  using (id = current_user::text or current_user = 'authenticated');

-- Allow authenticated users to insert their own row
create policy "Users can insert own row"
  on users for insert
  with check (id = current_user::text);

-- Allow authenticated users to update their own row
create policy "Users can update own row"
  on users for update
  using (id = current_user::text);

-- Auto-create users row on signup via trigger
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, display_name, role, is_anonymous, created_at, updated_at, last_login_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'display_name',
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    new.is_anonymous,
    now()::text,
    now()::text,
    now()::text
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    last_login_at = now()::text,
    updated_at = now()::text;
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger first to make migration idempotent
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Also update on login
drop trigger if exists on_auth_user_login on auth.users;

create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute function handle_new_user();
