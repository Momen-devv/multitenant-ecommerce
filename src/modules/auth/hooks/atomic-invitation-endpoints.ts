import {
  getCurrentAdapter,
  runWithTransaction,
} from '@better-auth/core/context';
import type { DBAdapter } from '@better-auth/core/db/adapter';
import type { organization } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';

/** Preserve the endpoint's validation/middleware metadata and inferred API.
 * Better Auth dispatch supplies this context for HTTP and direct api calls.
 * Its nested membership transaction joins the outer transaction through ALS.
 */
function atomicEndpoint<
  Args extends unknown[],
  Result,
  Endpoint extends (...args: Args) => Promise<Result>,
>(endpoint: Endpoint): Endpoint {
  const wrapped = async (...args: Args) => {
    const input = args[0] as { context: { adapter: DBAdapter } };
    try {
      return await runWithTransaction(input.context.adapter, async () => {
        // The resend route calls ctx.context.adapter directly, rather than ALS.
        const transactionalArgs = [
          {
            ...input,
            context: {
              ...input.context,
              adapter: await getCurrentAdapter(input.context.adapter),
            },
          },
          ...args.slice(1),
        ] as unknown as Args;
        return endpoint(...transactionalArgs);
      });
    } catch (error) {
      let cause: unknown = error;
      for (
        let depth = 0;
        depth < 5 && cause && typeof cause === 'object';
        depth++
      ) {
        if ('code' in cause && cause.code === 'PIR01')
          throw new APIError('TOO_MANY_REQUESTS', {
            code: 'INVITATION_RESEND_RATE_LIMITED',
            message: 'Wait one minute before resending this invitation',
          });
        cause = 'cause' in cause ? cause.cause : null;
      }
      throw error;
    }
  };
  return Object.assign(wrapped, endpoint);
}

export function atomicInvitationEndpoints<
  Plugin extends ReturnType<typeof organization>,
>(plugin: Plugin): Plugin {
  const endpoints = plugin.endpoints;
  endpoints.createInvitation = atomicEndpoint(endpoints.createInvitation);
  endpoints.acceptInvitation = atomicEndpoint(endpoints.acceptInvitation);
  endpoints.rejectInvitation = atomicEndpoint(endpoints.rejectInvitation);
  endpoints.cancelInvitation = atomicEndpoint(endpoints.cancelInvitation);
  return plugin;
}
