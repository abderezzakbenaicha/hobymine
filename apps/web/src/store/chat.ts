import { create } from 'zustand';
import { api } from '../lib/api';
import type {
  ChatMessage,
  LikesResponse,
  MatchSummary,
  MatchesResponse,
  MessagesResponse,
  PublicUser,
  ReactionSummary,
  SwipeResponse,
} from '../types';
import { useAuthStore } from './auth';

const typingTimers = new Map<string, number>();

interface ChatState {
  conversations: MatchSummary[];
  messages: Record<string, ChatMessage[]>;
  hasMore: Record<string, boolean>;
  typing: Record<string, boolean>;
  activeMatchId: string | null;
  loadingConversations: boolean;
  loadingMessages: Record<string, boolean>;
  likesYouCount: number;
  likes: PublicUser[];
  likesLimited: boolean;
  likesLoaded: boolean;
  loadingLikes: boolean;
  loadConversations: () => Promise<void>;
  loadLikes: (force?: boolean) => Promise<void>;
  loadMatch: (matchId: string) => Promise<MatchSummary | null>;
  loadMessages: (matchId: string) => Promise<void>;
  sendMessage: (
    matchId: string,
    input: {
      kind: 'text' | 'image' | 'voice' | 'file';
      body?: string;
      mediaUrl?: string;
      fileName?: string;
      fileSize?: number;
      duration?: number;
    },
  ) => Promise<ChatMessage | null>;
  reactToMessage: (
    matchId: string,
    messageId: string,
    emoji: string | null,
  ) => Promise<void>;
  applyReactions: (
    matchId: string,
    messageId: string,
    reactions: ReactionSummary[],
  ) => void;
  markRead: (matchId: string) => Promise<void>;
  setActive: (matchId: string | null) => void;
  addIncoming: (message: ChatMessage) => void;
  applyRead: (matchId: string, readerId: string, readAt: string) => void;
  setTyping: (matchId: string, isTyping: boolean) => void;
  removeMatch: (matchId: string) => void;
  bumpLikes: (count: number) => void;
  removeLike: (userId: string) => void;
  applySwipeResult: (result: SwipeResponse) => void;
  reset: () => void;
}

function updateConversation(
  conversations: MatchSummary[],
  message: ChatMessage,
  incrementUnread: boolean,
): MatchSummary[] {
  return conversations.map((conversation) =>
    conversation.id === message.matchId
      ? {
          ...conversation,
          lastMessage: message,
          isNew: false,
          unreadCount: incrementUnread
            ? conversation.unreadCount + 1
            : conversation.unreadCount,
        }
      : conversation,
  );
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: {},
  hasMore: {},
  typing: {},
  activeMatchId: null,
  loadingConversations: false,
  loadingMessages: {},
  likesYouCount: 0,
  likes: [],
  likesLimited: false,
  likesLoaded: false,
  loadingLikes: false,

  loadConversations: async () => {
    set({ loadingConversations: true });
    try {
      const data = await api.get<MatchesResponse>('/api/matches');
      set({ conversations: data.matches, likesYouCount: data.likesYouCount });
    } finally {
      set({ loadingConversations: false });
    }
  },

  loadLikes: async (force = false) => {
    if (!force && get().likesLoaded) return;
    set({ loadingLikes: true });
    try {
      const data = await api.get<LikesResponse>('/api/likes');
      set({
        likes: data.users,
        likesLimited: data.limited,
        likesYouCount: data.count,
        likesLoaded: true,
      });
    } finally {
      set({ loadingLikes: false });
    }
  },

  loadMatch: async (matchId) => {
    try {
      const data = await api.get<{ match: MatchSummary }>(`/api/matches/${matchId}`);
      set((state) => {
        const exists = state.conversations.some((conversation) => conversation.id === matchId);
        return {
          conversations: exists
            ? state.conversations.map((conversation) =>
                conversation.id === matchId ? data.match : conversation,
              )
            : [data.match, ...state.conversations],
        };
      });
      return data.match;
    } catch {
      return null;
    }
  },

  loadMessages: async (matchId) => {
    set((state) => ({
      loadingMessages: { ...state.loadingMessages, [matchId]: true },
    }));
    try {
      const data = await api.get<MessagesResponse>(
        `/api/matches/${matchId}/messages?limit=80`,
      );
      set((state) => ({
        messages: { ...state.messages, [matchId]: data.messages },
        hasMore: { ...state.hasMore, [matchId]: data.hasMore },
      }));
    } finally {
      set((state) => ({
        loadingMessages: { ...state.loadingMessages, [matchId]: false },
      }));
    }
  },

  sendMessage: async (matchId, input) => {
    const data = await api.post<{ message: ChatMessage }>(
      `/api/matches/${matchId}/messages`,
      input,
    );
    const me = useAuthStore.getState().user?.id;
    set((state) => {
      const existing = state.messages[matchId] ?? [];
      if (existing.some((message) => message.id === data.message.id)) return state;
      return {
        messages: { ...state.messages, [matchId]: [...existing, data.message] },
        conversations: updateConversation(
          state.conversations,
          data.message,
          data.message.senderId !== me,
        ),
      };
    });
    return data.message;
  },

  reactToMessage: async (matchId, messageId, emoji) => {
    try {
      const path = `/api/matches/${matchId}/messages/${messageId}/reactions`;
      const data = emoji
        ? await api.post<{ reactions: ReactionSummary[] }>(path, { emoji })
        : await api.delete<{ reactions: ReactionSummary[] }>(path);
      get().applyReactions(matchId, messageId, data.reactions);
    } catch {
      // The reaction stays as it was; the next update will correct it.
    }
  },

  applyReactions: (matchId, messageId, reactions) => {
    set((state) => {
      const messages = state.messages[matchId];
      if (!messages) return state;
      return {
        messages: {
          ...state.messages,
          [matchId]: messages.map((message) =>
            message.id === messageId ? { ...message, reactions } : message,
          ),
        },
      };
    });
  },

  markRead: async (matchId) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === matchId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    }));
    try {
      await api.post(`/api/matches/${matchId}/read`);
    } catch {
      // Read state will be repaired on the next fetch.
    }
  },

  setActive: (matchId) => {
    set({ activeMatchId: matchId });
    if (matchId) void get().markRead(matchId);
  },

  addIncoming: (message) => {
    const me = useAuthStore.getState().user?.id;
    let needsConversation = false;

    set((state) => {
      const existing = state.messages[message.matchId];
      let messages = state.messages;
      if (existing) {
        if (existing.some((entry) => entry.id === message.id)) {
          return state;
        }
        messages = { ...state.messages, [message.matchId]: [...existing, message] };
      }

      const known = state.conversations.some(
        (conversation) => conversation.id === message.matchId,
      );
      if (!known) needsConversation = true;

      return {
        messages,
        conversations: known
          ? updateConversation(
              state.conversations,
              message,
              message.senderId !== me && state.activeMatchId !== message.matchId,
            )
          : state.conversations,
      };
    });

    if (needsConversation) void get().loadConversations();
    if (
      message.senderId !== me &&
      get().activeMatchId === message.matchId
    ) {
      void get().markRead(message.matchId);
    }
  },

  applyRead: (matchId, readerId, readAt) => {
    const me = useAuthStore.getState().user?.id;
    set((state) => ({
      messages: {
        ...state.messages,
        [matchId]: (state.messages[matchId] ?? []).map((message) =>
          message.senderId !== readerId ? { ...message, readAt } : message,
        ),
      },
      conversations: state.conversations.map((conversation) =>
        conversation.id === matchId
          ? {
              ...conversation,
              unreadCount: readerId === me ? 0 : conversation.unreadCount,
            }
          : conversation,
      ),
    }));
  },

  setTyping: (matchId, isTyping) => {
    const existing = typingTimers.get(matchId);
    if (existing) window.clearTimeout(existing);

    set((state) => ({ typing: { ...state.typing, [matchId]: isTyping } }));

    if (isTyping) {
      const timer = window.setTimeout(() => {
        set((state) => ({ typing: { ...state.typing, [matchId]: false } }));
        typingTimers.delete(matchId);
      }, 5000);
      typingTimers.set(matchId, timer);
    }
  },

  removeMatch: (matchId) => {
    set((state) => {
      const messages = { ...state.messages };
      delete messages[matchId];
      return {
        conversations: state.conversations.filter(
          (conversation) => conversation.id !== matchId,
        ),
        messages,
        activeMatchId: state.activeMatchId === matchId ? null : state.activeMatchId,
      };
    });
  },

  bumpLikes: (count) => set({ likesYouCount: count }),

  removeLike: (userId) =>
    set((state) => ({
      likes: state.likes.filter((person) => person.id !== userId),
    })),

  applySwipeResult: (result) => {
    set((state) => ({
      likesYouCount: result.likesYouCount,
      likes: result.match
        ? state.likes.filter((person) => person.id !== result.match?.user.id)
        : state.likes,
    }));
    if (result.match) {
      const exists = get().conversations.some(
        (conversation) => conversation.id === result.match?.id,
      );
      if (!exists) {
        set((state) => ({
          conversations: [result.match as MatchSummary, ...state.conversations],
        }));
      }
    }
  },

  reset: () => {
    for (const timer of typingTimers.values()) window.clearTimeout(timer);
    typingTimers.clear();
    set({
      conversations: [],
      messages: {},
      hasMore: {},
      typing: {},
      activeMatchId: null,
      loadingConversations: false,
      loadingMessages: {},
      likesYouCount: 0,
      likes: [],
      likesLimited: false,
      likesLoaded: false,
      loadingLikes: false,
    });
  },
}));
