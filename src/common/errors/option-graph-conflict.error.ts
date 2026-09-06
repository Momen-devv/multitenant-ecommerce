export class OptionGraphConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptionGraphConflictError';
  }
}
