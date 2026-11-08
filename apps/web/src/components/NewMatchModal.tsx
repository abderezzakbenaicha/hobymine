import { AnimatePresence, motion } from 'framer-motion';
import { Heart, MessageCircle, X } from 'lucide-react';
import { useEffect, useMemo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { Avatar } from './Avatar';
import { LogoMark } from './Logo';

const CONFETTI_COLORS = ['#EC1350', '#FF8AA2', '#E3124C', '#6FD3FF', '#FF5C8A', '#FFFFFF'];

export function NewMatchModal() {
  const match = useUiStore((state) => state.newMatch);
  const dismiss = useUiStore((state) => state.dismissMatch);
  const me = useAuthStore((state) => state.user);
  const loadConversations = useChatStore((state) => state.loadConversations);
  const navigate = useNavigate();

  useEffect(() => {
    if (!match) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void loadConversations();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [match, loadConversations]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.4 + Math.random() * 2.2,
        size: 5 + Math.random() * 7,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        dx: `${Math.random() * 160 - 80}px`,
        rotate: Math.random() * 360,
      })),
    [match?.id],
  );

  if (!match || !me) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        /* A celebration moment: it stays neon-on-dark in either theme. */
        className="force-dark fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden bg-ink-950/95 px-6 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((piece) => (
            <span
              key={piece.id}
              className="absolute top-0 animate-confetti-fall rounded-sm"
              style={
                {
                  left: `${piece.left}%`,
                  width: piece.size,
                  height: piece.size * 1.8,
                  backgroundColor: piece.color,
                  animationDelay: `${piece.delay}s`,
                  animationDuration: `${piece.duration}s`,
                  '--dx': piece.dx,
                  transform: `rotate(${piece.rotate}deg)`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <motion.div
          className="absolute -top-24 h-72 w-72 rounded-full bg-neon/20 blur-[6.25rem]"
          animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 4, repeat: Infinity }}
        />

        <motion.div
          className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
          initial={{ scale: 0.85, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          <LogoMark className="mb-5 h-10 w-10" />
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.35em] text-neon">
            It’s happening
          </p>
          <h1 className="mt-3 bg-neon-gradient bg-clip-text text-5xl font-black tracking-[-0.05em] text-transparent sm:text-6xl">
            It’s a match
          </h1>
          <p className="mt-2 text-sm text-ink-300">
            You and {match.user.name.split(' ')[0]} liked each other.
          </p>

          <div className="relative my-9 flex items-center justify-center">
            <motion.div
              initial={{ x: -24, rotate: -7 }}
              animate={{ x: 0, rotate: -5 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 220 }}
            >
              <Avatar
                name={me.name}
                photos={me.photos}
                id={me.id}
                size="2xl"
                className="ring-4 ring-ink-950"
              />
            </motion.div>
            <motion.div
              className="absolute z-20 flex h-12 w-12 items-center justify-center rounded-full bg-neon-gradient shadow-glow"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 400, damping: 16 }}
            >
              <Heart className="h-6 w-6 fill-ink-950 text-ink-950" />
            </motion.div>
            <motion.div
              initial={{ x: 24, rotate: 7 }}
              animate={{ x: 0, rotate: 5 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 220 }}
              className="-ml-5"
            >
              <Avatar
                name={match.user.name}
                photos={match.user.photos}
                id={match.user.id}
                size="2xl"
                online={match.user.online}
                className="ring-4 ring-ink-950"
              />
            </motion.div>
          </div>

          <div className="grid w-full gap-3">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => {
                dismiss();
                navigate(`/chat/${match.id}`);
              }}
            >
              <MessageCircle className="h-4 w-4" />
              Say hi to {match.user.name.split(' ')[0]}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                dismiss();
                navigate('/discover');
              }}
            >
              <X className="h-4 w-4" />
              Keep swiping
            </button>
          </div>

          <p className="mt-6 text-[0.6875rem] text-ink-500">
            Tip: send the first message. It’s almost always worth it.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
