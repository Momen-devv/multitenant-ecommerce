import { Inject, Injectable } from '@nestjs/common';
import { type TypeSafeClient } from '@typesafe-ai/sdk';
import { AssistantCommandDto } from '../dto';
import { PlatformAssistantAction } from '@/common/enums';
import { TYPESAFE_CLIENT } from '../providers/typesafe-client.provider';
import { platformAssistantQuestions } from '../questions/platform-assistant.questions';
import { PlatformAssistantActionsService } from './platform-assistant-actions.service';
import type { AssistantHeaders } from '../types';

@Injectable()
export class PlatformAssistantService {
  constructor(
    @Inject(TYPESAFE_CLIENT)
    private readonly jevClient: TypeSafeClient,
    private readonly platformAssistantActionsService: PlatformAssistantActionsService,
  ) {}

  async executeCommand(
    dto: AssistantCommandDto,
    headers: AssistantHeaders,
    actorId: string,
  ) {
    const result = await this.jevClient.systemOne({
      state: {
        command: dto.command,
        context:
          'The command is an administrator request for one supported platform action.',
      },
      questions: platformAssistantQuestions,
    });

    const action = result.answers.action.choice;

    if (action === PlatformAssistantAction.SOME_OTHER_ACTION) {
      return {
        action,
        message:
          'Sorry you cannot do this action, please contact support or try a different command.',
      };
    }

    return this.platformAssistantActionsService.executeAction(
      action,
      dto.command,
      headers,
      actorId,
    );
  }
}
