import { choice } from '@typesafe-ai/sdk';

export const commentModerationQuestions = {
  moderation: choice(
    'Classify `comment` for publishing. A violation includes hate, harassment, threats, sexual exploitation, explicit sexual content, spam, scams, or promotion of illegal activity. Ordinary criticism, complaints, and profanity without abuse are allowed. Choose uncertain if the context is insufficient.',
    {
      safe: 'No listed violation is present.',
      violation: 'At least one listed violation is present.',
      uncertain: 'The text is ambiguous and cannot be confidently classified.',
    },
  ),
};
