-- Public bucket for user media (photos, voice notes, chat attachments,
-- verification selfies, story media).
--
-- A cloud host gives the API an ephemeral disk, so uploads must live here to
-- survive a deploy or restart. The bucket is public so the app can render
-- images with a plain URL; only the API's server-side secret can write to it.
--
-- `apps/api` creates the bucket on boot as well, so applying this migration is
-- optional — it just records the intended state.

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 10 * 1024 * 1024)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;
