import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseSlugPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      throw new BadRequestException(
        'Store slug must contain only lowercase letters, numbers, and hyphens.',
      );
    }

    return value;
  }
}
