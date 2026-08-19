export class PlanCodeConflictError extends Error {
  constructor() {
    super(
      'The provided plan code is already taken. Please choose a different code.',
    );
    this.name = 'PlanCodeConflictError';
  }
}
