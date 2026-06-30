import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  message: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((result) => {
        // If the result already has the expected format, return as-is
        if (result && typeof result === 'object' && 'data' in result && 'message' in result) {
          return result;
        }
        // Otherwise, wrap it in the standard format
        return {
          data: result,
          message: 'Success',
        };
      }),
    );
  }
}
