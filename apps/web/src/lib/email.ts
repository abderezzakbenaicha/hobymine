/**
 * Email validation for the sign-up form. The API applies the same rules, so
 * anything rejected here is rejected there too.
 */
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 255;

/**
 * Top level domains that really exist. A two letter code is always a country
 * domain (com, net, org, io, de, jp …), the list covers the common generic
 * ones. A made up suffix such as "gmial" or ".comm" is rejected here.
 */
const GENERIC_TLDS = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name',
  'pro', 'app', 'dev', 'site', 'online', 'store', 'shop', 'blog', 'cloud',
  'tech', 'space', 'website', 'live', 'life', 'world', 'today', 'news', 'media',
  'agency', 'digital', 'email', 'group', 'company', 'center', 'academy',
  'art', 'design', 'studio', 'gallery', 'photo', 'video', 'club', 'design',
  'travel', 'jobs', 'money', 'fund', 'capital', 'ventures', 'partners', 'zone',
  'city', 'place', 'io', 'ai', 'co', 'me', 'tv', 'cc', 'gg', 'sh', 'ly',
]);

function isValidTld(tld: string): boolean {
  const lower = tld.toLowerCase();
  if (GENERIC_TLDS.has(lower)) return true;
  // Any two letter code is a country domain.
  return /^[a-z]{2}$/.test(lower);
}

/** Well known consumer mailboxes, used to catch typo domains. */
const KNOWN_PROVIDER_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.jp', 'yahoo.com.au',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'gmx.com', 'gmx.de', 'zoho.com', 'yandex.com', 'mail.com',
  'proton.me', 'protonmail.com', 'fastmail.com', 'hey.com', 'tutanota.com',
  'qq.com', '163.com', 'naver.com',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net',
  'cox.net', 'charter.net', 'earthlink.net', 'roadrunner.com', 'windstream.net',
  'frontdoor.com',
];

function editDistance(a: string, b: string): number {
  // Optimal string alignment distance: a swapped pair ("ia" → "ai") counts as
  // one edit, which is how people actually mistype a domain.
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) table[i]![0] = i;
  for (let j = 0; j < cols; j += 1) table[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        table[i - 1]![j]! + 1,
        table[i]![j - 1]! + 1,
        table[i - 1]![j - 1]! + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        value = Math.min(value, table[i - 2]![j - 2]! + 1);
      }
      table[i]![j] = value;
    }
  }
  return table[rows - 1]![cols - 1]!;
}

/** Detects a mistyped provider domain, for example "gmial.com". */
export function suggestProviderDomain(domain: string): string | null {
  const sld = domain.split('.')[0] ?? '';
  if (sld.length < 4) return null;
  for (const known of KNOWN_PROVIDER_DOMAINS) {
    const knownSld = known.split('.')[0] ?? '';
    if (sld === knownSld) return null;
    if (
      Math.abs(sld.length - knownSld.length) <= 1 &&
      editDistance(sld, knownSld) <= 1
    ) {
      return known;
    }
  }
  return null;
}

const BLOCKED_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
  'test.com',
  'test',
  'localhost',
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  '10minutemail.com',
  'yopmail.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'fakeinbox.com',
  'dispostable.com',
]);

const BLOCKED_LOCAL_PARTS = new Set([
  'a',
  'aa',
  'aaa',
  'abc',
  'abcd',
  'admin',
  'administrator',
  'anonymous',
  'asdf',
  'asdfasdf',
  'bar',
  'baz',
  'doe',
  'email',
  'foo',
  'foobar',
  'guest',
  'hello',
  'jane',
  'jane.doe',
  'john',
  'john.doe',
  'joe',
  'joe.doe',
  'myname',
  'myemail',
  'name',
  'nobody',
  'qwerty',
  'qwertyuiop',
  'root',
  'test',
  'test1',
  'test123',
  'tester',
  'testing',
  'user',
  'user1',
  'user123',
  'username',
  'xxx',
  'xxxx',
  'yourname',
]);

function looksRandom(local: string): boolean {
  if (/^(.)\1{2,}$/.test(local)) return true;
  if (local.length >= 12 && /^(..)\1{3,}$/.test(local)) return true;
  return false;
}

export interface EmailCheck {
  valid: boolean;
  message: string | null;
}

export function checkEmail(input: string): EmailCheck {
  const email = input.trim().toLowerCase();

  if (!email) return { valid: false, message: 'Enter your email address' };
  if (email.length > MAX_EMAIL_LENGTH) {
    return { valid: false, message: 'That email address is too long' };
  }
  if (email.includes('..')) {
    return { valid: false, message: 'That email address is not valid' };
  }
  if (!email.includes('@')) {
    return {
      valid: false,
      message: 'Enter a real email address, for example name@gmail.com',
    };
  }

  const [local, ...rest] = email.split('@');
  const domain = rest.join('@');
  if (!local || !domain) {
    return {
      valid: false,
      message: 'Enter a real email address, for example name@gmail.com',
    };
  }
  if (local.length > MAX_LOCAL_LENGTH || domain.length > MAX_DOMAIN_LENGTH) {
    return { valid: false, message: 'That email address is not valid' };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return {
      valid: false,
      message: 'Enter a real email address, for example name@gmail.com',
    };
  }
  // The domain has to end in a real top level domain.
  const tld = domain.split('.').pop() ?? '';
  if (!isValidTld(tld)) {
    return {
      valid: false,
      message: 'That email domain is not valid. Use a real one, like gmail.com.',
    };
  }
  // Catch mistyped providers such as "gmial.com".
  const suggestion = suggestProviderDomain(domain);
  if (suggestion) {
    return {
      valid: false,
      message: `That email domain looks like a typo. Did you mean @${suggestion}?`,
    };
  }
  if (BLOCKED_DOMAINS.has(domain)) {
    return {
      valid: false,
      message: 'That email provider is not allowed. Use a real mailbox you can open.',
    };
  }
  if (BLOCKED_LOCAL_PARTS.has(local) || looksRandom(local)) {
    return {
      valid: false,
      message: 'That email address looks made up. Use the address you really use.',
    };
  }

  return { valid: true, message: null };
}
