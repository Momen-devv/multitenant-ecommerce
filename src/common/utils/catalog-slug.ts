import slugify from 'slugify';

export function createCatalogSlug(name: string) {
  return slugify(name, { lower: true, strict: true, trim: true });
}
