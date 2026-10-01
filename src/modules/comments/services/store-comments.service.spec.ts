import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  STORE_COMMENTS_REPOSITORY,
  type IStoreCommentsRepository,
} from '../interfaces/repos';
import { StoreCommentsService } from './store-comments.service';

describe('StoreCommentsService', () => {
  let service: StoreCommentsService;
  let repository: jest.Mocked<IStoreCommentsRepository>;

  beforeEach(async () => {
    repository = { delete: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        StoreCommentsService,
        { provide: STORE_COMMENTS_REPOSITORY, useValue: repository },
      ],
    }).compile();
    service = module.get(StoreCommentsService);
  });

  it('deletes a comment scoped to the active store and product', async () => {
    repository.delete.mockResolvedValue({ id: 'comment-id' });

    await expect(
      service.delete('product-id', 'comment-id', 'store-id'),
    ).resolves.toBeUndefined();
    expect(repository.delete).toHaveBeenCalledWith(
      'comment-id',
      'product-id',
      'store-id',
    );
  });

  it('reports a missing or out-of-store comment', async () => {
    await expect(
      service.delete('product-id', 'comment-id', 'store-id'),
    ).rejects.toThrow(NotFoundException);
  });
});
