import { FileText, ShieldCheck } from 'lucide-react';

export type LegalKind = 'terms' | 'privacy';

const UPDATED = 'October 2026';

interface Section {
  title: string;
  body: string[];
}

const TERMS: Section[] = [
  {
    title: '1. Who can use HobyMine',
    body: [
      'You must be at least 18 years old to create an account. By signing up you confirm that you are 18 or older and that the information you provide is accurate. Accounts that belong to anyone under 18 are removed as soon as we become aware of them.',
      'You may hold one account, use your real photos, and keep your login details private. You are responsible for activity that happens on your account.',
    ],
  },
  {
    title: '2. Being a good member',
    body: [
      'HobyMine exists for genuine dating and conversation. You agree not to harass, threaten, impersonate, or defraud anyone; not to send unsolicited explicit content; not to advertise, spam, or promote scams; and not to use the app for anything illegal.',
      'You keep the rights to the content you upload, but you grant HobyMine a licence to host and display it inside the app so that other members can see your profile and messages.',
    ],
  },
  {
    title: '3. Reporting and blocking',
    body: [
      'Every profile and chat has a Report and a Block control. Reports are confidential: the person you report is not told who reported them. Blocking is mutual and immediate, removes any match between you, and stops both people from finding or messaging each other.',
      'We review reports and may warn, restrict, suspend, or permanently remove an account. We may also remove content that breaks these terms.',
    ],
  },
  {
    title: '4. Safety',
    body: [
      'HobyMine does not run criminal background checks and cannot guarantee anyone\u2019s identity or intentions. Meet in public places, tell a friend where you are going, and never send money or identity documents to another member.',
      'If you are in immediate danger, contact your local emergency services. HobyMine is not an emergency service.',
    ],
  },
  {
    title: '5. HobyMine Plus',
    body: [
      'Plus is an optional membership that unlocks extra features such as boosts, read receipts, and the list of people who like you. Prices and features are shown before you subscribe. This demo build simulates purchases and does not charge real money.',
    ],
  },
  {
    title: '6. Ending your account',
    body: [
      'You can stop using HobyMine at any time and ask us to delete your account and data. We may suspend or end your access if you break these terms or if we are required to by law.',
    ],
  },
  {
    title: '7. Changes and liability',
    body: [
      'We may update these terms as the product changes. Material changes will be announced in the app before they take effect. The service is provided \u201cas is\u201d to the extent permitted by law.',
      'This is an independent portfolio demo, not affiliated with any dating brand. All profiles and photos in the demo are generated for demonstration.',
    ],
  },
];

const PRIVACY: Section[] = [
  {
    title: '1. What we collect',
    body: [
      'Account details: your name, email address, age, gender, country, and password (stored only as a salted hash).',
      'Profile content: photos, bio, job, interests, and messages, photos, and voice notes you choose to share in a chat.',
      'Usage and safety data: likes, matches, profile views, reports, blocks, verification attempts, and the times you sign in.',
      'Approximate location: only when you allow it, so we can show nearby people and distances. You can turn location off in your device settings.',
    ],
  },
  {
    title: '2. Why we use it',
    body: [
      'To run the service: show profiles, match people, deliver messages in real time, and keep your account secure.',
      'To keep people safe: review reports, enforce blocks, detect spam and fake profiles, and respond to abuse.',
      'To improve HobyMine: understand which features work and fix problems. We do not sell your personal data.',
    ],
  },
  {
    title: '3. Who can see what',
    body: [
      'Other members see your public profile, your approximate distance, and the messages you send them. They never see your email address, exact location, or password.',
      'Safety reports are visible only to the people who review them. People you block cannot see your profile or contact you.',
    ],
  },
  {
    title: '4. How long we keep data',
    body: [
      'We keep your account data while your account is open. Reports and block records are kept for a limited period so that repeat behaviour can be recognised, then deleted or anonymised.',
      'When you delete your account, your profile and messages are removed from the service, apart from records we must keep for legal or safety reasons.',
    ],
  },
  {
    title: '5. Your choices and rights',
    body: [
      'You can edit or delete your profile content, turn off background alerts, clear your view history, and ask for a copy or deletion of your data.',
      'Depending on where you live, you may also have the right to object to certain processing or lodge a complaint with your local data protection authority.',
    ],
  },
  {
    title: '6. Security and age',
    body: [
      'We use encryption in transit where the deployment supports it, hashed passwords, and access controls. No online service is completely secure, so use a strong, unique password.',
      'HobyMine is strictly for adults. We do not knowingly collect data from anyone under 18. If you believe a minor is using the app, report the profile immediately.',
    ],
  },
  {
    title: '7. Contact',
    body: [
      'Questions about privacy or these terms can be sent to the safety team through the Safety screen in the app. This demo stores data locally for portfolio purposes unless a hosted API is configured.',
    ],
  },
];

const COPY: Record<LegalKind, { title: string; intro: string; sections: Section[] }> = {
  terms: {
    title: 'Terms of Service',
    intro:
      'These terms explain the rules for using HobyMine, what you can expect from us, and what we expect from you.',
    sections: TERMS,
  },
  privacy: {
    title: 'Privacy Policy',
    intro:
      'This policy explains what HobyMine collects, why we collect it, who can see it, and the control you have over it.',
    sections: PRIVACY,
  },
};

/**
 * The legal document itself, without page chrome, so it can be shown either as
 * a standalone page or as an overlay during sign up.
 */
export function LegalDocument({
  kind,
  className,
}: {
  kind: LegalKind;
  className?: string;
}) {
  const copy = COPY[kind];

  return (
    <div className={className}>
      <header>
        <p className="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-[0.28em] text-neon">
          {kind === 'terms' ? (
            <FileText className="h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          Legal
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] sm:text-4xl">{copy.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-300">{copy.intro}</p>
        <p className="mt-3 text-[0.6875rem] text-ink-500">Last updated {UPDATED}</p>
      </header>

      <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-[0.6875rem] leading-relaxed text-ink-400">
        HobyMine is an independent portfolio demo. This document is written for the demo experience
        and is not legal advice. The production service would publish reviewed terms before launch.
      </div>

      <article className="mt-6 space-y-7">
        {copy.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-sm font-bold text-white">{section.title}</h2>
            <div className="mt-2 space-y-2.5">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-[0.8125rem] leading-relaxed text-ink-300">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </article>
    </div>
  );
}
