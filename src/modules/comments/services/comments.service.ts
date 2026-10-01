import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sha256Hex } from '@/common/utils';
import { AiService } from '@/common/abstracts';
import type { ApiListQueryInput } from '@/common/api-query';
import {
  COMMENTS_REPOSITORY,
  type ICommentsRepository,
} from '../interfaces/repos';
import { commentModerationQuestions } from '../questions/comment-moderation.questions';

@Injectable()
export class CommentsService {
  constructor(
    @Inject(COMMENTS_REPOSITORY)
    private readonly repository: ICommentsRepository,
    private readonly ai: AiService,
  ) {}

  async list(storeSlug: string, productSlug: string, query: ApiListQueryInput) {
    const page = await this.repository.list(storeSlug, productSlug, query);
    if (!page) throw new NotFoundException('Published product not found.');
    return page;
  }

  async create(
    productId: string,
    userId: string,
    content: string,
    idempotencyKey: string,
  ) {
    const requestHash = sha256Hex(JSON.stringify({ productId, content }));
    const replay = await this.repository.findCreateRequest(
      userId,
      idempotencyKey,
    );
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new ConflictException(
          'This Idempotency-Key was already used with a different request.',
        );
      }
      return replay.response;
    }
    const product = await this.repository.publishedProductById(productId);
    if (!product) throw new NotFoundException('Published product not found.');
    await this.checkContent(content);
    return this.repository.create(
      productId,
      userId,
      content,
      idempotencyKey,
      requestHash,
    );
  }

  async update(
    productId: string,
    commentId: string,
    userId: string,
    content: string,
  ) {
    const existing = await this.repository.find(commentId, productId, userId);
    if (!existing) throw new NotFoundException('Comment not found.');
    await this.checkContent(content);
    const updated = await this.repository.update(
      commentId,
      productId,
      userId,
      content,
      existing.version,
    );
    if (!updated)
      throw new ConflictException(
        'Comment changed while it was being updated.',
      );
    return updated;
  }

  async deleteOwn(productId: string, commentId: string, userId: string) {
    if (!(await this.repository.deleteOwn(commentId, productId, userId))) {
      throw new NotFoundException('Comment not found.');
    }
  }

  private async checkContent(content: string) {
    let decision: string;
    try {
      const result = await this.ai.decide({
        state: {
          comment: content,
          context:
            'A customer comment on an ecommerce product. Judge the comment text only.',
        },
        questions: commentModerationQuestions,
      });
      decision = result.answers.moderation.choice;
    } catch {
      throw new ServiceUnavailableException(
        'Comment moderation is temporarily unavailable.',
      );
    }
    if (decision !== 'safe')
      throw new ForbiddenException('Comment cannot be published.');
  }
}
