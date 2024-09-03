/**
 * Solana Action chaining example
 */

import {
  createActionHeaders,
  NextActionPostRequest,
  ActionError,
  CompletedAction
} from '@solana/actions';
import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';

// create the standard headers for this route (including CORS)
const headers = createActionHeaders();

/**
 * since this endpoint is only meant to handle the callback request
 * for the action chaining, it does not accept or process GET requests
 */
export const GET = async (req: Request) => {
  return Response.json({ message: 'Method not supported' } as ActionError, {
    status: 403,
    headers
  });
};

export const OPTIONS = async () => Response.json(null, { headers });

export const POST = async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');
    console.log('imageUrl:', imageUrl);

    /**
     * we can type the `body.data` to what fields we expect from the GET response above
     */
    const body: NextActionPostRequest = await req.json();

    console.log('body:', body);

    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      throw 'Invalid "account" provided';
    }

    let signature: string;
    try {
      signature = body.signature;
      if (!signature) throw 'Invalid signature';
    } catch (err) {
      throw 'Invalid "signature" provided';
    }

    const connection = new Connection(process.env.SOLANA_RPC! || clusterApiUrl('devnet'));

    /**
     * todo: do we need to manually re-confirm the transaction?
     * todo: do we need to perform multiple confirmation attempts
     */

    try {
      let status = await connection.getSignatureStatus(signature);

      console.log('signature status:', status);

      if (!status) throw 'Unknown signature status';

      // only accept `confirmed` and `finalized` transactions
      if (status.value?.confirmationStatus) {
        if (
          status.value.confirmationStatus != 'confirmed' &&
          status.value.confirmationStatus != 'finalized'
        ) {
          throw 'Unable to confirm the transaction';
        }
      }

    } catch (err) {
      if (typeof err == 'string') throw err;
      throw 'Unable to confirm the provided signature';
    }

    const payload: CompletedAction = {
      type: 'completed',
      title: 'Geneva',
      icon: new URL(imageUrl!).toString(),
      label: 'Image Generation Successful',
      description: `Successfully generated image🎉🔥`
    };

    return Response.json(payload, {
      headers
    });
  } catch (err) {
    let actionError: ActionError = { message: 'An unknown error occurred' };
    if (typeof err == 'string') actionError.message = err;
    return Response.json(actionError, {
      status: 400,
      headers
    });
  }
};
