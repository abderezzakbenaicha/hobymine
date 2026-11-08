import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.cwd(), 'apps/web/public/seed');
mkdirSync(outDir, { recursive: true });

const palettes = {
  alex: { bg: ['#07140F', '#123526'], accent: '#00FF66', skin: '#C98F65', skin2: '#9E6844', hair: '#1A1210', clothes: '#1E3D2E', hairStyle: 'short', accessory: 'watch' },
  maya: { bg: ['#081A13', '#123B2C'], accent: '#00FF9C', skin: '#E8B48A', skin2: '#C48B61', hair: '#241A18', clothes: '#1E4D3D', hairStyle: 'bob', accessory: 'earrings' },
  aria: { bg: ['#1B1020', '#3A1B2E'], accent: '#FF7AB6', skin: '#C98B62', skin2: '#A56A44', hair: '#17110F', clothes: '#5A2440', hairStyle: 'long', accessory: 'earrings' },
  sofia: { bg: ['#0B1622', '#1C3346'], accent: '#6FD3FF', skin: '#D9A27A', skin2: '#B27E58', hair: '#2A1B14', clothes: '#23465E', hairStyle: 'curly', accessory: 'earrings' },
  isla: { bg: ['#131A0B', '#2C3A14'], accent: '#D7FF3E', skin: '#F0C6A0', skin2: '#CA9C74', hair: '#6B4A2A', clothes: '#3B4A1F', hairStyle: 'long', accessory: 'glasses' },
  chloe: { bg: ['#170D1A', '#321A3B'], accent: '#C4A7FF', skin: '#E9BE9C', skin2: '#C39571', hair: '#1B1210', clothes: '#48295C', hairStyle: 'bob', accessory: 'glasses' },
  priya: { bg: ['#1F120C', '#402418'], accent: '#FFAB66', skin: '#B9764C', skin2: '#945A37', hair: '#15100D', clothes: '#643521', hairStyle: 'bun', accessory: 'earrings' },
  luna: { bg: ['#0D1024', '#1D2450'], accent: '#8C9EFF', skin: '#F2CBA6', skin2: '#CDA37C', hair: '#D8C3A5', clothes: '#2B3572', hairStyle: 'bob', accessory: 'earrings' },
  zoe: { bg: ['#0B1D22', '#123C46'], accent: '#00FFC2', skin: '#E5B78F', skin2: '#BF9068', hair: '#1A1412', clothes: '#1A4C57', hairStyle: 'long', accessory: 'glasses' },
  hana: { bg: ['#1C0F12', '#3D1D25'], accent: '#FF8FA8', skin: '#F1C9A8', skin2: '#CBA17F', hair: '#17100F', clothes: '#5A2934', hairStyle: 'bun', accessory: 'glasses' },
  elle: { bg: ['#101A10', '#233B1C'], accent: '#9CFF7A', skin: '#D6A077', skin2: '#AF7C55', hair: '#201614', clothes: '#365326', hairStyle: 'long', accessory: 'earrings' },
  kai: { bg: ['#0D1520', '#172C44'], accent: '#6FD3FF', skin: '#E3B58C', skin2: '#BD8E65', hair: '#11100F', clothes: '#22405E', hairStyle: 'short', accessory: 'watch' },
  diego: { bg: ['#1D1209', '#3D2612'], accent: '#FFC46B', skin: '#B97A52', skin2: '#935A38', hair: '#14100C', clothes: '#5C3A1B', hairStyle: 'short', accessory: 'watch' },
  jordan: { bg: ['#141018', '#2C2238'], accent: '#B9A7FF', skin: '#C68E68', skin2: '#A06B47', hair: '#2B1B14', clothes: '#3D3152', hairStyle: 'curly', accessory: 'earrings' },
};

const hairPaths = {
  long: `
    <path d="M350 700 C330 530 390 420 540 420 C690 420 750 530 730 700 L748 980 C700 1000 670 960 668 900 L650 760 C620 820 460 820 430 760 L412 900 C410 960 380 1000 332 980 Z" fill="url(#hair)" opacity="0.98"/>
    <path d="M365 615 C380 490 445 445 540 445 C635 445 700 490 715 615 C660 560 610 545 540 545 C470 545 420 560 365 615 Z" fill="url(#hairHi)" opacity="0.55"/>`,
  bob: `
    <path d="M350 720 C342 540 410 425 540 425 C670 425 738 540 730 720 C720 800 690 825 655 800 L650 700 C620 745 460 745 430 700 L425 800 C390 825 360 800 350 720 Z" fill="url(#hair)"/>
    <path d="M372 610 C395 500 455 455 540 455 C625 455 685 500 708 610 C650 565 600 552 540 552 C480 552 430 565 372 610 Z" fill="url(#hairHi)" opacity="0.5"/>`,
  curly: `
    <g fill="url(#hair)">
      <circle cx="430" cy="480" r="95"/><circle cx="540" cy="435" r="110"/><circle cx="650" cy="480" r="95"/>
      <circle cx="380" cy="570" r="80"/><circle cx="700" cy="570" r="80"/><circle cx="370" cy="665" r="62"/><circle cx="710" cy="665" r="62"/>
      <path d="M355 700 C360 560 430 470 540 470 C650 470 720 560 725 700 L705 790 L670 700 C635 745 445 745 410 700 L375 790 Z"/>
    </g>
    <path d="M420 540 C460 490 620 490 660 540 C610 515 470 515 420 540 Z" fill="url(#hairHi)" opacity="0.45"/>`,
  short: `
    <path d="M365 690 C355 530 425 430 540 430 C655 430 725 530 715 690 C700 610 660 560 620 548 C565 580 490 585 430 555 C395 580 375 630 365 690 Z" fill="url(#hair)"/>
    <path d="M390 560 C430 475 490 450 550 452 C610 454 660 485 690 555 C640 512 590 500 540 500 C490 500 435 520 390 560 Z" fill="url(#hairHi)" opacity="0.4"/>`,
  bun: `
    <circle cx="540" cy="410" r="95" fill="url(#hair)"/>
    <circle cx="540" cy="410" r="62" fill="url(#hairHi)" opacity="0.35"/>
    <path d="M360 700 C355 540 430 448 540 448 C650 448 725 540 720 700 C700 605 650 558 540 558 C430 558 380 605 360 700 Z" fill="url(#hair)"/>
    <path d="M395 580 C440 500 640 500 685 580 C620 535 460 535 395 580 Z" fill="url(#hairHi)" opacity="0.45"/>`,
};

function portrait(slug, variant) {
  const p = palettes[slug];
  if (!p) throw new Error(`Unknown palette ${slug}`);
  const flip = variant === 2;
  const zoom = variant === 2 ? 1.09 : 1;
  const yShift = variant === 2 ? 35 : 0;
  const accessory = p.accessory;
  const glasses = accessory === 'glasses';
  const earrings = accessory === 'earrings';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-label="Illustrated demo portrait">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="52%">
      <stop offset="0" stop-color="${p.accent}" stop-opacity="0.52"/>
      <stop offset="0.5" stop-color="${p.accent}" stop-opacity="0.12"/>
      <stop offset="1" stop-color="${p.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.skin}"/><stop offset="1" stop-color="${p.skin2}"/>
    </linearGradient>
    <linearGradient id="clothes" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.clothes}"/><stop offset="1" stop-color="#080A0D"/>
    </linearGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.hair}"/><stop offset="1" stop-color="#080807"/>
    </linearGradient>
    <linearGradient id="hairHi" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="1" stop-color="${p.hair}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#D7FF3E"/><stop offset="1" stop-color="${p.accent}"/>
    </linearGradient>
    <filter id="blur80"><feGaussianBlur stdDeviation="80"/></filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.22"/></feComponentTransfer>
    </filter>
  </defs>

  <rect width="1080" height="1350" fill="url(#bg)"/>
  <ellipse cx="${540 + (variant === 2 ? 80 : -40)}" cy="610" rx="520" ry="560" fill="url(#glow)"/>
  <circle cx="${150 + (variant === 2 ? 760 : 0)}" cy="${variant === 2 ? 210 : 1040}" r="330" fill="${p.accent}" opacity="0.09" filter="url(#blur80)"/>
  <circle cx="${variant === 2 ? 120 : 940}" cy="${variant === 2 ? 920 : 230}" r="220" fill="none" stroke="${p.accent}" stroke-opacity="0.24" stroke-width="3"/>
  <circle cx="${variant === 2 ? 120 : 940}" cy="${variant === 2 ? 920 : 230}" r="150" fill="none" stroke="${p.accent}" stroke-opacity="0.14" stroke-width="2"/>
  <path d="M-40 1120 C220 980 820 980 1120 1120" fill="none" stroke="${p.accent}" stroke-opacity="0.18" stroke-width="2"/>

  <g transform="translate(${flip ? 1080 : 0} 0) scale(${flip ? -1 : 1} 1)">
    <g transform="translate(0 ${yShift}) translate(540 675) scale(${zoom}) translate(-540 -675)">
      <ellipse cx="540" cy="1180" rx="470" ry="210" fill="#000" opacity="0.28" filter="url(#blur80)"/>
      <path d="M120 1350 C160 1110 330 1005 540 1005 C750 1005 920 1110 960 1350 Z" fill="url(#clothes)"/>
      <path d="M430 940 C450 1040 630 1040 650 940 L650 1120 L430 1120 Z" fill="url(#skin)"/>
      <path d="M430 940 C455 1005 625 1005 650 940 L640 1010 C610 1055 470 1055 440 1010 Z" fill="#000" opacity="0.18"/>
      <circle cx="350" cy="710" r="42" fill="url(#skin)"/>
      <circle cx="730" cy="710" r="42" fill="url(#skin)"/>
      <ellipse cx="540" cy="700" rx="196" ry="245" fill="url(#skin)"/>
      <path d="M405 650 C430 610 480 600 510 620" fill="none" stroke="${p.hair}" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
      <path d="M570 620 C600 600 650 610 675 650" fill="none" stroke="${p.hair}" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
      <ellipse cx="467" cy="700" rx="17" ry="12" fill="#181411"/>
      <ellipse cx="613" cy="700" rx="17" ry="12" fill="#181411"/>
      <circle cx="472" cy="697" r="4" fill="#FFF" opacity="0.75"/>
      <circle cx="618" cy="697" r="4" fill="#FFF" opacity="0.75"/>
      <path d="M540 705 C535 750 528 775 548 786" fill="none" stroke="${p.skin2}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
      <path d="M500 835 C525 852 555 852 580 835" fill="none" stroke="#5C2B31" stroke-width="10" stroke-linecap="round"/>
      <path d="M500 835 C525 842 555 842 580 835" fill="#7A3941" opacity="0.55"/>
      ${hairPaths[p.hairStyle]}
      ${glasses ? `<g fill="none" stroke="#0C0D10" stroke-width="7" opacity="0.9"><rect x="418" y="672" width="102" height="62" rx="22"/><rect x="560" y="672" width="102" height="62" rx="22"/><path d="M520 698 L560 698"/></g>` : ''}
      ${earrings ? `<circle cx="352" cy="764" r="13" fill="${p.accent}"/><circle cx="728" cy="764" r="13" fill="${p.accent}"/>` : ''}
      <circle cx="540" cy="1320" r="8" fill="${p.accent}" opacity="0.75"/>
    </g>
  </g>

  <rect width="1080" height="1350" filter="url(#grain)" opacity="0.16" style="mix-blend-mode:overlay"/>
  <rect x="0" y="0" width="1080" height="1350" fill="none" stroke="${p.accent}" stroke-opacity="0.18" stroke-width="2"/>
  <g opacity="0.9">
    <rect x="54" y="54" width="88" height="4" rx="2" fill="url(#accent)"/>
    <circle cx="1000" cy="76" r="6" fill="${p.accent}"/>
  </g>
</svg>`;
}

for (const slug of Object.keys(palettes)) {
  for (const variant of [1, 2]) {
    writeFileSync(resolve(outDir, `${slug}-${variant}.svg`), portrait(slug, variant));
  }
}

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF8AA2"/><stop offset="0.5" stop-color="#EC1350"/><stop offset="1" stop-color="#D80B47"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="18" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="512" height="512" rx="120" fill="#06070A"/>
  <circle cx="256" cy="256" r="148" fill="none" stroke="url(#g)" stroke-width="38" filter="url(#glow)" opacity="0.5"/>
  <circle cx="256" cy="256" r="148" fill="none" stroke="url(#g)" stroke-width="24"/>
  <path d="M256 334 C212 334 176 298 176 254 C176 210 212 174 256 174 C300 174 336 210 336 254" fill="none" stroke="url(#g)" stroke-width="24" stroke-linecap="round"/>
  <circle cx="366" cy="348" r="18" fill="#FF8AA2"/>
</svg>`;

mkdirSync(resolve(process.cwd(), 'apps/web/public/icons'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'apps/web/public/icons/icon.svg'), icon);

// A small, pleasant two-tone voice note used by seeded messages.
const sampleRate = 22050;
const seconds = 2.6;
const frames = Math.floor(sampleRate * seconds);
const data = Buffer.alloc(frames * 2);
for (let i = 0; i < frames; i += 1) {
  const t = i / sampleRate;
  const envelope = Math.min(1, t / 0.06) * Math.min(1, (seconds - t) / 0.2);
  const wobble = 1 + 0.05 * Math.sin(2 * Math.PI * 5 * t);
  const tone =
    Math.sin(2 * Math.PI * 220 * t * wobble) * 0.28 +
    Math.sin(2 * Math.PI * 330 * t * wobble) * 0.12 +
    Math.sin(2 * Math.PI * 440 * t * wobble) * 0.05;
  const value = Math.max(-1, Math.min(1, tone * envelope * 0.7));
  data.writeInt16LE(Math.round(value * 32767), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
mkdirSync(resolve(process.cwd(), 'apps/web/public/sounds'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'apps/web/public/sounds/voice-note.wav'), Buffer.concat([header, data]));

console.log(`Generated ${Object.keys(palettes).length * 2} portraits, icon.svg and voice-note.wav`);
