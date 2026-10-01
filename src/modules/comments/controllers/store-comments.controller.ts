import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import { ActiveStore } from '@/common/decorators';
import { OrganizationRole } from '@/common/enums';
import {
  ActiveStoreGuard,
  type ActiveStoreContext,
} from '@/common/guards/active-store.guard';
import { StoreCommentsService } from '../services/store-comments.service';

@ApiTags('Product Comments')
@ApiCookieAuth('mte.session_token')
@UseGuards(ActiveStoreGuard)
@Controller('stores/me/products/:productId/comments')
export class StoreCommentsController {
  constructor(private readonly comments: StoreCommentsService) {}

  @Delete(':commentId')
  @OrgRoles([OrganizationRole.OWNER, OrganizationRole.MANAGER])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a comment from the active store product' })
  delete(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @ActiveStore() activeStore: ActiveStoreContext,
  ) {
    return this.comments.delete(productId, commentId, activeStore.storeId);
  }
}
