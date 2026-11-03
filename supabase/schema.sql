-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

-- Progreso antiguo por asignatura: { "<id pregunta>": { "c": aciertos, "w": fallos } }.
-- Ya no se escribe (salvo para subir datos pendientes de la versión anterior): se usa como base
-- y encima se suman las respuestas de la tabla answers.
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

-- Una fila por respuesta. Solo se insertan filas, nunca se sobrescriben, así que varios
-- dispositivos pueden estudiar a la vez sin pisarse. El id lo genera el cliente (reintentar no duplica)
-- y created_at es el momento real de la respuesta, aunque se suba más tarde por estar sin conexión.
create table if not exists public.answers (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject text not null,
  question_id int not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists answers_user_subject on public.answers (user_id, subject, question_id, created_at);

alter table public.answers enable row level security;

drop policy if exists "own answers" on public.answers;
create policy "own answers" on public.answers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Aciertos, fallos y si la última respuesta fue correcta, por pregunta.
-- security_invoker: la vista respeta el RLS de answers (cada usuario ve solo lo suyo).
create or replace view public.question_stats with (security_invoker = true) as
select
  subject,
  question_id,
  count(*) filter (where ok)::int as c,
  count(*) filter (where not ok)::int as w,
  (array_agg(ok order by created_at desc))[1] as l
from public.answers
group by subject, question_id;
