export class ProductImageGalleryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductImageGalleryConflictError';
  }
}
