import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  MEMO_PROGRAM_ID
} from '@solana/actions';
import {
  clusterApiUrl,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import { ACTION } from 'next/dist/client/components/app-router-headers';

export const GET = (req: Request) => {
  const payload: ActionGetResponse = {
    icon: new URL(
      'https://res.cloudinary.com/dbuaprzc0/image/upload/f_auto,q_auto/bl6vq4pvhmzsa8jjjrbd'
    ).toString(),
    label: 'Send Memo',
    description: 'Send a memo to a Solana address',
    title: 'Memo Demo'
  };

  return Response.json(payload, {
    headers: ACTIONS_CORS_HEADERS
  });
};

export const OPTIONS = GET;

export const POST = async (req: Request) => {
  try {
    const transaction = new Transaction();
    const body: ActionPostRequest = await req.json();
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      return Response.json('Invalid Account', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS
      });
    }
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1000
      }),
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from('This is a simple memo message', 'utf8'),
        keys: []
      })
    );

    transaction.feePayer = account;

    const connection = new Connection(clusterApiUrl('devnet'));

    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message:'Thanks for sending me money werey'
      },
      // signers: []
    });

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS
    });
  } catch (error) {
    return Response.json('An Unknown Error Occured', {
      status: 400
    });
  }
};
