export class CategoryAssignmentNotFoundError extends Error {
  constructor() {
    super('One or more Categories were not found.');
    this.name = 'CategoryAssignmentNotFoundError';
  }
}
