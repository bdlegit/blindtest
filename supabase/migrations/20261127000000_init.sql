-- BLIND TEST PARTY — schéma initial
-- Principe de sécurité : toutes les écritures passent par les routes API Next.js
-- (clé service_role côté serveur). Le navigateur (clé anon) peut seulement LIRE
-- l'état public des salles et des joueurs, pour le temps réel.
-- Les réponses attendues, les réponses des joueurs et les jetons secrets ne
-- sont jamais lisibles avec la clé anon.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────── SALLES (état public)
create table public.rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  settings         jsonb not null,
  -- lobby | countdown | playing | reveal | scores | finished
  phase            text not null default 'lobby',
  round_index      int  not null default -1,
  total_rounds     int  not null default 0,
  phase_started_at timestamptz,
  phase_ends_at    timestamptz,
  paused_at        timestamptz,
  answered_count   int  not null default 0,
  -- infos publiques de la manche en cours (catégorie, choix QCM, et la
  -- révélation UNIQUEMENT une fois la manche terminée)
  public_round     jsonb,
  final_stats      jsonb,
  version          int  not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index rooms_finished_idx on public.rooms (finished_at desc) where finished_at is not null;

-- ─────────────────────────────────────────── SECRETS (jamais exposés)
create table public.room_secrets (
  room_id         uuid primary key references public.rooms(id) on delete cascade,
  host_token_hash text not null
);

-- ─────────────────────────────────────────── MORCEAUX D'UNE PARTIE (privés)
create table public.room_tracks (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms(id) on delete cascade,
  position       int  not null,
  provider       text not null,           -- deezer | upload
  provider_ref   text not null,           -- id Deezer ou chemin de stockage
  title          text not null,
  artist         text not null,
  title_aliases  text[] not null default '{}',
  artist_aliases text[] not null default '{}',
  category       text,
  cover_url      text,
  start_at       numeric not null default 0,
  duration       numeric not null default 20,
  choices        jsonb,                   -- QCM : [{id,label}] + bonne réponse côté serveur
  correct_choice text,
  unique (room_id, position)
);

-- ─────────────────────────────────────────── JOUEURS (public)
create table public.players (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references public.rooms(id) on delete cascade,
  nickname          text not null,
  avatar            text not null default '🎧',
  color             text not null default '#ff2bd6',
  score             int  not null default 0,
  last_round_points int  not null default 0,
  correct_count     int  not null default 0,
  kicked            boolean not null default false,
  created_at        timestamptz not null default now()
);
create index players_room_idx on public.players (room_id);
create unique index players_room_nick_idx on public.players (room_id, lower(nickname)) where not kicked;

create table public.player_secrets (
  player_id  uuid primary key references public.players(id) on delete cascade,
  token_hash text not null unique
);

-- ─────────────────────────────────────────── HISTORIQUE (public, page d'accueil)
create table public.game_history (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid references public.rooms(id) on delete set null,
  room_name    text not null,
  player_count int  not null,
  rounds       int  not null,
  podium       jsonb not null,   -- [{nickname, avatar, color, score}]
  finished_at  timestamptz not null default now()
);
create index game_history_finished_idx on public.game_history (finished_at desc);

-- ─────────────────────────────────────────── RÉPONSES (privées)
create table public.answers (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  round_index  int  not null,
  player_id    uuid not null references public.players(id) on delete cascade,
  attempts     int  not null default 0,
  found_title  boolean not null default false,
  found_artist boolean not null default false,
  title_ms     int,
  artist_ms    int,
  points       int  not null default 0,
  guesses      text[] not null default '{}',
  choice       text,
  done         boolean not null default false,
  updated_at   timestamptz not null default now(),
  unique (room_id, round_index, player_id)
);

-- ─────────────────────────────────────────── BIBLIOTHÈQUE PERSO
create table public.playlists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.library_tracks (
  id             uuid primary key default gen_random_uuid(),
  playlist_id    uuid not null references public.playlists(id) on delete cascade,
  provider       text not null,       -- deezer | upload
  provider_ref   text not null,
  title          text not null,
  artist         text not null,
  title_aliases  text[] not null default '{}',
  artist_aliases text[] not null default '{}',
  category       text,
  cover_url      text,
  start_at       numeric not null default 0,
  duration       numeric not null default 20,
  created_at     timestamptz not null default now()
);
create index library_tracks_playlist_idx on public.library_tracks (playlist_id);

-- ─────────────────────────────────────────── RLS
alter table public.rooms          enable row level security;
alter table public.room_secrets   enable row level security;
alter table public.room_tracks    enable row level security;
alter table public.players        enable row level security;
alter table public.player_secrets enable row level security;
alter table public.answers        enable row level security;
alter table public.playlists      enable row level security;
alter table public.library_tracks enable row level security;
alter table public.game_history   enable row level security;

-- lecture seule publique de l'état des salles et des joueurs
create policy "rooms are readable"   on public.rooms   for select to anon, authenticated using (true);
create policy "players are readable" on public.players for select to anon, authenticated using (true);
create policy "history is readable"  on public.game_history for select to anon, authenticated using (true);
-- aucune policy sur les autres tables : inaccessibles avec la clé anon.

revoke insert, update, delete on public.rooms, public.players, public.game_history from anon, authenticated;
revoke all on public.room_secrets, public.room_tracks, public.player_secrets,
              public.answers, public.playlists, public.library_tracks from anon, authenticated;

-- ─────────────────────────────────────────── TEMPS RÉEL
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;

-- ─────────────────────────────────────────── FONCTIONS ATOMIQUES

-- Recalcule le nombre de joueurs ayant répondu à la manche courante.
create or replace function public.refresh_answered_count(p_room uuid, p_round int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from answers a
    join players p on p.id = a.player_id and not p.kicked
   where a.room_id = p_room and a.round_index = p_round and a.attempts > 0;
  update rooms set answered_count = n, updated_at = now(), version = version + 1
   where id = p_room and round_index = p_round;
  return n;
end $$;

-- Applique les points de la manche aux joueurs (appelé une seule fois, au moment de la révélation).
create or replace function public.apply_round_scores(p_room uuid, p_round int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update players p set
    last_round_points = coalesce(a.points, 0),
    score = p.score + coalesce(a.points, 0),
    correct_count = p.correct_count
      + (case when a.found_title or a.found_artist then 1 else 0 end)
  from players p2
  left join answers a on a.player_id = p2.id and a.room_id = p_room and a.round_index = p_round
  where p.id = p2.id and p.room_id = p_room;
end $$;

revoke execute on function public.refresh_answered_count(uuid, int) from public, anon, authenticated;
revoke execute on function public.apply_round_scores(uuid, int) from public, anon, authenticated;
grant execute on function public.refresh_answered_count(uuid, int) to service_role;
grant execute on function public.apply_round_scores(uuid, int) to service_role;

-- ─────────────────────────────────────────── STOCKAGE (fichiers importés)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', false, 26214400,
        array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/webm','audio/flac'])
on conflict (id) do nothing;
