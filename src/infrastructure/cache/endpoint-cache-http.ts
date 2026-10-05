import type { Request, Response, NextFunction } from 'express';
import type { ReadCacheService } from './read-cache.service';
import type { CacheResource } from './read-cache.types';

export function endpointCacheHttp(cache: ReadCacheService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();
    let resource: CacheResource | undefined;
    const path = request.path;
    if (/^\/api\/v1\/plans\/?$/i.test(path)) resource = 'plan-list';
    else if (/^\/api\/v1\/plans\/[^/]+\/?$/i.test(path))
      resource = 'plan-detail';
    else if (/^\/api\/v1\/stores\/[^/]+\/products\/?$/i.test(path))
      resource = 'product-list';
    else if (/^\/api\/v1\/stores\/[^/]+\/products\/[^/]+\/?$/i.test(path))
      resource = 'product-detail';
    else if (/^\/api\/v1\/stores\/[^/]+\/categories\/?$/i.test(path))
      resource = 'categories';
    else if (/^\/api\/v1\/stores\/[^/]+\/categories\/[^/]+\/?$/i.test(path))
      resource = 'category-detail';
    else if (
      /^\/api\/v1\/stores\/[^/]+\/categories\/[^/]+\/products\/?$/i.test(path)
    )
      resource = 'category-products';
    if (resource) {
      response.setHeader('Cache-Control', 'no-store');
      const started = performance.now();
      response.once('finish', () =>
        cache.observe(resource, 'http-ms', performance.now() - started),
      );
    }
    next();
  };
}
