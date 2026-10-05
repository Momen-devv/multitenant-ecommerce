import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Session,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  ResponseMessage,
} from '@/common/decorators';
import { ApiListQueryDto } from '@/common/api-query';
import type { CurrentUser } from '@/modules/auth/types/auth.types';
import { ParseSlugPipe } from '@/common/pipes/parse-slug.pipe';
import { ParseIdempotencyKeyPipe } from '@/common/pipes/parse-idempotency-key.pipe';
import { IdempotencyKey } from '@/common/decorators/idempotency-key.decorator';
import {
  CommentContentDto,
  ProductCommentDto,
  ProductCommentListDto,
} from '../dto/comment.dto';
import { CommentsService } from '../services/comments.service';

@ApiTags('Product Comments')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @AllowAnonymous()
  @Get('stores/:storeSlug/products/:productSlug/comments')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'List comments on a published product',
    description:
      'Cursor pagination with limit, cursor, sort, and fields. Supports filter[userId][eq]. Defaults to newest first.',
  })
  @ApiSuccessResponse({
    description: 'Comments retrieved successfully',
    model: ProductCommentListDto,
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, 'Invalid list query')
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'Published product not found')
  @ResponseMessage('Comments retrieved successfully')
  list(
    @Param('storeSlug', ParseSlugPipe) storeSlug: string,
    @Param('productSlug', ParseSlugPipe) productSlug: string,
    @Query() query: ApiListQueryDto,
  ) {
    return this.comments.list(storeSlug, productSlug, query);
  }

  @Post('products/:productId/comments')
  @ApiCookieAuth('mte.session_token')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create one comment on a published product',
    description:
      'Requires Idempotency-Key. Retrying the same normalized request and key returns the original creation result.',
  })
  @ApiSuccessResponse({
    status: HttpStatus.CREATED,
    description: 'Comment created successfully',
    model: ProductCommentDto,
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Invalid comment or Idempotency-Key',
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'Existing comment or Idempotency-Key reused with different content',
  )
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Comment failed moderation')
  @ApiErrorResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    'Comment moderation unavailable',
  )
  @ResponseMessage('Comment created successfully')
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Session() session: CurrentUser,
    @IdempotencyKey(ParseIdempotencyKeyPipe) idempotencyKey: string,
    @Body() dto: CommentContentDto,
  ) {
    return this.comments.create(
      productId,
      session.user.id,
      dto.content,
      idempotencyKey,
    );
  }

  @Patch('products/:productId/comments/:commentId')
  @ApiCookieAuth('mte.session_token')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Edit your comment' })
  @ApiSuccessResponse({
    description: 'Comment updated successfully',
    model: ProductCommentDto,
  })
  @ApiErrorResponse(HttpStatus.CONFLICT, 'Comment changed during moderation')
  @ResponseMessage('Comment updated successfully')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Session() session: CurrentUser,
    @Body() dto: CommentContentDto,
  ) {
    return this.comments.update(
      productId,
      commentId,
      session.user.id,
      dto.content,
    );
  }

  @Delete('products/:productId/comments/:commentId')
  @ApiCookieAuth('mte.session_token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete your comment' })
  delete(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Session() session: CurrentUser,
  ) {
    return this.comments.deleteOwn(productId, commentId, session.user.id);
  }
}
