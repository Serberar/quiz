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

-- Por pregunta: aciertos (c), fallos (w), si la última fue correcta (l), aciertos seguidos al
-- final (s), última respuesta (t) y primera respuesta (f). La app calcula con esto cuándo toca repasar.
-- security_invoker: la vista respeta el RLS de answers (cada usuario ve solo lo suyo).
create or replace view public.question_stats with (security_invoker = true) as
with a as (
  select
    subject,
    question_id,
    ok,
    created_at,
    max(created_at) filter (where not ok) over (partition by subject, question_id) as last_wrong
  from public.answers
)
select
  subject,
  question_id,
  count(*) filter (where ok)::int as c,
  count(*) filter (where not ok)::int as w,
  (array_agg(ok order by created_at desc))[1] as l,
  count(*) filter (where ok and (last_wrong is null or created_at > last_wrong))::int as s,
  max(created_at) as t,
  min(created_at) as f
from a
group by subject, question_id;

-- Nota de cada asignatura en los tests mixtos (repaso general y sesión diaria):
-- [{ "subject", "total", "correct", "wrong", "skipped", "grade" }]
alter table public.attempts add column if not exists details jsonb;

-- Preguntas marcadas como dudosas para revisarlas
create table if not exists public.flags (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject text not null,
  question_id int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, subject, question_id)
);

alter table public.flags enable row level security;

drop policy if exists "own flags" on public.flags;
create policy "own flags" on public.flags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Asignaturas añadidas desde la app (Configuración)
create table if not exists public.custom_subjects (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  count int not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);

alter table public.custom_subjects enable row level security;

drop policy if exists "own custom subjects" on public.custom_subjects;
create policy "own custom subjects" on public.custom_subjects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ajustes de cada usuario en clave/valor (fecha del examen)
create table if not exists public.user_settings (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  value jsonb not null,
  primary key (user_id, key)
);

alter table public.user_settings enable row level security;

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
