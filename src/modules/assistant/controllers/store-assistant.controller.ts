import { Controller } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Store AI Assistant')
@ApiCookieAuth('mte.session_token')
@Controller('stores/:storeId/assistant')
export class StoreAssistantController {}
