-- Feeling Wheel — encrypted sync schema
--
-- Paste this whole file into your Supabase project's SQL Editor and run it.
-- Project → SQL Editor → New query → paste → Run.
--
-- What the server can see: a row id, which user it belongs to, when it changed,
-- whether it was deleted, and an opaque blob. Never a feeling, a trigger, or a
-- note — those are AES-GCM encrypted in the browser under a passphrase that is
-- never transmitted.

-- ── entries ────────────────────────────────────────────────────────────
create table if not exists public.entries (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  updated_at  timestamptz not null,
  deleted     boolean not null default false,
  iv          text not null,   -- base64 AES-GCM nonce
  ct          text not null    -- base64 ciphertext of the whole entry JSON
);

-- The sync pull is always "everything of mine changed since <cursor>".
create index if not exists entries_user_updated_idx
  on public.entries (user_id, updated_at);

alter table public.entries enable row level security;

-- Each policy is scoped to the authenticated user. This is what makes it safe
-- to ship the anon key in a client-only app: the key identifies the project,
-- the JWT identifies the person, and these policies do the rest.
drop policy if exists "own entries: read"   on public.entries;
drop policy if exists "own entries: insert" on public.entries;
drop policy if exists "own entries: update" on public.entries;
drop policy if exists "own entries: delete" on public.entries;

create policy "own entries: read"   on public.entries
  for select using (auth.uid() = user_id);
create policy "own entries: insert" on public.entries
  for insert with check (auth.uid() = user_id);
create policy "own entries: update" on public.entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own entries: delete" on public.entries
  for delete using (auth.uid() = user_id);

-- ── sync_meta ──────────────────────────────────────────────────────────
-- Holds the per-user PBKDF2 salt so a second device derives the same key from
-- the same passphrase. A salt is not a secret; it only stops precomputation.
create table if not exists public.sync_meta (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  salt       text not null,
  created_at timestamptz not null default now()
);

alter table public.sync_meta enable row level security;

drop policy if exists "own salt: read"   on public.sync_meta;
drop policy if exists "own salt: insert" on public.sync_meta;

create policy "own salt: read"   on public.sync_meta
  for select using (auth.uid() = user_id);
create policy "own salt: insert" on public.sync_meta
  for insert with check (auth.uid() = user_id);
-- Deliberately no update policy: rotating the salt would orphan every existing
-- row, since they can no longer be decrypted from the same passphrase.
