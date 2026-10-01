import { Injectable } from '@nestjs/common';
import { AssistantCommandDto } from '../dto';
import { PlatformAssistantAction } from '@/common/enums';
import { AiService } from '@/common/abstracts';
import { platformAssistantQuestions } from '../questions/platform-assistant.questions';
import { PlatformAssistantActionsService } from './platform-assistant-actions.service';
import type { AssistantHeaders } from '../types';

@Injectable()
export class PlatformAssistantService {
  constructor(
    private readonly aiService: AiService,
    private readonly platformAssistantActionsService: PlatformAssistantActionsService,
  ) {}

  async executeCommand(
    dto: AssistantCommandDto,
    headers: AssistantHeaders,
    actorId: string,
  ) {
    const result = await this.aiService.decide({
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
