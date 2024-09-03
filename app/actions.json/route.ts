import { ACTIONS_CORS_HEADERS, ActionsJson } from '@solana/actions';

export const GET = async () => {
  const payload: ActionsJson = {
    rules: [
      {
        pathPattern: '/',
        apiPath: '/api/actions'
      },
      {
        pathPattern: '/*',
        apiPath: '/api/actions/*'
      },
      // fallback route
      {
        pathPattern: '/api/actions',
        apiPath: '/api/actions'
      }
    ]
  };

  return Response.json(payload, {
    headers: ACTIONS_CORS_HEADERS
  });
};
// ensures cors
export const OPTIONS = GET;
