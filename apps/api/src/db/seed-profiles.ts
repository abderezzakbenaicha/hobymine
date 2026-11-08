import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { closeDb, initDb, sql } from './index.js';

/**
 * Launch seeding for HobyMine.
 *
 * Inserts 100 believable profiles (50 women, 50 men) across four launch markets
 * — the Philippines, Colombia, Brazil and Morocco — 25 people per market. They
 * behave like normal members: they appear in Discovery, can be liked and
 * matched, and carry portraits. Every row is flagged `is_seeded = TRUE`, so the
 * whole batch can be removed later with a single statement:
 *
 *   DELETE FROM users WHERE is_seeded = TRUE;
 *
 * Usage (stop the API first — the embedded PGlite store is single-writer):
 *   npm run seed:profiles
 *   npm run seed:clear
 *
 * The script is idempotent: IDs are deterministic and inserts use
 * `ON CONFLICT DO NOTHING`, so running it twice does not duplicate anyone.
 * Seeded rows that are no longer part of this batch are removed first, so
 * re-running after editing the roster replaces stale demo profiles cleanly.
 *
 * Every profile lists its photos explicitly. A profile with two or three
 * photos always shows the same person in each shot — the groups below were
 * reviewed by hand — and no portrait is shared between two profiles.
 */

type Market = 'PH' | 'CO' | 'BR' | 'MA';
type City = 'Manila' | 'Cebu' | 'Bogotá' | 'Medellín' | 'São Paulo' | 'Casablanca' | 'Marrakech';
type Goal =
  | 'Long-term relationship'
  | 'Short-term, open to long'
  | 'Something casual'
  | 'Friends first'
  | 'Still figuring it out';
type Gender = 'woman' | 'man';

/** [name, age, city, job, bio, interests, lifestyle, heightCm, goal, verified, photos] */
type Row = [
  string,
  number,
  City,
  string,
  string,
  string[],
  string[],
  number,
  Goal,
  boolean,
  string[],
];

interface CityInfo {
  market: Market;
  lat: number;
  lng: number;
}

const CITIES: Record<City, CityInfo> = {
  Manila: { market: 'PH', lat: 14.5995, lng: 120.9842 },
  Cebu: { market: 'PH', lat: 10.3157, lng: 123.8854 },
  Bogotá: { market: 'CO', lat: 4.711, lng: -74.0721 },
  Medellín: { market: 'CO', lat: 6.2442, lng: -75.5812 },
  'São Paulo': { market: 'BR', lat: -23.5505, lng: -46.6333 },
  Casablanca: { market: 'MA', lat: 33.5731, lng: -7.5898 },
  Marrakech: { market: 'MA', lat: 31.6295, lng: -7.9811 },
};

const MARKET_LANGUAGES: Record<Market, string[]> = {
  PH: ['English', 'Filipino'],
  CO: ['Spanish', 'English'],
  BR: ['Portuguese', 'English'],
  MA: ['Arabic', 'French', 'English'],
};

const PH_WOMEN: Row[] = [
  ['Maria Santos', 24, 'Manila', 'Nurse', "Night shift nurse, so my idea of a wild Friday is coffee at 6am and a good playlist on the way home. Show me your favorite hidden cafe?", ['Coffee', 'Travel', 'Music', 'Movies'], ['Night owl', 'Coffee addict', 'Foodie'], 158, 'Long-term relationship', true, ['photo-1513097633097-329a3a64e0d4']],
  ['Angela Reyes', 26, 'Cebu', 'Marketing Associate', "I will absolutely drag you to a gig on a Tuesday. Mostly here for good conversation and someone who replies in complete sentences.", ['Live music', 'Photography', 'Travel', 'Nightlife'], ['Social drinker', 'Creative', 'Always travelling'], 163, 'Something casual', false, ['photo-1550478868-06f8f60bfddd']],
  ['Nicole Cruz', 22, 'Cebu', 'Call Center Agent', "Cebu girl who talks too much about sunsets and matcha. Looking for someone to split desserts with. No sharing of fries though.", ['Coffee', 'Food', 'Movies', 'K-pop'], ['Night owl', 'Foodie', 'Coffee addict'], 155, 'Still figuring it out', false, ['photo-1589525231707-f2de2428f59c']],
  ['Patricia Garcia', 28, 'Manila', 'Teacher', "Grade 3 teacher by day, unapologetic homebody by night. I bake when I'm stressed, so there's always something on the counter.", ['Books', 'Baking', 'Cooking', 'Pets'], ['Homebody', 'Non-smoker', 'Early bird'], 160, 'Long-term relationship', true, ['photo-1758691737605-69a0e78bd193']],
  ['Camille Mendoza', 25, 'Manila', 'Graphic Designer', "Designer with a soft spot for film cameras and old bookstores. Let's compare Spotify Wrapped and judge each other gently.", ['Art', 'Photography', 'Movies', 'Books'], ['Creative', 'Coffee addict', 'Night owl'], 165, 'Long-term relationship', false, ['photo-1758600587815-b654d1405e83']],
  ['Jasmine Villanueva', 23, 'Cebu', 'Barista', "I make coffee for strangers all day, so I'm picky about beans and very unserious about everything else. Ask me about my plant collection.", ['Coffee', 'Gardening', 'Music', 'Art'], ['Coffee addict', 'Plant parent', 'Creative'], 157, 'Friends first', false, ['photo-1589553009868-c7b2bb474531']],
  ['Andrea Ramos', 27, 'Cebu', 'Physical Therapist', "Weekends are for the beach, long drives, and whatever playlist we argue about. I'm competitive at board games, fair warning.", ['Swimming', 'Travel', 'Board games', 'Fitness'], ['Fitness lover', 'Always travelling', 'Social drinker'], 168, 'Long-term relationship', true, ['photo-1687298703924-0d11be697d8b']],
  ['Bianca Aquino', 21, 'Manila', 'Student', "Third year psych student, chronic overthinker, occasional poet. Looking for someone who can keep up with my random 2am questions.", ['Books', 'Art', 'Music', 'Movies'], ['Night owl', 'Creative', 'Homebody'], 154, 'Still figuring it out', false, ['photo-1616325629936-99a9013c29c6']],
  ['Kristine Dela Cruz', 29, 'Manila', 'HR Officer', "I laugh at my own jokes and I'm not sorry. Big on Sunday markets, small talk about big feelings. Coffee first, always.", ['Food', 'Travel', 'Live music', 'Coffee'], ['Foodie', 'Social drinker', 'Coffee addict'], 161, 'Long-term relationship', true, ['photo-1529232356377-57971f020a94']],
  ['Alyssa Bautista', 24, 'Cebu', 'Virtual Assistant', "Working from home means my social battery is precious. Spend it on me with good food and better conversation?", ['Movies', 'Cooking', 'Pets', 'Music'], ['Homebody', 'Pet parent', 'Non-smoker'], 156, 'Friends first', false, ['photo-1758600587833-c07c5bda5c70']],
  ['Samantha Lim', 26, 'Manila', 'Accountant', "Numbers by day, live music by night. I have a running list of places to eat in Cebu and zero self-control around sisig.", ['Live music', 'Food', 'Travel', 'Wine'], ['Social drinker', 'Foodie', 'Night owl'], 159, 'Something casual', false, ['photo-1621390842036-f01b53d9cbfd']],
  ['Danica Torres', 22, 'Cebu', 'Content Creator', "I film everything, including my friends embarrassing themselves. Looking for a co-star who's okay with being in the background of my stories.", ['Photography', 'Travel', 'Fashion', 'Music'], ['Creative', 'Always travelling', 'Social drinker'], 162, 'Short-term, open to long', false, ['photo-1638740974954-0b8368aa524d']],
  ['Erika Flores', 28, 'Manila', 'Architect', "Architect who romanticizes old buildings and rainy afternoons. Tell me your favorite place in the city and I'll tell you mine.", ['Art', 'Museums', 'Coffee', 'Photography'], ['Creative', 'Coffee addict', 'Early bird'], 166, 'Long-term relationship', true, ['photo-1749700332031-cf99864959ea', 'photo-1749700332258-775b1b6b9cd5']],
];

const PH_MEN: Row[] = [
  ['John Paul Santos', 27, 'Manila', 'Software Engineer', "I write code, play basketball, and argue about the best sisig in Manila. Looking for someone who can keep up.", ['Games', 'Tech', 'Basketball', 'Coffee'], ['Night owl', 'Coffee addict', 'Fitness lover'], 175, 'Long-term relationship', true, ['photo-1552358155-515e264cb8b8']],
  ['Mark Anthony Reyes', 24, 'Cebu', 'Call Center Agent', "Night shift survivor. I make a mean 3am omelette and I'm always down for a sunrise drive after work.", ['Music', 'Movies', 'Games', 'Food'], ['Night owl', 'Foodie', 'Social drinker'], 172, 'Something casual', false, ['photo-1589088474071-0b5f16e4b42f']],
  ['Joshua Cruz', 26, 'Cebu', 'Civil Engineer', "I build bridges for a living and try not to burn them otherwise. Beach weekends, cold beer, good company.", ['Swimming', 'Travel', 'Basketball', 'Food'], ['Fitness lover', 'Social drinker', 'Always travelling'], 178, 'Long-term relationship', true, ['photo-1540569014015-19a7be504e3a']],
  ['Carlo Mendoza', 22, 'Manila', 'Student', "Engineering student who spends more time at coffee shops than class. Ask me about my Spotify playlists.", ['Music', 'Coffee', 'Movies', 'Games'], ['Coffee addict', 'Night owl', 'Homebody'], 170, 'Still figuring it out', false, ['photo-1725120556319-d0ca3a987940']],
  ['Miguel Garcia', 29, 'Manila', 'Architect', "I design spaces and overanalyze film endings. Let's get coffee and disagree about the best Kubrick movie.", ['Art', 'Movies', 'Museums', 'Coffee'], ['Creative', 'Coffee addict', 'Early bird'], 176, 'Long-term relationship', true, ['photo-1761435756843-0ca5f4ff1d59']],
  ['Rafael Bautista', 25, 'Cebu', 'Personal Trainer', "I'll spot you at the gym and cheer too loud. Big on consistency, small on excuses.", ['Fitness', 'Basketball', 'Swimming', 'Food'], ['Fitness lover', 'Early bird', 'Non-smoker'], 180, 'Long-term relationship', false, ['photo-1625389833948-11501a6d9b25']],
  ['Gabriel Ramos', 28, 'Cebu', 'Chef', "I cook, you eat, we argue about who does the dishes. Fair warning: I'm competitive about everything.", ['Cooking', 'Food', 'Wine', 'Travel'], ['Foodie', 'Social drinker', 'Night owl'], 174, 'Long-term relationship', true, ['photo-1622626426572-c268eb006092']],
  ['Angelo Villanueva', 23, 'Manila', 'Photographer', "I take photos of strangers and occasionally of myself. Let me take yours somewhere with good light.", ['Photography', 'Travel', 'Art', 'Music'], ['Creative', 'Always travelling', 'Coffee addict'], 171, 'Something casual', false, ['photo-1625327009034-039a65fa3153']],
  ['Christian Dela Cruz', 27, 'Manila', 'Accountant', "Numbers by day, live music by night. I know a small bar with cheap beer and a great band.", ['Live music', 'Coffee', 'Travel', 'Movies'], ['Social drinker', 'Coffee addict', 'Night owl'], 173, 'Long-term relationship', false, ['photo-1616326431985-b9f89ebc6ab7', 'photo-1616325629750-65545267f2d2', 'photo-1616325629756-e0283ebae72e']],
  ['Jerome Aquino', 21, 'Cebu', 'Student', "Film student with too many opinions and not enough sleep. Let's watch something weird and talk about it after.", ['Movies', 'Anime', 'Games', 'Music'], ['Night owl', 'Homebody', 'Non-smoker'], 169, 'Still figuring it out', false, ['photo-1757744705465-ea08b0ddc38a']],
  ['Kevin Torres', 26, 'Cebu', 'Sales Manager', "I talk to people all day and still want to talk to you. Road trips, seafood, and terrible puns.", ['Travel', 'Food', 'Basketball', 'Live music'], ['Social drinker', 'Foodie', 'Always travelling'], 177, 'Something casual', false, ['photo-1720501828093-c792c10e3f0b']],
  ['Bryan Flores', 24, 'Manila', 'Nurse', "Male nurse, yes we exist. I'm patient, literally. Looking for someone who doesn't mind my weird hours.", ['Fitness', 'Cooking', 'Movies', 'Music'], ['Fitness lover', 'Non-smoker', 'Early bird'], 172, 'Long-term relationship', true, ['photo-1563630423918-b58f07336ac9']],
];

const CO_WOMEN: Row[] = [
  ['Valentina Restrepo', 24, 'Medellín', 'Graphic Designer', "Paisa born and raised. I design packaging by day and hunt for the best arepas at night. Show me your favorite rooftop.", ['Art', 'Food', 'Photography', 'Travel'], ['Creative', 'Foodie', 'Night owl'], 162, 'Long-term relationship', true, ['photo-1679507655428-ab3d50356bac', 'photo-1679508004557-52bfaec15fe1']],
  ['Camila Ospina', 26, 'Bogotá', 'Marketing Associate', "Bogotá traffic gave me patience, the mountains gave me perspective. Coffee, cycling, and plans that never survive the weekend.", ['Coffee', 'Cycling', 'Travel', 'Live music'], ['Coffee addict', 'Always travelling', 'Social drinker'], 165, 'Long-term relationship', false, ['photo-1684789821368-6de7feaa0e75', 'photo-1684780875119-c5bc7cc9a9d5']],
  ['Isabella Cárdenas', 23, 'Medellín', 'Student', "Architecture student with a sketchbook full of cafes I can't afford. Let's wander Comuna 13 and argue about murals.", ['Art', 'Museums', 'Coffee', 'Photography'], ['Creative', 'Coffee addict', 'Homebody'], 158, 'Still figuring it out', false, ['photo-1601474348599-ed21570e9118']],
  ['Mariana Gómez', 28, 'Bogotá', 'Architect', "I draw buildings and then complain about buildings. Sunday markets, old cinemas, and long walks in La Candelaria.", ['Art', 'Museums', 'Photography', 'Books'], ['Creative', 'Early bird', 'Non-smoker'], 167, 'Long-term relationship', true, ['photo-1596554002543-83af3d801c6f']],
  ['Sofía Zapata', 25, 'Medellín', 'Physiotherapist', "I fix posture for a living, so I'll notice yours. Balance is everything — except when there's chocolate.", ['Fitness', 'Yoga', 'Food', 'Travel'], ['Fitness lover', 'Foodie', 'Non-smoker'], 160, 'Long-term relationship', false, ['photo-1777398567886-09c02d8f563a']],
  ['Juliana Ríos', 27, 'Bogotá', 'Journalist', "I ask too many questions for a living. Off the clock I'm quieter, but only slightly. Tell me a story I haven't heard.", ['Books', 'Writing', 'Coffee', 'Movies'], ['Workaholic', 'Coffee addict', 'Night owl'], 163, 'Long-term relationship', true, ['photo-1633011835685-3a6dafb82ea5']],
  ['Daniela Vargas', 22, 'Medellín', 'Barista', "I make coffee for strangers and playlists for friends. If you order a tinto, we'll get along.", ['Coffee', 'Music', 'Art', 'Travel'], ['Coffee addict', 'Creative', 'Social drinker'], 156, 'Friends first', false, ['photo-1549317079-75d70028e3a5']],
  ['Paula Herrera', 29, 'Bogotá', 'Lawyer', "I argue for a living and apologize for it later. Looking for someone who can disagree without it becoming a debate.", ['Books', 'Wine', 'Museums', 'Travel'], ['Workaholic', 'Social drinker', 'Early bird'], 168, 'Long-term relationship', true, ['photo-1506863530036-1efeddceb993']],
  ['Natalia Muñoz', 24, 'Medellín', 'Nurse', "Night shifts, early sunrises, and a dog who runs my life. I'm calm in emergencies and chaotic in group chats.", ['Pets', 'Movies', 'Cooking', 'Music'], ['Pet parent', 'Night owl', 'Non-smoker'], 159, 'Long-term relationship', false, ['photo-1644718847151-fff2271484a1']],
  ['Laura Betancur', 26, 'Bogotá', 'Product Designer', "I design apps people delete and cook dinners people remember. Big on plants, small on small talk.", ['Tech', 'Cooking', 'Gardening', 'Coffee'], ['Creative', 'Plant parent', 'Homebody'], 164, 'Long-term relationship', true, ['photo-1523761415282-2106778cfb5a']],
  ['Andrea Quintero', 21, 'Medellín', 'Student', "Psychology student who overanalyzes everything, including this bio. Ask me about my 2am thoughts.", ['Books', 'Art', 'Music', 'Movies'], ['Night owl', 'Homebody', 'Creative'], 155, 'Still figuring it out', false, ['photo-1598292254404-da6a31f7fa75']],
  ['Catalina Mejía', 28, 'Bogotá', 'Chef', "I feed people for a living. Bring an appetite and an opinion about cilantro.", ['Cooking', 'Food', 'Wine', 'Travel'], ['Foodie', 'Social drinker', 'Night owl'], 166, 'Long-term relationship', true, ['photo-1614273867161-22da2cd8ab39']],
  ['Manuela Arango', 25, 'Medellín', 'Photographer', "I photograph strangers and occasionally let someone photograph me. Golden hour is my personality.", ['Photography', 'Travel', 'Art', 'Coffee'], ['Creative', 'Always travelling', 'Coffee addict'], 161, 'Short-term, open to long', false, ['photo-1607503873903-c5e95f80d7b9']],
];

const CO_MEN: Row[] = [
  ['Santiago Restrepo', 27, 'Bogotá', 'Software Engineer', "I write code, ride my bike up Monserrate, and lose at parques. Looking for someone to lose with.", ['Tech', 'Cycling', 'Games', 'Coffee'], ['Coffee addict', 'Fitness lover', 'Night owl'], 178, 'Long-term relationship', true, ['photo-1616651630258-e3b5b01f416d', 'photo-1616651630355-5a3a503a62fe']],
  ['Andrés Felipe Molina', 25, 'Medellín', 'Chef', "I cook, you eat, we argue about the dishes. Fair warning: I put butter in everything.", ['Cooking', 'Food', 'Wine', 'Travel'], ['Foodie', 'Social drinker', 'Night owl'], 175, 'Long-term relationship', false, ['photo-1596478454926-473e1a88a639']],
  ['Juan David Osorio', 29, 'Bogotá', 'Economist', "I explain inflation for a living and still can't budget my weekends. Coffee first, always.", ['Books', 'Coffee', 'Travel', 'Wine'], ['Workaholic', 'Coffee addict', 'Early bird'], 177, 'Long-term relationship', true, ['photo-1633112639964-f8c9d360dc75']],
  ['Sebastián Cárdenas', 24, 'Medellín', 'Personal Trainer', "I'll spot you at the gym and cheer too loud. Consistency over motivation, every time.", ['Fitness', 'Football', 'Swimming', 'Food'], ['Fitness lover', 'Early bird', 'Non-smoker'], 182, 'Long-term relationship', false, ['photo-1595347080715-69a5f93cd60f']],
  ['Mateo Villegas', 26, 'Bogotá', 'Photographer', "I chase light around the city. Let me take your photo somewhere with good shadows.", ['Photography', 'Art', 'Travel', 'Music'], ['Creative', 'Always travelling', 'Coffee addict'], 174, 'Something casual', false, ['photo-1595347073915-c00b394f6213']],
  ['Nicolás Aguirre', 28, 'Medellín', 'Civil Engineer', "I build bridges and try not to burn them. Weekends are for the finca and a very slow lunch.", ['Hiking', 'Travel', 'Food', 'Cooking'], ['Fitness lover', 'Foodie', 'Early bird'], 179, 'Long-term relationship', true, ['photo-1623297990356-3a644b1b15d9']],
  ['Felipe Zapata', 23, 'Bogotá', 'Student', "Engineering student powered by coffee and bad decisions. Ask me about my vinyl collection.", ['Music', 'Coffee', 'Games', 'Movies'], ['Coffee addict', 'Night owl', 'Homebody'], 171, 'Still figuring it out', false, ['photo-1582330421788-d54dc81b293a']],
  ['Diego Alejandro Rojas', 30, 'Medellín', 'Doctor', "I fix people all day and sleep like it's a hobby. Looking for something calm and honest.", ['Books', 'Travel', 'Fitness', 'Coffee'], ['Workaholic', 'Early bird', 'Non-smoker'], 176, 'Long-term relationship', true, ['photo-1604689460199-b5ca5e45be06']],
  ['Camilo Herrera', 27, 'Bogotá', 'Music Producer', "I make beats and pretend I'm not shy. Live music is the only place I'm fully myself.", ['Music', 'Live music', 'Nightlife', 'Tech'], ['Night owl', 'Social drinker', 'Creative'], 173, 'Short-term, open to long', false, ['photo-1596502059330-be10388e3ba0']],
  ['Esteban Gutierrez', 22, 'Medellín', 'Barista', "Coffee, skateboards, and long walks. Simple guy, loud laugh.", ['Coffee', 'Skateboarding', 'Music', 'Art'], ['Coffee addict', 'Creative', 'Night owl'], 170, 'Friends first', false, ['photo-1567919337310-3dcf46470ed4']],
  ['Julián Bedoya', 26, 'Bogotá', 'Architect', "I design spaces you'd want to stay in. My apartment did not get the memo.", ['Art', 'Museums', 'Design', 'Coffee'], ['Creative', 'Coffee addict', 'Early bird'], 175, 'Long-term relationship', false, ['photo-1543084951-1650d1468e2d']],
  ['Mauricio Salazar', 29, 'Medellín', 'Teacher', "I teach history and still get excited about old buildings. Sunday markets are my church.", ['Books', 'Museums', 'Coffee', 'Travel'], ['Early bird', 'Non-smoker', 'Coffee addict'], 176, 'Long-term relationship', true, ['photo-1584161022452-ebe2d351a4b5']],
];

const BR_WOMEN: Row[] = [
  ['Beatriz Almeida', 25, 'São Paulo', 'Designer', "Paulistana who complains about traffic and never leaves. Let's find the best pastel in the city.", ['Art', 'Food', 'Photography', 'Travel'], ['Creative', 'Foodie', 'Coffee addict'], 163, 'Long-term relationship', true, ['photo-1648478445898-ae81dfa8701b', 'photo-1648478446048-d1203fb0801c']],
  ['Larissa Souza', 27, 'São Paulo', 'Nurse', "Night shifts, early sunrises, and a cat with strong opinions. I'm the friend who brings snacks.", ['Pets', 'Cooking', 'Movies', 'Music'], ['Pet parent', 'Night owl', 'Non-smoker'], 158, 'Long-term relationship', false, ['photo-1631377307692-36a9b6ae3ef6']],
  ['Camila Ferreira', 23, 'São Paulo', 'Student', "Journalism student, professional people-watcher. I'll ask too many questions and remember the answers.", ['Books', 'Writing', 'Photography', 'Coffee'], ['Coffee addict', 'Creative', 'Homebody'], 156, 'Still figuring it out', false, ['photo-1741805190372-26d5e8130aae']],
  ['Juliana Castro', 29, 'São Paulo', 'Lawyer', "I argue for a living and practice being wrong on weekends. Wine and books are my love languages.", ['Books', 'Wine', 'Museums', 'Travel'], ['Workaholic', 'Social drinker', 'Early bird'], 167, 'Long-term relationship', true, ['photo-1772989665252-7cb41ae759cc']],
  ['Fernanda Lima', 26, 'São Paulo', 'Marketing Manager', "I plan campaigns and absolutely nothing about my Saturdays. Looking for a partner in unplanned adventures.", ['Travel', 'Food', 'Live music', 'Photography'], ['Always travelling', 'Social drinker', 'Foodie'], 164, 'Long-term relationship', false, ['photo-1693737001080-f49a0f756365']],
  ['Isabela Rocha', 24, 'São Paulo', 'Photographer', "I photograph strangers and occasionally let someone photograph me. Golden hour is my personality.", ['Photography', 'Art', 'Travel', 'Coffee'], ['Creative', 'Always travelling', 'Coffee addict'], 160, 'Something casual', false, ['photo-1531432162873-97ad5f511056']],
  ['Mariana Barbosa', 28, 'São Paulo', 'Architect', "I romanticize old buildings and rainy afternoons. Show me your favorite corner of the city.", ['Art', 'Museums', 'Coffee', 'Photography'], ['Creative', 'Coffee addict', 'Early bird'], 166, 'Long-term relationship', true, ['photo-1589318058339-f7a2f0a80a88']],
  ['Carolina Mendes', 22, 'São Paulo', 'Barista', "I know your order before you do. Weekends are vinyl, thrift stores, and a long walk with no destination.", ['Coffee', 'Music', 'Fashion', 'Art'], ['Coffee addict', 'Creative', 'Night owl'], 155, 'Friends first', false, ['photo-1621511346665-7881ca5b08f1']],
  ['Rafaela Nunes', 27, 'São Paulo', 'Physiotherapist', "I help people move better and still can't fix my sleep schedule. Big on hikes, small on excuses.", ['Fitness', 'Hiking', 'Swimming', 'Travel'], ['Fitness lover', 'Non-smoker', 'Early bird'], 161, 'Long-term relationship', false, ['photo-1767396858128-85b1262a7677']],
  ['Bruna Cardoso', 25, 'São Paulo', 'Chef', "I cook for a living and still want to cook for you. Tell me your comfort food and I'll make it better.", ['Cooking', 'Food', 'Wine', 'Travel'], ['Foodie', 'Social drinker', 'Creative'], 162, 'Long-term relationship', true, ['photo-1541216970279-affbfdd55aa8']],
  ['Letícia Ribeiro', 21, 'São Paulo', 'Student', "Fine arts student with paint on everything I own. Let's go to a museum and make up stories about the paintings.", ['Art', 'Museums', 'Books', 'Photography'], ['Creative', 'Homebody', 'Non-smoker'], 153, 'Still figuring it out', false, ['photo-1519419691348-3b3433c4c20e']],
  ['Amanda Teixeira', 30, 'São Paulo', 'Product Manager', "I organize everything, including my friends' lives. Looking for someone who can handle a shared calendar.", ['Tech', 'Travel', 'Food', 'Board games'], ['Workaholic', 'Always travelling', 'Foodie'], 165, 'Long-term relationship', true, ['photo-1615046999952-cdbe5cd06773']],
];

const BR_MEN: Row[] = [
  ['Lucas Almeida', 27, 'São Paulo', 'Software Engineer', "I code by day, play football by night, and argue about pizza. Looking for someone who can keep up.", ['Tech', 'Football', 'Games', 'Coffee'], ['Night owl', 'Coffee addict', 'Fitness lover'], 176, 'Long-term relationship', true, ['photo-1663344467443-96bee7dc5738', 'photo-1663344467434-66949a837661']],
  ['Gabriel Souza', 25, 'São Paulo', 'Chef', "I cook, you eat, we argue about the dishes. I'm competitive about everything.", ['Cooking', 'Food', 'Wine', 'Travel'], ['Foodie', 'Social drinker', 'Night owl'], 174, 'Something casual', false, ['photo-1710357956796-4227c56641ca', 'photo-1710357956769-232ef8e9e1aa']],
  ['Matheus Oliveira', 29, 'São Paulo', 'Financial Analyst', "I'm good with money and terrible with sleep. Looking for someone to split the bill and the last slice.", ['Travel', 'Wine', 'Books', 'Coffee'], ['Workaholic', 'Social drinker', 'Coffee addict'], 178, 'Long-term relationship', true, ['photo-1527154341204-319eeba2d06e']],
  ['Pedro Henrique Lima', 24, 'São Paulo', 'Personal Trainer', "I'll spot you and cheer too loud. Beach weekends and cold beer.", ['Fitness', 'Surfing', 'Football', 'Food'], ['Fitness lover', 'Early bird', 'Non-smoker'], 181, 'Long-term relationship', false, ['photo-1626569283673-3e5ecbe1f7d9']],
  ['Rafael Costa', 26, 'São Paulo', 'Photographer', "I take photos of strangers and sometimes myself. Let me take yours somewhere with good light.", ['Photography', 'Travel', 'Art', 'Music'], ['Creative', 'Always travelling', 'Coffee addict'], 175, 'Something casual', false, ['photo-1626790890768-4c246c6417cd']],
  ['Thiago Martins', 28, 'São Paulo', 'Civil Engineer', "I build things for a living and overthink everything else. Steady guy, spontaneous trips.", ['Travel', 'Hiking', 'Food', 'Photography'], ['Always travelling', 'Workaholic', 'Foodie'], 177, 'Long-term relationship', true, ['photo-1695927621677-ec96e048dce2']],
  ['Bruno Ferreira', 23, 'São Paulo', 'Student', "Film student with too many opinions and not enough sleep. Let's watch something weird and talk about it.", ['Movies', 'Anime', 'Games', 'Music'], ['Night owl', 'Homebody', 'Non-smoker'], 172, 'Still figuring it out', false, ['photo-1639371959009-148c952fb27f']],
  ['Felipe Andrade', 30, 'São Paulo', 'Doctor', "I spend my days fixing people and my nights fixing my sleep. Patient, kind, always late.", ['Books', 'Travel', 'Fitness', 'Coffee'], ['Workaholic', 'Early bird', 'Non-smoker'], 179, 'Long-term relationship', true, ['photo-1564564321837-a57b7070ac4f']],
  ['Vinícius Rocha', 26, 'São Paulo', 'Music Producer', "I mix music for a living and I'm picky about speakers. Let's stand near the back at a gig.", ['Music', 'Live music', 'Nightlife', 'Tech'], ['Night owl', 'Social drinker', 'Creative'], 174, 'Short-term, open to long', false, ['photo-1557862921-37829c790f19']],
  ['Diego Santos', 22, 'São Paulo', 'Barista', "Coffee, vinyl, and long walks. Tell me your favorite song and I'll tell you mine.", ['Coffee', 'Music', 'Art', 'Movies'], ['Coffee addict', 'Creative', 'Night owl'], 170, 'Friends first', false, ['photo-1580359568734-85f6e9cc9e9e']],
  ['Leonardo Barbosa', 27, 'São Paulo', 'Architect', "I design spaces and overanalyze film endings. Coffee and a disagreement about Kubrick?", ['Art', 'Movies', 'Museums', 'Coffee'], ['Creative', 'Coffee addict', 'Early bird'], 176, 'Long-term relationship', false, ['photo-1648307277349-90f5c8b97667']],
  ['André Nascimento', 29, 'São Paulo', 'Teacher', "I teach math and still can't calculate my way out of a bad date. Give me a chance to prove it.", ['Books', 'Football', 'Movies', 'Coffee'], ['Early bird', 'Non-smoker', 'Coffee addict'], 175, 'Long-term relationship', true, ['photo-1648307211804-5b797d5bdc74']],
  ['Gustavo Ribeiro', 24, 'São Paulo', 'Videographer', "I film weddings and cry at every vow. Still hopeful. Let's make something together.", ['Photography', 'Movies', 'Music', 'Travel'], ['Creative', 'Night owl', 'Always travelling'], 173, 'Short-term, open to long', false, ['photo-1619622337420-72cf77fac199']],
];

const MA_WOMEN: Row[] = [
  ['Salma Benali', 24, 'Casablanca', 'Graphic Designer', "I design packaging and collect cafe corners. Casablanca sunsets are underrated. Show me yours.", ['Art', 'Photography', 'Coffee', 'Travel'], ['Creative', 'Coffee addict', 'Night owl'], 161, 'Long-term relationship', true, ['photo-1683100538633-26d1a0e4b214']],
  ['Imane El Amrani', 26, 'Marrakech', 'Marketing Associate', "I grew up between the medina and the mountains. Mint tea is a personality trait, not a drink.", ['Travel', 'Food', 'Photography', 'Live music'], ['Always travelling', 'Foodie', 'Social drinker'], 164, 'Long-term relationship', false, ['photo-1615161017088-1f2e13979853']],
  ['Yasmine Bennis', 22, 'Casablanca', 'Student', "Architecture student with a sketchbook full of riads. Let's get lost in the old medina and pretend it was planned.", ['Art', 'Museums', 'Coffee', 'Books'], ['Creative', 'Coffee addict', 'Homebody'], 157, 'Still figuring it out', false, ['photo-1678140930821-f7d876e2ebc8']],
  ['Nadia Ouazzani', 28, 'Marrakech', 'Architect', "I draw buildings and complain about buildings. Roof terraces, old doors, and long walks.", ['Art', 'Museums', 'Photography', 'Travel'], ['Creative', 'Early bird', 'Non-smoker'], 166, 'Long-term relationship', true, ['photo-1616617749174-a2a1f2134674']],
  ['Hajar Ait Taleb', 25, 'Casablanca', 'Nurse', "Night shifts and a very loud cat. I'm calm in a crisis and chaotic in the group chat.", ['Pets', 'Movies', 'Cooking', 'Music'], ['Pet parent', 'Night owl', 'Non-smoker'], 159, 'Long-term relationship', false, ['photo-1521936508333-75d467865dc8']],
  ['Rim Bakkali', 27, 'Marrakech', 'Journalist', "I ask too many questions for a living. Off the clock I'm quieter — only slightly. Tell me a story I haven't heard.", ['Books', 'Writing', 'Coffee', 'Movies'], ['Workaholic', 'Coffee addict', 'Night owl'], 162, 'Long-term relationship', true, ['photo-1531997362797-871a9665181e']],
  ['Sofia Lahlou', 23, 'Casablanca', 'Barista', "I make coffee for strangers and playlists for friends. Ask me about my plant collection.", ['Coffee', 'Gardening', 'Music', 'Art'], ['Coffee addict', 'Plant parent', 'Creative'], 155, 'Friends first', false, ['photo-1602256169298-c1767dc5461c']],
  ['Aya Chraibi', 29, 'Marrakech', 'Lawyer', "I argue for a living and apologize later. Looking for someone who disagrees kindly.", ['Books', 'Wine', 'Museums', 'Travel'], ['Workaholic', 'Social drinker', 'Early bird'], 167, 'Long-term relationship', true, ['photo-1685367145353-8aa80ae44e58']],
  ['Kenza Berrada', 26, 'Casablanca', 'Product Designer', "I design apps people delete and cook dinners people remember. Big on plants, small on small talk.", ['Tech', 'Cooking', 'Gardening', 'Coffee'], ['Creative', 'Plant parent', 'Homebody'], 163, 'Long-term relationship', false, ['photo-1636624368429-c1a81c50ff87']],
  ['Lina Tazi', 21, 'Marrakech', 'Student', "Psychology student who overanalyzes everything, including this bio. Ask me about my 2am thoughts.", ['Books', 'Art', 'Music', 'Movies'], ['Night owl', 'Homebody', 'Creative'], 154, 'Still figuring it out', false, ['photo-1700775115339-bf46d24218af']],
  ['Meriem El Fassi', 28, 'Casablanca', 'Chef', "I feed people for a living. Bring an appetite and an opinion about cumin.", ['Cooking', 'Food', 'Wine', 'Travel'], ['Foodie', 'Social drinker', 'Night owl'], 165, 'Long-term relationship', true, ['photo-1720718517204-a66cc17a1052']],
  ['Ghita Zeroual', 25, 'Marrakech', 'Photographer', "I photograph strangers and occasionally let someone photograph me. Golden hour is my personality.", ['Photography', 'Travel', 'Art', 'Coffee'], ['Creative', 'Always travelling', 'Coffee addict'], 160, 'Something casual', false, ['photo-1536766768598-e09213fdcf22']],
];

const MA_MEN: Row[] = [
  ['Youssef El Idrissi', 27, 'Casablanca', 'Software Engineer', "I write code, play football on the beach, and lose at cards. Looking for someone to lose with.", ['Tech', 'Football', 'Games', 'Coffee'], ['Coffee addict', 'Fitness lover', 'Night owl'], 177, 'Long-term relationship', true, ['photo-1644673929158-4df4e7b2ac2e', 'photo-1644673929087-bddc09052cfa']],
  ['Hamza Benjelloun', 25, 'Marrakech', 'Chef', "I cook, you eat, we argue about the dishes. I put cumin in everything.", ['Cooking', 'Food', 'Wine', 'Travel'], ['Foodie', 'Social drinker', 'Night owl'], 174, 'Long-term relationship', false, ['photo-1723085582062-78a8d6513e36']],
  ['Mehdi Alaoui', 29, 'Casablanca', 'Economist', "I explain inflation for a living and still can't budget my weekends. Coffee first.", ['Books', 'Coffee', 'Travel', 'Wine'], ['Workaholic', 'Coffee addict', 'Early bird'], 176, 'Long-term relationship', true, ['photo-1751965681596-3069c58a236b']],
  ['Ayoub Bennis', 24, 'Marrakech', 'Personal Trainer', "I'll spot you and cheer too loud. Consistency over motivation.", ['Fitness', 'Football', 'Swimming', 'Food'], ['Fitness lover', 'Early bird', 'Non-smoker'], 180, 'Long-term relationship', false, ['photo-1681686587104-db9cdff707a9']],
  ['Othmane Chraibi', 26, 'Casablanca', 'Photographer', "I chase light around the city. Let me take your photo somewhere with good shadows.", ['Photography', 'Art', 'Travel', 'Music'], ['Creative', 'Always travelling', 'Coffee addict'], 175, 'Something casual', false, ['photo-1645520941137-7b546caab649']],
  ['Anas Berrada', 28, 'Marrakech', 'Civil Engineer', "I build things and overthink everything else. Weekends are for the Atlas and a slow lunch.", ['Hiking', 'Travel', 'Food', 'Cooking'], ['Fitness lover', 'Foodie', 'Early bird'], 178, 'Long-term relationship', true, ['photo-1637066725928-d55765ff664a']],
  ['Ilyas Tazi', 23, 'Casablanca', 'Student', "Engineering student powered by coffee and bad decisions. Ask me about my vinyl.", ['Music', 'Coffee', 'Games', 'Movies'], ['Coffee addict', 'Night owl', 'Homebody'], 171, 'Still figuring it out', false, ['photo-1520293116245-ccdf17300bd1']],
  ['Karim Lahlou', 30, 'Marrakech', 'Doctor', "I fix people all day and sleep like it's a hobby. Looking for something calm and honest.", ['Books', 'Travel', 'Fitness', 'Coffee'], ['Workaholic', 'Early bird', 'Non-smoker'], 177, 'Long-term relationship', true, ['photo-1636626386957-32f24cde1467']],
  ['Reda Bouzid', 27, 'Casablanca', 'Music Producer', "I make beats and pretend I'm not shy. Live music is where I'm fully myself.", ['Music', 'Live music', 'Nightlife', 'Tech'], ['Night owl', 'Social drinker', 'Creative'], 173, 'Short-term, open to long', false, ['photo-1624140716840-5d89f311f500']],
  ['Zacharia Amrani', 22, 'Marrakech', 'Barista', "Coffee, skateboards, and long walks. Simple guy, loud laugh.", ['Coffee', 'Skateboarding', 'Music', 'Art'], ['Coffee addict', 'Creative', 'Night owl'], 170, 'Friends first', false, ['photo-1624411024074-18a756682b50']],
  ['Nabil El Fassi', 26, 'Casablanca', 'Architect', "I design spaces you'd want to stay in. My apartment missed the memo.", ['Art', 'Museums', 'Design', 'Coffee'], ['Creative', 'Coffee addict', 'Early bird'], 174, 'Long-term relationship', false, ['photo-1616147147027-60d49d3582c4']],
  ['Adam Zeroual', 29, 'Marrakech', 'Teacher', "I teach history and still get excited about old buildings. Sunday markets are my church.", ['Books', 'Museums', 'Coffee', 'Travel'], ['Early bird', 'Non-smoker', 'Coffee addict'], 175, 'Long-term relationship', true, ['photo-1649132818011-0fee19d5a529']],
  ['Bilal Ouazzani', 24, 'Casablanca', 'Videographer', "I film weddings and cry at every vow. Still hopeful. Let's make something together.", ['Photography', 'Movies', 'Music', 'Travel'], ['Creative', 'Night owl', 'Always travelling'], 172, 'Short-term, open to long', false, ['photo-1614495039368-525273956716', 'photo-1614495038926-06305e479e9d', 'photo-1614495039149-51a3f60bfd2d']],
];

/** Unsplash's CDN serves the same photo at any size; face-crop keeps portraits centred. */
const portraitUrl = (id: string): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&h=1200&q=80&crop=faces`;

const slug = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

/**
 * Stable UUID-shaped IDs keep the script idempotent while still looking like
 * the `randomUUID()` values real registrations use.
 */
const seedId = (key: string): string => {
  const hash = createHash('sha1').update(`hobymine:seed:${key}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60_000);
const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);

/** Deterministic jitter so people in the same city are not stacked on one pin. */
const jitter = (index: number, spread = 0.045): number => {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * spread;
};

interface BuiltProfile {
  id: string;
  email: string;
  gender: Gender;
  name: string;
  age: number;
  city: City;
  market: Market;
  job: string;
  bio: string;
  interests: string[];
  lifestyle: string[];
  heightCm: number;
  goal: Goal;
  verified: boolean;
  lat: number;
  lng: number;
  photos: string[];
  lastActiveAt: Date;
  createdAt: Date;
  interestedIn: 'women' | 'men' | 'everyone';
  ageMin: number;
  ageMax: number;
}

/** Photo IDs already claimed in this run; guarantees no profile shares a photo. */
const usedPhotoIds = new Set<string>();

function buildProfiles(rows: Row[], gender: Gender, prefix: string): BuiltProfile[] {
  return rows.map((row, index) => {
    const [name, age, city, job, bio, interests, lifestyle, heightCm, goal, verified, photoIds] =
      row;
    const label = `${prefix}${String(index + 1).padStart(2, '0')}`;
    const { market, lat, lng } = CITIES[city];

    const photos = photoIds.map((photoId) => {
      if (usedPhotoIds.has(photoId)) {
        throw new Error(`Photo ${photoId} is assigned more than once (${label})`);
      }
      usedPhotoIds.add(photoId);
      return portraitUrl(photoId);
    });

    return {
      id: seedId(label),
      email: `${label}.${slug(name)}@seed.hobymine.app`,
      gender,
      name,
      age,
      city,
      market,
      job,
      bio,
      interests,
      lifestyle,
      heightCm,
      goal,
      verified,
      lat: lat + jitter(index + (gender === 'man' ? 100 : 0)),
      lng: lng + jitter(index + 37 + (gender === 'man' ? 100 : 0)),
      photos,
      lastActiveAt: minutesAgo((index * 17 + 3) % 720),
      createdAt: daysAgo(3 + ((index * 7) % 90)),
      interestedIn: gender === 'woman' ? 'men' : 'women',
      ageMin: Math.max(20, age - 5),
      ageMax: Math.min(45, age + 7),
    };
  });
}

async function insertProfile(profile: BuiltProfile, passwordHash: string): Promise<boolean> {
  const result = await sql(
    `INSERT INTO users
      (id, email, password_hash, name, age, gender, bio, job, city, country_code,
       lat, lng, latitude, longitude, location_city, interests, lifestyle, languages,
       height_cm, relationship_goal, photos, verified, plus, read_receipts,
       email_verified, is_bot, is_seeded, age_confirmed_at, terms_accepted_at,
       terms_version, last_active_at, created_at)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,
       $18::jsonb,$19,$20,$21::jsonb,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      profile.id,
      profile.email,
      passwordHash,
      profile.name,
      profile.age,
      profile.gender,
      profile.bio,
      profile.job,
      profile.city,
      profile.market,
      profile.lat,
      profile.lng,
      profile.lat,
      profile.lng,
      profile.city,
      JSON.stringify(profile.interests),
      JSON.stringify(profile.lifestyle),
      JSON.stringify(MARKET_LANGUAGES[profile.market]),
      profile.heightCm,
      profile.goal,
      JSON.stringify(profile.photos),
      profile.verified,
      false,
      true,
      true,
      false,
      true,
      profile.createdAt,
      profile.createdAt,
      '2025-01',
      profile.lastActiveAt,
      profile.createdAt,
    ],
  );

  await sql(
    `INSERT INTO preferences
      (user_id, interested_in, age_min, age_max, max_distance, country_code, location_mode)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id) DO NOTHING`,
    [
      profile.id,
      profile.interestedIn,
      profile.ageMin,
      profile.ageMax,
      120,
      profile.market,
      'global',
    ],
  );

  return result.rows.length > 0;
}

async function seedProfiles(): Promise<void> {
  await initDb();

  usedPhotoIds.clear();
  const profiles = [
    ...buildProfiles(PH_WOMEN, 'woman', 'phw'),
    ...buildProfiles(PH_MEN, 'man', 'phm'),
    ...buildProfiles(CO_WOMEN, 'woman', 'cow'),
    ...buildProfiles(CO_MEN, 'man', 'com'),
    ...buildProfiles(BR_WOMEN, 'woman', 'brw'),
    ...buildProfiles(BR_MEN, 'man', 'brm'),
    ...buildProfiles(MA_WOMEN, 'woman', 'maw'),
    ...buildProfiles(MA_MEN, 'man', 'mam'),
  ];

  const women = profiles.filter((profile) => profile.gender === 'woman');
  const men = profiles.filter((profile) => profile.gender === 'man');
  if (women.length !== 50 || men.length !== 50) {
    throw new Error(`Expected 50 women and 50 men, got ${women.length} and ${men.length}`);
  }

  for (const market of ['PH', 'CO', 'BR', 'MA'] as const) {
    const count = profiles.filter((profile) => profile.market === market).length;
    if (count !== 25) {
      throw new Error(`Expected 25 profiles for ${market}, got ${count}`);
    }
  }

  for (const profile of profiles) {
    if (profile.photos.length < 1 || profile.photos.length > 3) {
      throw new Error(`${profile.name} has ${profile.photos.length} photos (expected 1–3)`);
    }
  }

  // The seeded accounts never sign in, so a single random hash is enough to
  // make password checks fail without spending 100 bcrypt rounds.
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);

  // Clear demo rows left over from an older roster, then insert this batch.
  // Matches and likes on profiles that are still in the batch are preserved.
  const ids = profiles.map((profile) => profile.id);
  const removed = await sql<{ id: string }>(
    `DELETE FROM users
     WHERE is_seeded = TRUE AND NOT (id = ANY($1::text[]))
     RETURNING id`,
    [ids],
  );
  if (removed.rows.length > 0) {
    console.log(`[hobymine] Removed ${removed.rows.length} stale seeded profile(s).`);
  }

  let inserted = 0;
  for (const profile of profiles) {
    if (await insertProfile(profile, passwordHash)) inserted += 1;
  }

  const counts = await sql<{
    gender: string;
    country_code: string;
    city: string;
    count: string | number;
  }>(
    `SELECT gender, country_code, city, COUNT(*) AS count
     FROM users
     WHERE is_seeded = TRUE
     GROUP BY gender, country_code, city
     ORDER BY country_code, gender, city`,
  );

  console.log(`[hobymine] Seeded ${inserted} new profile(s); ${profiles.length - inserted} already existed.`);
  for (const row of counts.rows) {
    console.log(
      `[hobymine]   ${row.country_code} ${row.gender.padEnd(5)} ${row.city.padEnd(11)} ${row.count}`,
    );
  }
  console.log('[hobymine] Remove the whole batch later with: DELETE FROM users WHERE is_seeded = TRUE;');
}

async function clearProfiles(): Promise<void> {
  await initDb();
  const result = await sql<{ id: string }>(
    'DELETE FROM users WHERE is_seeded = TRUE RETURNING id',
  );
  console.log(`[hobymine] Removed ${result.rows.length} seeded profile(s).`);
}

const clear = process.argv.includes('--clear');
(clear ? clearProfiles() : seedProfiles())
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
