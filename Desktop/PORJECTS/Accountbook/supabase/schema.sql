-- Run in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

do $$
begin
  create type public.entry_type as enum ('gave', 'got');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type public.entry_type not null,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  create type public.inventory_movement_type as enum ('in', 'out');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  type public.inventory_movement_type not null,
  quantity numeric(12,2) not null check (quantity > 0),
  note text,
  movement_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_sync_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_sync_group_members (
  group_id uuid not null references public.inventory_sync_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.inventory_items
  add column if not exists group_id uuid references public.inventory_sync_groups(id) on delete set null;

alter table public.inventory_movements
  add column if not exists group_id uuid references public.inventory_sync_groups(id) on delete set null;

-- Enforce hard cascade from auth.users for existing deployments as well.
alter table public.contacts drop constraint if exists contacts_owner_id_fkey;
alter table public.contacts
  add constraint contacts_owner_id_fkey
  foreign key (owner_id)
  references auth.users(id)
  on delete cascade;

alter table public.entries drop constraint if exists entries_owner_id_fkey;
alter table public.entries
  add constraint entries_owner_id_fkey
  foreign key (owner_id)
  references auth.users(id)
  on delete cascade;

alter table public.inventory_items drop constraint if exists inventory_items_owner_id_fkey;
alter table public.inventory_items
  add constraint inventory_items_owner_id_fkey
  foreign key (owner_id)
  references auth.users(id)
  on delete cascade;

alter table public.inventory_movements drop constraint if exists inventory_movements_owner_id_fkey;
alter table public.inventory_movements
  add constraint inventory_movements_owner_id_fkey
  foreign key (owner_id)
  references auth.users(id)
  on delete cascade;

alter table public.user_profiles drop constraint if exists user_profiles_id_fkey;
alter table public.user_profiles
  add constraint user_profiles_id_fkey
  foreign key (id)
  references auth.users(id)
  on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_items_owner_name_unique'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_owner_name_unique unique (owner_id, name);
  end if;
end
$$;

create index if not exists idx_contacts_owner on public.contacts(owner_id);
create index if not exists idx_entries_owner on public.entries(owner_id);
create index if not exists idx_entries_contact on public.entries(contact_id);
create index if not exists idx_inventory_items_owner on public.inventory_items(owner_id);
create index if not exists idx_inventory_items_group on public.inventory_items(group_id);
create index if not exists idx_inventory_items_owner_name on public.inventory_items(owner_id, lower(name));
create index if not exists idx_inventory_movements_owner on public.inventory_movements(owner_id);
create index if not exists idx_inventory_movements_group on public.inventory_movements(group_id);
create index if not exists idx_inventory_movements_item on public.inventory_movements(item_id);
create index if not exists idx_inventory_movements_owner_item on public.inventory_movements(owner_id, item_id);
create index if not exists idx_inventory_sync_group_members_user on public.inventory_sync_group_members(user_id);
create index if not exists idx_inventory_sync_group_members_group on public.inventory_sync_group_members(group_id);
create index if not exists idx_inventory_sync_groups_join_code on public.inventory_sync_groups(join_code);
create index if not exists idx_user_profiles_display_name on public.user_profiles(lower(display_name));

alter table public.contacts enable row level security;
alter table public.entries enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_sync_groups enable row level security;
alter table public.inventory_sync_group_members enable row level security;
alter table public.user_profiles enable row level security;

create or replace function public.is_inventory_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inventory_sync_group_members m
    where m.group_id = target_group_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.find_inventory_group_by_code(input_code text)
returns table (
  id uuid,
  name text,
  join_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.join_code
  from public.inventory_sync_groups g
  where upper(g.join_code) = upper(trim(input_code))
  limit 1;
$$;

create or replace function public.join_inventory_group_by_code(input_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
begin
  select g.id
  into target_group_id
  from public.inventory_sync_groups g
  where upper(g.join_code) = upper(trim(input_code))
  limit 1;

  if target_group_id is null then
    return null;
  end if;

  insert into public.inventory_sync_group_members (group_id, user_id, role)
  values (target_group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return target_group_id;
end;
$$;

drop policy if exists "contacts_select_own" on public.contacts;
create policy "contacts_select_own" on public.contacts
  for select using (auth.uid() = owner_id);

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles
  for select using (auth.uid() = id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles
  for insert with check (auth.uid() = id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "contacts_insert_own" on public.contacts;
create policy "contacts_insert_own" on public.contacts
  for insert with check (auth.uid() = owner_id);

drop policy if exists "contacts_update_own" on public.contacts;
create policy "contacts_update_own" on public.contacts
  for update using (auth.uid() = owner_id);

drop policy if exists "contacts_delete_own" on public.contacts;
create policy "contacts_delete_own" on public.contacts
  for delete using (auth.uid() = owner_id);

drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own" on public.entries
  for select using (auth.uid() = owner_id);

drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries
  for insert with check (
    auth.uid() = owner_id and
    exists (
      select 1
      from public.contacts c
      where c.id = contact_id
      and c.owner_id = auth.uid()
    )
  );

drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries
  for update using (auth.uid() = owner_id);

drop policy if exists "entries_delete_own" on public.entries;
create policy "entries_delete_own" on public.entries
  for delete using (auth.uid() = owner_id);

drop policy if exists "inventory_sync_groups_select_member" on public.inventory_sync_groups;
create policy "inventory_sync_groups_select_member" on public.inventory_sync_groups
  for select using (
    auth.uid() = owner_id
    or public.is_inventory_group_member(id)
  );

drop policy if exists "inventory_sync_groups_insert_owner" on public.inventory_sync_groups;
create policy "inventory_sync_groups_insert_owner" on public.inventory_sync_groups
  for insert with check (auth.uid() = owner_id);

drop policy if exists "inventory_sync_groups_update_owner" on public.inventory_sync_groups;
create policy "inventory_sync_groups_update_owner" on public.inventory_sync_groups
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "inventory_sync_groups_delete_owner" on public.inventory_sync_groups;
create policy "inventory_sync_groups_delete_owner" on public.inventory_sync_groups
  for delete using (auth.uid() = owner_id);

drop policy if exists "inventory_sync_group_members_select_member" on public.inventory_sync_group_members;
create policy "inventory_sync_group_members_select_member" on public.inventory_sync_group_members
  for select using (
    auth.uid() = user_id
    or public.is_inventory_group_member(group_id)
  );

drop policy if exists "inventory_sync_group_members_insert_self" on public.inventory_sync_group_members;
create policy "inventory_sync_group_members_insert_self" on public.inventory_sync_group_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "inventory_sync_group_members_delete_self_or_owner" on public.inventory_sync_group_members;
create policy "inventory_sync_group_members_delete_self_or_owner" on public.inventory_sync_group_members
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.inventory_sync_groups g
      where g.id = group_id
        and g.owner_id = auth.uid()
    )
  );

drop policy if exists "inventory_items_select_accessible" on public.inventory_items;
create policy "inventory_items_select_accessible" on public.inventory_items
  for select using (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  );

drop policy if exists "inventory_items_insert_accessible" on public.inventory_items;
create policy "inventory_items_insert_accessible" on public.inventory_items
  for insert with check (
    auth.uid() = owner_id
    and (group_id is null or public.is_inventory_group_member(group_id))
  );

drop policy if exists "inventory_items_update_accessible" on public.inventory_items;
create policy "inventory_items_update_accessible" on public.inventory_items
  for update using (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  )
  with check (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  );

drop policy if exists "inventory_items_delete_accessible" on public.inventory_items;
create policy "inventory_items_delete_accessible" on public.inventory_items
  for delete using (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  );

drop policy if exists "inventory_movements_select_accessible" on public.inventory_movements;
create policy "inventory_movements_select_accessible" on public.inventory_movements
  for select using (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  );

drop policy if exists "inventory_movements_insert_accessible" on public.inventory_movements;
create policy "inventory_movements_insert_accessible" on public.inventory_movements
  for insert with check (
    auth.uid() = owner_id
    and exists (
      select 1
      from public.inventory_items i
      where i.id = item_id
        and (
          i.owner_id = auth.uid()
          or (i.group_id is not null and public.is_inventory_group_member(i.group_id))
        )
        and coalesce(i.group_id::text, '') = coalesce(inventory_movements.group_id::text, '')
    )
  );

drop policy if exists "inventory_movements_update_accessible" on public.inventory_movements;
create policy "inventory_movements_update_accessible" on public.inventory_movements
  for update using (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  )
  with check (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  );

drop policy if exists "inventory_movements_delete_accessible" on public.inventory_movements;
create policy "inventory_movements_delete_accessible" on public.inventory_movements
  for delete using (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  );

create or replace function public.derive_display_name(
  raw_meta jsonb,
  user_email text
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(raw_meta ->> 'username'), ''),
    nullif(trim(split_part(user_email, '@', 1)), ''),
    'User'
  );
$$;

create or replace function public.sync_user_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.user_profiles (id, email, display_name, created_at, updated_at)
  values (
    new.id,
    new.email,
    public.derive_display_name(new.raw_user_meta_data, new.email),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = public.derive_display_name(new.raw_user_meta_data, new.email),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists auth_user_profile_sync on auth.users;
create trigger auth_user_profile_sync
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_user_profile_from_auth();

insert into public.user_profiles (id, email, display_name, created_at, updated_at)
select
  u.id,
  u.email,
  public.derive_display_name(u.raw_user_meta_data, u.email),
  coalesce(u.created_at, now()),
  now()
from auth.users u
on conflict (id) do update
set
  email = excluded.email,
  display_name = excluded.display_name,
  updated_at = now();

drop view if exists public.entries_with_owner;
drop view if exists public.contacts_with_owner;

create view public.contacts_with_owner
with (security_invoker = true) as
select
  c.id,
  c.owner_id,
  p.display_name as owner_name,
  c.name,
  c.phone,
  c.created_at
from public.contacts c
left join public.user_profiles p on p.id = c.owner_id;

create view public.entries_with_owner
with (security_invoker = true) as
select
  e.id,
  e.owner_id,
  p.display_name as owner_name,
  e.contact_id,
  c.name as contact_name,
  e.type,
  e.amount,
  e.note,
  e.entry_date,
  e.created_at
from public.entries e
left join public.contacts c on c.id = e.contact_id and c.owner_id = e.owner_id
left join public.user_profiles p on p.id = e.owner_id;
