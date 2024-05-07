import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';

import { Observable, of, switchMap, tap } from 'rxjs';

//services
import { CacheService } from '../cache-service.js';
import { Users } from '../users.js';

//utils
import { getCacheKey } from './utils/index.js';

//constants
import { CACHE, META_DATA } from '../../constants/index.js';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(private readonly cacheService: CacheService) {
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    const responseContext = httpContext.getResponse();

    const ttl = Reflect.getMetadata(META_DATA.TTL, context.getHandler()) ?? CACHE.DEFAULT_TTL;
    const isExpress = Reflect.getMetadata(META_DATA.EXPRESS, context.getHandler());

    const token = request.headers.authorization?.split(' ')[1];
    let user = {}

    if(token) {
      const users: Users = new Users();
      user = await users.getUserByToken(token);
    }

    const { url: route } = request;
    const cacheKey = getCacheKey(route, user);

    return of(null).pipe(
      switchMap(async () => {
        const cachedResponse: string = await this.cacheService.get(cacheKey);

        if (cachedResponse) {
          return JSON.parse(cachedResponse);
        }
      }),
      switchMap(resultResponse => {
        if (resultResponse) {
          if (isExpress) {
            return of(responseContext.send(resultResponse));
          }

          return of(resultResponse);
        }

        return next.handle().pipe(
          tap(async response => {
            let result = response;

            if (isExpress) {
              result = response.locals.data;
            }

            await this.cacheService.set(cacheKey, JSON.stringify(result), ttl);
          }),
        );
      }),
    );
  }
}
