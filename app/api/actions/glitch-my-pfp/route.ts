import * as fal from '@fal-ai/serverless-client';
import { NextRequest, NextResponse } from 'next/server';
import {
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  MEMO_PROGRAM_ID,
  ActionPostRequest,
  createActionHeaders
} from '@solana/actions';
import {
  clusterApiUrl,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';

fal.config({
  credentials: '6fbb6aa3-2ce9-49ee-a350-963f4e379264:3976f7a73dcfcc5a629747061f36a28a'
});

const headers = createActionHeaders();

async function generateImage(prompt: string): Promise<string> {
  const result = (await fal.subscribe('fal-ai/flux/schnell', {
    input: { prompt },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        update.logs.map((log) => log.message).forEach(console.log);
      }
    }
  })) as any;
  console.log(result);
  return result.images[0].url;
}

export async function GET(req: NextRequest) {
  let response: ActionGetResponse = {
    type: 'action',
    icon: `https://res.cloudinary.com/dbuaprzc0/image/upload/f_auto,q_auto/bqcozox4gqrrtcavemzc`,
    title: 'Geneva',
    description: 'Generate an image based on a prompt',
    label: 'Generate Image',
    links: {
      actions: [
        {
          label: 'Generate',
          href: '/api/actions/glitch-my-pfp',
          parameters: [
            {
              name: 'prompt',
              label: 'Enter your image generation prompt',
              type: 'textarea'
            }
          ]
        }
      ]
    }
  };

  return NextResponse.json(response, {
    headers: ACTIONS_CORS_HEADERS
  });
}

export const OPTIONS = async () => Response.json(null, { headers });

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      account: string;
      data: { prompt: string };
    };

    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      throw 'Invalid "account" provided';
    }

    const { searchParams } = new URL(req.url);
    const prompt = body.data.prompt || searchParams.get('prompt');

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    // Generate image based on prompt
    const imageUrl = await generateImage(prompt);

    const connection = new Connection(process.env.SOLANA_RPC! || clusterApiUrl('devnet'));

    const transaction = new Transaction().add(
      // note: `createPostResponse` requires at least 1 non-memo instruction
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1000
      }),
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from(prompt, 'utf8'),
        keys: []
      })
    );

    // set the end user as the fee payer
    transaction.feePayer = account;

    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const payload = await createPostResponse({
      fields: {
        transaction,
        message: `Image generated successfully`,
        links: {
          next: {
            type: 'post',
            href: `/api/actions/glitch-my-pfp/create-nft?url=${imageUrl}`
          }
        }
      }
    });

    return NextResponse.json(payload, {
      headers: ACTIONS_CORS_HEADERS
    });
  } catch (err) {
    console.error('Error in POST /api/glitch-my-pfp', err);
    let message = 'An unknown error occurred';
    if (err instanceof Error) message = err.message;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS
    });
  }
}
