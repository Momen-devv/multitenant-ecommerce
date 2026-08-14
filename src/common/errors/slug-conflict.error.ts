export class SlugConflictError extends Error {
  constructor() {
    super(
      'The provided slug is already taken. Please choose a different slug.',
    );
    this.name = 'SlugConflictError';
  }
}
