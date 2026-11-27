-- Correctif pour un projet où la migration initiale a déjà été exécutée
-- (erreur « permission denied for table … »). À exécuter une fois dans le SQL Editor.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on public.rooms, public.players, public.game_history to anon, authenticated;
revoke insert, update, delete on public.rooms, public.players, public.game_history from anon, authenticated;
revoke all on public.room_secrets, public.room_tracks, public.player_secrets,
              public.answers, public.playlists, public.library_tracks from anon, authenticated;
grant execute on function public.refresh_answered_count(uuid, int) to service_role;
grant execute on function public.apply_round_scores(uuid, int) to service_role;
