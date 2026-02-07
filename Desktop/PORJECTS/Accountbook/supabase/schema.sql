-- Run in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create type public.entry_type as enum ('gave', 'got');

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

create index if not exists idx_contacts_owner on public.contacts(owner_id);
create index if not exists idx_entries_owner on public.entries(owner_id);
create index if not exists idx_entries_contact on public.entries(contact_id);

alter table public.contacts enable row level security;
alter table public.entries enable row level security;

drop policy if exists "contacts_select_own" on public.contacts;
create policy "contacts_select_own" on public.contacts
  for select using (auth.uid() = owner_id);

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
