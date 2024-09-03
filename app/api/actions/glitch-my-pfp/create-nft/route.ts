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

const connection = new Connection(process.env.SOLANA_RPC! || clusterApiUrl('mainnet-beta'));
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

async function confirmTransaction(
  connection: Connection,
  signature: string,
  maxRetries = 5,
  retryDelay = 5000
) {
  for (let i = 0; i < maxRetries; i++) {
    const status = await connection.getSignatureStatus(signature);

    if (
      status?.value?.confirmationStatus === 'confirmed' ||
      status?.value?.confirmationStatus === 'finalized'
    ) {
      return true;
    }

    if (status?.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  throw new Error('Transaction confirmation timeout');
}

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

    // In your POST function:
    try {
      await confirmTransaction(connection, signature);
      // Proceed with creating the payload
    } catch (error) {
      console.error('Transaction confirmation failed:', error);
      throw 'Unable to confirm the transaction';
    }

    const payload: CompletedAction = {
      type: 'completed',
      title: 'Geneva',
      icon: new URL(imageUrl!).toString(),
      label: `Image Generation Successful`,
      description: `Successfully generated image🎉🔥 Here is a link to the image: ${imageUrl}`
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
