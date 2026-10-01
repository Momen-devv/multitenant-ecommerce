import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AiService } from '@/common/abstracts';
import { sha256Hex } from '@/common/utils';
import {
  COMMENTS_REPOSITORY,
  type ICommentsRepository,
} from '../interfaces/repos';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  const productId = 'product-id';
  const userId = 'user-id';
  const commentId = 'comment-id';
  const key = '8e03978e-40d5-43e8-bc93-6894a57f9324';
  const content = 'Useful product';
  const response = {
    id: commentId,
    productId,
    userId,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  let service: CommentsService;
  let repository: jest.Mocked<ICommentsRepository>;
  let decide: jest.Mock;

  beforeEach(async () => {
    repository = {
      list: jest.fn(),
      publishedProductById: jest.fn(),
      find: jest.fn(),
      findCreateRequest: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteOwn: jest.fn(),
    };
    decide = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: COMMENTS_REPOSITORY, useValue: repository },
        { provide: AiService, useValue: { decide } },
      ],
    }).compile();
    service = module.get(CommentsService);
  });

  it('returns a listed page and rejects a missing published product', async () => {
    const page = {
      items: [{ id: commentId }],
      pageInfo: { nextCursor: null, hasNextPage: false },
    };
    repository.list
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(undefined);

    await expect(service.list('store', 'product', {})).resolves.toEqual(page);
    await expect(service.list('store', 'missing', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('replays a completed create without checking the product or moderating again', async () => {
    repository.findCreateRequest.mockResolvedValue({
      requestHash: sha256Hex(JSON.stringify({ productId, content })),
      response,
    });

    await expect(
      service.create(productId, userId, content, key),
    ).resolves.toEqual(response);
    expect(repository.publishedProductById).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
  });

  it('rejects a reused key with different content before moderation', async () => {
    repository.findCreateRequest.mockResolvedValue({
      requestHash: 'different-hash',
      response,
    });

    await expect(
      service.create(productId, userId, content, key),
    ).rejects.toThrow(ConflictException);
    expect(decide).not.toHaveBeenCalled();
  });

  it('moderates then creates a comment with the request fingerprint', async () => {
    repository.publishedProductById.mockResolvedValue({
      id: productId,
      storeId: 'store-id',
    });
    decide.mockResolvedValue({ answers: { moderation: { choice: 'safe' } } });
    repository.create.mockResolvedValue(response);

    await expect(
      service.create(productId, userId, content, key),
    ).resolves.toEqual(response);
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({ comment: content }),
      }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      productId,
      userId,
      content,
      key,
      sha256Hex(JSON.stringify({ productId, content })),
    );
  });

  it('does not moderate or write a comment for an unpublished product', async () => {
    await expect(
      service.create(productId, userId, content, key),
    ).rejects.toThrow(NotFoundException);
    expect(decide).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('fails closed when moderation rejects or is unavailable', async () => {
    repository.publishedProductById.mockResolvedValue({
      id: productId,
      storeId: 'store-id',
    });
    decide.mockResolvedValueOnce({
      answers: { moderation: { choice: 'violation' } },
    });
    await expect(
      service.create(productId, userId, content, key),
    ).rejects.toThrow(ForbiddenException);
    decide.mockRejectedValueOnce(new Error('AI unavailable'));
    await expect(
      service.create(productId, userId, content, key),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('updates only the version read before moderation', async () => {
    repository.find.mockResolvedValue({
      ...response,
      storeId: 'store-id',
      version: 3,
      createdAt: new Date(response.createdAt),
      updatedAt: new Date(response.updatedAt),
    });
    decide.mockResolvedValue({ answers: { moderation: { choice: 'safe' } } });
    repository.update.mockResolvedValue(response);

    await expect(
      service.update(productId, commentId, userId, content),
    ).resolves.toEqual(response);
    expect(repository.update).toHaveBeenCalledWith(
      commentId,
      productId,
      userId,
      content,
      3,
    );
  });

  it('reports a concurrent edit when the versioned update finds no row', async () => {
    repository.find.mockResolvedValue({
      ...response,
      storeId: 'store-id',
      version: 3,
      createdAt: new Date(response.createdAt),
      updatedAt: new Date(response.updatedAt),
    });
    decide.mockResolvedValue({ answers: { moderation: { choice: 'safe' } } });

    await expect(
      service.update(productId, commentId, userId, content),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects edits to missing comments before moderation', async () => {
    await expect(
      service.update(productId, commentId, userId, content),
    ).rejects.toThrow(NotFoundException);
    expect(decide).not.toHaveBeenCalled();
  });

  it('deletes only the caller’s comment and reports a missing row', async () => {
    repository.deleteOwn.mockResolvedValueOnce({ id: commentId });
    await expect(
      service.deleteOwn(productId, commentId, userId),
    ).resolves.toBeUndefined();
    expect(repository.deleteOwn).toHaveBeenCalledWith(
      commentId,
      productId,
      userId,
    );
    await expect(
      service.deleteOwn(productId, commentId, userId),
    ).rejects.toThrow(NotFoundException);
  });
});
