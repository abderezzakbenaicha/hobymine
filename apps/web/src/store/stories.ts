import { create } from 'zustand';
import { api } from '../lib/api';
import type { ChatMessage, Story, StoryGroup } from '../types';

interface StoriesState {
  groups: StoryGroup[];
  loading: boolean;
  /** True once the rail has been fetched at least once. */
  loaded: boolean;
  load: (options?: { silent?: boolean }) => Promise<void>;
  /** Post a story with an uploaded image URL. */
  post: (mediaUrl: string, caption: string) => Promise<Story>;
  /** Toggle a like on someone else's story and return the new total. */
  toggleLike: (storyId: string) => Promise<{ liked: boolean; likes: number }>;
  /** Send a comment; it is delivered as a direct message to the author. */
  reply: (storyId: string, body: string) => Promise<{ message: ChatMessage; matchId: string }>;
  /** Mark a story watched, so the ring stops glowing for the viewer. */
  markSeen: (storyId: string) => Promise<void>;
  remove: (storyId: string) => Promise<void>;
  /** Merge a story pushed over the socket into the rail. */
  receive: (payload: { userId: string; story: Story; author: StoryGroup['user'] }) => void;
  /** Apply a like tally pushed to the author. */
  applyActivity: (payload: { storyId: string; likes: number }) => void;
  reset: () => void;
}

/** Adds or replaces a story inside a group, keeping the rail ordered. */
function withStory(groups: StoryGroup[], userId: string, story: Story, author: StoryGroup['user']): StoryGroup[] {
  const next = [...groups];
  const index = next.findIndex((group) => group.user.id === userId);
  if (index === -1) {
    return [
      {
        user: author,
        mine: false,
        storyCount: 1,
        updatedAt: story.createdAt,
        seen: story.seen,
        stories: [story],
      },
      ...next,
    ];
  }
  const group = next[index];
  if (group.stories.some((item) => item.id === story.id)) return groups;
  next[index] = {
    ...group,
    stories: [...group.stories, story],
    storyCount: group.storyCount + 1,
    updatedAt: story.createdAt,
    seen: group.seen && story.seen,
  };
  return next;
}

export const useStoriesStore = create<StoriesState>((set, get) => ({
  groups: [],
  loading: false,
  loaded: false,

  load: async (options) => {
    if (!options?.silent) set({ loading: true });
    try {
      const data = await api.get<{ stories: StoryGroup[] }>('/api/stories');
      set({ groups: data.stories ?? [], loaded: true });
    } catch {
      // The rail is an enhancement: a failure must never break Discover.
    } finally {
      set({ loading: false });
    }
  },

  post: async (mediaUrl, caption) => {
    const data = await api.post<{ story: Story }>('/api/stories', { mediaUrl, caption });
    // Refresh so the author's own group (and its ordering) is authoritative.
    await get().load({ silent: true });
    return data.story;
  },

  toggleLike: async (storyId) => {
    const data = await api.post<{ liked: boolean; likes: number }>(
      `/api/stories/${storyId}/like`,
      {},
    );
    set({
      groups: get().groups.map((group) => ({
        ...group,
        stories: group.stories.map((story) =>
          story.id === storyId ? { ...story, liked: data.liked, likes: data.likes } : story,
        ),
      })),
    });
    return data;
  },

  reply: async (storyId, body) => {
    const data = await api.post<{ message: ChatMessage; matchId: string }>(
      `/api/stories/${storyId}/reply`,
      { body },
    );
    return data;
  },

  markSeen: async (storyId) => {
    set({
      groups: get().groups.map((group) => {
        const stories = group.stories.map((story) =>
          story.id === storyId ? { ...story, seen: true } : story,
        );
        return { ...group, stories, seen: stories.every((story) => story.seen) };
      }),
    });
    try {
      await api.post(`/api/stories/${storyId}/view`, {});
    } catch {
      // A missing view row only costs the ring state on the next load.
    }
  },

  remove: async (storyId) => {
    await api.delete(`/api/stories/${storyId}`);
    set({
      groups: get()
        .groups.map((group) => ({
          ...group,
          stories: group.stories.filter((story) => story.id !== storyId),
          storyCount: group.stories.filter((story) => story.id !== storyId).length,
        }))
        .filter((group) => group.stories.length > 0),
    });
  },

  receive: ({ userId, story, author }) => {
    set({ groups: withStory(get().groups, userId, story, author) });
  },

  applyActivity: ({ storyId, likes }) => {
    set({
      groups: get().groups.map((group) => ({
        ...group,
        stories: group.stories.map((story) =>
          story.id === storyId ? { ...story, likes } : story,
        ),
      })),
    });
  },

  reset: () => set({ groups: [], loading: false, loaded: false }),
}));