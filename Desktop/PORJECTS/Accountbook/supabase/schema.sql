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
  create type public.contact_category as enum ('sundry_creditor', 'sundry_debtor', 'individual');
exception
  when duplicate_object then null;
end
$$;

alter table public.contacts
  add column if not exists category public.contact_category not null default 'individual';

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
  category text,
  barcode text,
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

alter table public.inventory_items
  add column if not exists category text;

alter table public.inventory_items
  add column if not exists barcode text;

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
create index if not exists idx_contacts_owner_category on public.contacts(owner_id, category);
create index if not exists idx_entries_owner on public.entries(owner_id);
create index if not exists idx_entries_contact on public.entries(contact_id);
create index if not exists idx_inventory_items_owner on public.inventory_items(owner_id);
create index if not exists idx_inventory_items_group on public.inventory_items(group_id);
create index if not exists idx_inventory_items_owner_name on public.inventory_items(owner_id, lower(name));
create index if not exists idx_inventory_items_owner_category on public.inventory_items(owner_id, lower(category));
create index if not exists idx_inventory_items_barcode on public.inventory_items(barcode);
create unique index if not exists idx_inventory_items_owner_barcode_unique
  on public.inventory_items(owner_id, barcode)
  where barcode is not null and group_id is null;
create unique index if not exists idx_inventory_items_group_barcode_unique
  on public.inventory_items(group_id, barcode)
  where barcode is not null and group_id is not null;
create index if not exists idx_inventory_movements_owner on public.inventory_movements(owner_id);
create index if not exists idx_inventory_movements_group on public.inventory_movements(group_id);
create index if not exists idx_inventory_movements_item on public.inventory_movements(item_id);
create index if not exists idx_inventory_movements_owner_item on public.inventory_movements(owner_id, item_id);
create index if not exists idx_inventory_sync_group_members_user on public.inventory_sync_group_members(user_id);
create index if not exists idx_inventory_sync_group_members_group on public.inventory_sync_group_members(group_id);
create index if not exists idx_inventory_sync_groups_join_code on public.inventory_sync_groups(join_code);
create index if not exists idx_user_profiles_display_name on public.user_profiles(lower(display_name));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_items'
  ) then
    alter publication supabase_realtime add table public.inventory_items;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_movements'
  ) then
    alter publication supabase_realtime add table public.inventory_movements;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_sync_group_members'
  ) then
    alter publication supabase_realtime add table public.inventory_sync_group_members;
  end if;
end
$$;

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
  normalized_code text;
  caller_user_id uuid;
begin
  caller_user_id := auth.uid();
  if caller_user_id is null then
    raise exception 'Not authenticated';
  end if;

  normalized_code := upper(trim(input_code));
  select g.id
  into target_group_id
  from public.inventory_sync_groups g
  where upper(g.join_code) = normalized_code
  limit 1;

  if target_group_id is null then
    return null;
  end if;

  insert into public.inventory_sync_group_members (group_id, user_id, role)
  values (target_group_id, caller_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  return target_group_id;
end;
$$;

create or replace function public.get_inventory_group_members(target_group_id uuid)
returns table (
  user_id uuid,
  role text,
  display_name text,
  email text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    m.role,
    coalesce(p.display_name, 'User') as display_name,
    p.email,
    m.created_at as joined_at
  from public.inventory_sync_group_members m
  left join public.user_profiles p on p.id = m.user_id
  where m.group_id = target_group_id
    and public.is_inventory_group_member(target_group_id)
  order by m.created_at asc;
$$;

revoke all on function public.find_inventory_group_by_code(text) from public;
revoke all on function public.join_inventory_group_by_code(text) from public;
revoke all on function public.get_inventory_group_members(uuid) from public;
grant execute on function public.find_inventory_group_by_code(text) to authenticated;
grant execute on function public.join_inventory_group_by_code(text) to authenticated;
grant execute on function public.get_inventory_group_members(uuid) to authenticated;

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

alter table public.entries
  add column if not exists invoice_id uuid;

alter table public.inventory_movements
  add column if not exists invoice_id uuid;

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
  e.invoice_id,
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

do $$
begin
  create type public.invoice_kind as enum ('purchase', 'sale');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.inventory_sync_groups(id) on delete set null,
  contact_id uuid not null references public.contacts(id),
  kind public.invoice_kind not null,
  party_name text not null,
  invoice_date date not null default current_date,
  note text,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  settlement_amount numeric(14,2) not null default 0 check (settlement_amount >= 0),
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.inventory_sync_groups(id) on delete set null,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  item_name text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  rate numeric(12,2) not null check (rate >= 0),
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'entries_invoice_id_fkey'
      and conrelid = 'public.entries'::regclass
  ) then
    alter table public.entries
      add constraint entries_invoice_id_fkey
      foreign key (invoice_id)
      references public.invoices(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_movements_invoice_id_fkey'
      and conrelid = 'public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_invoice_id_fkey
      foreign key (invoice_id)
      references public.invoices(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_entries_invoice_id on public.entries(invoice_id);
create index if not exists idx_inventory_movements_invoice_id on public.inventory_movements(invoice_id);
create index if not exists idx_invoices_owner_date on public.invoices(owner_id, invoice_date desc);
create index if not exists idx_invoices_group_date on public.invoices(group_id, invoice_date desc);
create index if not exists idx_invoice_lines_invoice_id on public.invoice_lines(invoice_id);
create index if not exists idx_invoice_lines_owner on public.invoice_lines(owner_id);
create index if not exists idx_invoice_lines_group on public.invoice_lines(group_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'invoices'
  ) then
    alter publication supabase_realtime add table public.invoices;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'invoice_lines'
  ) then
    alter publication supabase_realtime add table public.invoice_lines;
  end if;
end
$$;

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

drop policy if exists "invoices_select_accessible" on public.invoices;
create policy "invoices_select_accessible" on public.invoices
  for select using (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  );

drop policy if exists "invoice_lines_select_accessible" on public.invoice_lines;
create policy "invoice_lines_select_accessible" on public.invoice_lines
  for select using (
    auth.uid() = owner_id
    or (group_id is not null and public.is_inventory_group_member(group_id))
  );

create or replace function public.cancel_invoice(
  p_invoice_id uuid,
  p_cancel_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_user_id uuid;
  target_invoice public.invoices%rowtype;
  cancel_note text;
begin
  caller_user_id := auth.uid();
  if caller_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into target_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.owner_id = caller_user_id;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if target_invoice.status = 'cancelled' then
    return true;
  end if;

  cancel_note := nullif(trim(coalesce(p_cancel_note, '')), '');

  update public.invoices
  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now(),
    note = case
      when cancel_note is null then note
      else concat_ws(' | ', nullif(note, ''), 'Cancelled: ' || cancel_note)
    end
  where id = target_invoice.id;

  insert into public.inventory_movements (
    owner_id,
    group_id,
    item_id,
    invoice_id,
    type,
    quantity,
    note,
    movement_date
  )
  select
    m.owner_id,
    m.group_id,
    m.item_id,
    m.invoice_id,
    case when m.type = 'in' then 'out'::public.inventory_movement_type else 'in'::public.inventory_movement_type end,
    m.quantity,
    'Invoice cancellation reversal',
    current_date
  from public.inventory_movements m
  where m.invoice_id = target_invoice.id;

  insert into public.entries (
    owner_id,
    contact_id,
    invoice_id,
    type,
    amount,
    note,
    entry_date
  )
  select
    e.owner_id,
    e.contact_id,
    e.invoice_id,
    case when e.type = 'gave' then 'got'::public.entry_type else 'gave'::public.entry_type end,
    e.amount,
    'Invoice cancellation reversal',
    current_date
  from public.entries e
  where e.invoice_id = target_invoice.id;

  return true;
end;
$$;

create or replace function public.post_invoice(
  p_kind public.invoice_kind,
  p_party_name text,
  p_invoice_date date,
  p_note text,
  p_settlement_amount numeric,
  p_lines jsonb,
  p_group_id uuid default null,
  p_replace_invoice_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_user_id uuid;
  normalized_party text;
  target_contact_id uuid;
  target_contact_category public.contact_category;
  required_contact_category public.contact_category;
  target_invoice_id uuid;
  line jsonb;
  line_item_id uuid;
  line_qty numeric;
  line_rate numeric;
  line_amount numeric;
  item_name text;
  v_total_amount numeric := 0;
  v_remaining_amount numeric;
  v_settlement_amount numeric := coalesce(p_settlement_amount, 0);
  movement_type public.inventory_movement_type;
begin
  caller_user_id := auth.uid();
  if caller_user_id is null then
    raise exception 'Not authenticated';
  end if;

  normalized_party := trim(coalesce(p_party_name, ''));
  if normalized_party = '' then
    raise exception 'Party name is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one invoice line is required';
  end if;

  if v_settlement_amount < 0 then
    raise exception 'Settlement amount cannot be negative';
  end if;

  if p_group_id is not null and not public.is_inventory_group_member(p_group_id) then
    raise exception 'Not allowed to post in this group';
  end if;

  required_contact_category := case
    when p_kind = 'purchase' then 'sundry_creditor'::public.contact_category
    else 'sundry_debtor'::public.contact_category
  end;

  if p_replace_invoice_id is not null then
    perform public.cancel_invoice(p_replace_invoice_id, 'Replaced by invoice edit');
  end if;

  select c.id, c.category
  into target_contact_id, target_contact_category
  from public.contacts c
  where c.owner_id = caller_user_id
    and lower(c.name) = lower(normalized_party)
  limit 1;

  if target_contact_id is null then
    insert into public.contacts (owner_id, name, phone, category)
    values (caller_user_id, normalized_party, null, required_contact_category)
    returning id into target_contact_id;
  elsif target_contact_category <> required_contact_category then
    raise exception 'Party category mismatch. % invoice requires % party.',
      initcap(p_kind::text),
      replace(required_contact_category::text, '_', ' ');
  end if;

  insert into public.invoices (
    owner_id,
    group_id,
    contact_id,
    kind,
    party_name,
    invoice_date,
    note,
    settlement_amount
  )
  values (
    caller_user_id,
    p_group_id,
    target_contact_id,
    p_kind,
    normalized_party,
    p_invoice_date,
    nullif(trim(coalesce(p_note, '')), ''),
    v_settlement_amount
  )
  returning id into target_invoice_id;

  movement_type := case when p_kind = 'purchase' then 'in'::public.inventory_movement_type else 'out'::public.inventory_movement_type end;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    line_item_id := (line ->> 'item_id')::uuid;
    line_qty := (line ->> 'quantity')::numeric;
    line_rate := (line ->> 'rate')::numeric;

    if line_item_id is null then
      raise exception 'Line item is required';
    end if;
    if line_qty is null or line_qty <= 0 then
      raise exception 'Line quantity must be positive';
    end if;
    if line_rate is null or line_rate < 0 then
      raise exception 'Line rate must be zero or positive';
    end if;

    select i.name
    into item_name
    from public.inventory_items i
    where i.id = line_item_id
      and (
        i.owner_id = caller_user_id
        or (i.group_id is not null and public.is_inventory_group_member(i.group_id))
      )
      and coalesce(i.group_id::text, '') = coalesce(p_group_id::text, '');

    if item_name is null then
      raise exception 'Selected item not found or inaccessible';
    end if;

    line_amount := round(line_qty * line_rate, 2);
    v_total_amount := v_total_amount + line_amount;

    insert into public.invoice_lines (
      owner_id,
      group_id,
      invoice_id,
      item_id,
      item_name,
      quantity,
      rate,
      amount
    )
    values (
      caller_user_id,
      p_group_id,
      target_invoice_id,
      line_item_id,
      item_name,
      line_qty,
      line_rate,
      line_amount
    );

    insert into public.inventory_movements (
      owner_id,
      group_id,
      item_id,
      invoice_id,
      type,
      quantity,
      note,
      movement_date
    )
    values (
      caller_user_id,
      p_group_id,
      line_item_id,
      target_invoice_id,
      movement_type,
      line_qty,
      nullif(trim(coalesce(p_note, '')), ''),
      p_invoice_date
    );
  end loop;

  v_total_amount := round(v_total_amount, 2);
  if v_settlement_amount > v_total_amount then
    raise exception 'Settlement amount cannot be greater than total amount';
  end if;

  v_remaining_amount := round(v_total_amount - v_settlement_amount, 2);

  if v_remaining_amount > 0 then
    insert into public.entries (
      owner_id,
      contact_id,
      invoice_id,
      type,
      amount,
      note,
      entry_date
    )
    values (
      caller_user_id,
      target_contact_id,
      target_invoice_id,
      case when p_kind = 'sale' then 'gave'::public.entry_type else 'got'::public.entry_type end,
      v_remaining_amount,
      case when p_kind = 'sale' then 'Sales Invoice' else 'Purchase Invoice' end,
      p_invoice_date
    );
  end if;

  if v_settlement_amount > 0 then
    insert into public.entries (
      owner_id,
      contact_id,
      invoice_id,
      type,
      amount,
      note,
      entry_date
    )
    values (
      caller_user_id,
      target_contact_id,
      target_invoice_id,
      case when p_kind = 'sale' then 'got'::public.entry_type else 'gave'::public.entry_type end,
      v_settlement_amount,
      case when p_kind = 'sale' then 'Amount Received' else 'Amount Paid' end,
      p_invoice_date
    );
  end if;

  update public.invoices
  set
    total_amount = v_total_amount,
    settlement_amount = v_settlement_amount,
    updated_at = now()
  where id = target_invoice_id;

  return target_invoice_id;
end;
$$;

create or replace function public.prevent_invoice_linked_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.invoice_id is not null then
    raise exception 'Invoice-linked postings are immutable. Cancel or replace the invoice instead.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_invoice_entry_update on public.entries;
create trigger prevent_invoice_entry_update
before update or delete on public.entries
for each row execute function public.prevent_invoice_linked_mutation();

drop trigger if exists prevent_invoice_movement_update on public.inventory_movements;
create trigger prevent_invoice_movement_update
before update or delete on public.inventory_movements
for each row execute function public.prevent_invoice_linked_mutation();

revoke all on function public.post_invoice(public.invoice_kind, text, date, text, numeric, jsonb, uuid, uuid) from public;
revoke all on function public.cancel_invoice(uuid, text) from public;
grant execute on function public.post_invoice(public.invoice_kind, text, date, text, numeric, jsonb, uuid, uuid) to authenticated;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;
