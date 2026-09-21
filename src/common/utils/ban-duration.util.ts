import { removeEmails } from './email.util';

const UNIT_SECONDS = {
  second: 1,
  minute: 60,
  hour: 60 * 60,
  day: 60 * 60 * 24,
  week: 60 * 60 * 24 * 7,
  month: 60 * 60 * 24 * 30,
  year: 60 * 60 * 24 * 365,
} as const;

const MAX_BAN_DURATION_SECONDS = UNIT_SECONDS.year;

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const DURATION_PATTERN =
  /(?<![-\w])(?:(?<amount>\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*)?(?<unit>seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/gi;

const INVALID_DURATION_PATTERN =
  /(?:-\s*(?:\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*|\d+(?:\.\d+)?\s*-\s*|(?:zero|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[-\s]+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand))*\s+)(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/i;

const normalizeUnit = (unit: string): keyof typeof UNIT_SECONDS =>
  unit.toLowerCase().replace(/s$/, '') as keyof typeof UNIT_SECONDS;

const parseAmount = (amount?: string): number =>
  amount ? (NUMBER_WORDS[amount.toLowerCase()] ?? Number(amount)) : 1;

/**
 * Converts duration phrases to seconds for Better Auth's banExpiresIn field.
 * Returns undefined when the command does not contain a supported duration.
 */
export function parseBanDurationInSeconds(command: string): number | undefined {
  const commandWithoutEmails = removeEmails(command);

  if (INVALID_DURATION_PATTERN.test(commandWithoutEmails)) return undefined;

  const matches = [...commandWithoutEmails.matchAll(DURATION_PATTERN)];

  if (matches.length === 0) return undefined;

  const seconds = matches.reduce((total, match) => {
    const amount = parseAmount(match.groups?.amount);
    const unit = normalizeUnit(match.groups?.unit ?? '');

    return total + amount * UNIT_SECONDS[unit];
  }, 0);

  return Number.isSafeInteger(seconds) &&
    seconds > 0 &&
    seconds <= MAX_BAN_DURATION_SECONDS
    ? seconds
    : undefined;
}
