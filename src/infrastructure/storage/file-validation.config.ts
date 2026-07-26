import { HttpStatus, ParseFilePipeBuilder } from '@nestjs/common';

interface ImageFileValidationOptions {
  maxSize: number;
  fileType?: RegExp;
  required?: boolean;
}

export function createImageFileValidator({
  maxSize,
  fileType = /(jpeg|png|webp)$/,
  required = true,
}: ImageFileValidationOptions) {
  return new ParseFilePipeBuilder()
    .addMaxSizeValidator({ maxSize })
    .addFileTypeValidator({ fileType })
    .build({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      fileIsRequired: required,
    });
}
