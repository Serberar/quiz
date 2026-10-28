-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

-- Progreso por pregunta de cada asignatura: { "<id pregunta>": { "c": aciertos, "w": fallos } }
create table if not exists public.progress (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject text not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, subject)
);

-- Un registro por test terminado. El id lo genera el cliente para que reintentar sea idempotente.
create table if not exists public.attempts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject text not null,
  mode text not null check (mode in ('random', 'smart', 'exam')),
  total int not null,
  correct int not null,
  wrong int not null,
  skipped int not null,
  grade numeric(4, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists attempts_user_created on public.attempts (user_id, created_at);

-- Cada usuario solo ve y modifica sus propias filas
alter table public.progress enable row level security;
alter table public.attempts enable row level security;

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own attempts" on public.attempts;
create policy "own attempts" on public.attempts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
