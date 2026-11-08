import { Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { ApiClientError, api } from '../lib/api';
import { prepareImageForUpload } from '../lib/image';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';
import { useStoriesStore } from '../store/stories';
import type { StoryGroup } from '../types';
import { Avatar } from './Avatar';
import { StoryViewer } from './StoryViewer';

/**
 * The private story rail at the top of Discover.
 *
 * Only the author and their matches ever appear here — the API filters every
 * read by match, so nothing posted here is public. Stories disappear by
 * themselves 24 hours after they are posted.
 */
export function StoriesRail() {
  const user = useAuthStore((state) => state.user);
  const groups = useStoriesStore((state) => state.groups);
  const loading = useStoriesStore((state) => state.loading);
  const loaded = useStoriesStore((state) => state.loaded);
  const load = useStoriesStore((state) => state.load);
  const post = useStoriesStore((state) => state.post);

  const [uploading, setUploading] = useState(false);
  const [viewerGroup, setViewerGroup] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const mine = groups.find((group) => group.mine) ?? null;
  const others = groups.filter((group) => !group.mine);

  const openComposer = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const uploadStory = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose a photo for your story');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Story photos must be under 10 MB');
      return;
    }

    setUploading(true);
    try {
      const prepared = await prepareImageForUpload(file);
      const form = new FormData();
      form.append('file', prepared.file);
      const uploaded = await api.upload<{ url: string }>('/api/uploads', form);
      await post(uploaded.url, '');
      toast.success('Story posted', {
        description: 'Only people you matched with can see it. It disappears in 24 hours.',
      });
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not post your story');
    } finally {
      setUploading(false);
    }
  };

  const openGroup = (group: StoryGroup): void => {
    const index = groups.findIndex((item) => item.user.id === group.user.id);
    if (index >= 0) setViewerGroup(index);
  };

  return (
    <section aria-label="Stories" className="mt-3 sm:mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-[0.22em] text-ink-400">
          <Sparkles className="h-3 w-3 text-neon" aria-hidden="true" />
          Stories
        </h2>
        <p className="truncate text-[0.5625rem] font-medium uppercase tracking-[0.12em] text-ink-500">
          Matches only
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Your story: the tile opens it, the badge adds another. */}
        <div className="flex w-[3.75rem] shrink-0 flex-col items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={mine ? () => openGroup(mine) : openComposer}
              disabled={uploading}
              className={cn(
                'relative grid h-14 w-14 place-items-center rounded-full p-[2px] transition disabled:opacity-60',
                mine
                  ? 'bg-gradient-to-br from-neon via-rose to-violet'
                  : 'bg-white/10 hover:bg-white/20',
              )}
              aria-label={mine ? 'Open your story' : 'Add a story'}
            >
              <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-ink-900">
                {user ? (
                  <Avatar name={user.name} photos={user.photos} id={user.id} size="md" />
                ) : null}
              </span>
            </button>
            <button
              type="button"
              onClick={openComposer}
              disabled={uploading}
              className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-ink-950 bg-neon text-ink-950 shadow-glow-sm transition hover:brightness-110 disabled:opacity-60"
              aria-label="Add a story"
            >
              <Plus className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            </button>
          </div>
          <span className="w-full truncate text-center text-[0.5625rem] font-semibold text-ink-300">
            {uploading ? 'Posting…' : 'Your story'}
          </span>
        </div>

        {others.map((group) => (
          <button
            key={group.user.id}
            type="button"
            onClick={() => openGroup(group)}
            className="flex w-[3.75rem] shrink-0 flex-col items-center gap-1.5 outline-none"
          >
            <span
              className={cn(
                'grid h-14 w-14 place-items-center rounded-full p-[2px] transition',
                group.seen
                  ? 'bg-white/15'
                  : 'bg-gradient-to-br from-neon via-rose to-violet shadow-glow-sm',
              )}
            >
              <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-ink-900 ring-2 ring-ink-950">
                <Avatar
                  name={group.user.name}
                  photos={group.user.photos}
                  id={group.user.id}
                  size="md"
                />
              </span>
            </span>
            <span className="w-full truncate text-center text-[0.5625rem] font-semibold text-ink-300">
              {group.user.name.split(' ')[0]}
            </span>
          </button>
        ))}

        {!loading && others.length === 0 && (
          <p className="flex min-w-0 flex-1 items-center text-[0.625rem] leading-relaxed text-ink-500">
            Stories from your matches will appear here.
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void uploadStory(event)}
      />

      {viewerGroup !== null && groups[viewerGroup] && (
        <StoryViewer
          groups={groups}
          initialGroup={viewerGroup}
          onClose={() => setViewerGroup(null)}
        />
      )}
    </section>
  );
}