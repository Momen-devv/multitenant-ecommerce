import { Injectable } from '@nestjs/common';
import type { StoreMembershipContext } from '@/common/guards/store-membership.guard';
import { StoreAssistantAction } from '@/common/enums';
import type { AssistantCommandDto } from '../dto';
import { AiService } from '@/common/abstracts';
import { storeAssistantQuestions } from '../questions/store-assistant.questions';
import { StoreAssistantActionsService } from './store-assistant-actions.service';
import type { AssistantHeaders } from '../types';

@Injectable()
export class StoreAssistantService {
  constructor(
    private readonly aiService: AiService,
    private readonly storeAssistantActionsService: StoreAssistantActionsService,
  ) {}

  async executeCommand(
    dto: AssistantCommandDto,
    context: StoreMembershipContext,
    headers: AssistantHeaders,
  ) {
    const result = await this.aiService.decide({
      state: {
        command: dto.command,
        context:
          'The command is a store-management request for the authenticated current store.',
      },
      questions: storeAssistantQuestions,
    });

    const action = result.answers.action.choice;

    if (action === StoreAssistantAction.SOME_OTHER_ACTION) {
      return {
        action,
        message:
          'Sorry, this store action is not supported. Please try a different command.',
      };
    }

    return this.storeAssistantActionsService.executeAction(
      action,
      dto.command,
      context,
      headers,
    );
  }
}
