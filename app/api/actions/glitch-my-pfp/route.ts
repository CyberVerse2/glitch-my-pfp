import * as fal from '@fal-ai/serverless-client';
import { NextRequest, NextResponse } from 'next/server';
import { BlinksightsClient } from 'blinksights-sdk';
import {
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  MEMO_PROGRAM_ID,
  createActionHeaders
} from '@solana/actions';
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import * as bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  createTree,
  fetchMerkleTree,
  LeafSchema,
  mintV1,
  mplBubblegum,
  parseLeafFromMintV1Transaction
} from '@metaplex-foundation/mpl-bubblegum';
import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  none,
  Pda,
  publicKey
} from '@metaplex-foundation/umi';
console.log(process.env)
fal.config({
  credentials: process.env.FAL_AI_API_KEY
});

const client = new BlinksightsClient(process.env.BLINKSIGHTS_API_KEY!);

const headers = createActionHeaders();

const SEND_TOKEN_ADDRESS = new PublicKey('SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa');
const RECIPIENT_ADDRESS = new PublicKey('E5HmSiV9XjnGj6y9KogyHx3U7Q9GzcpRfRZrwosqEL8A');

async function generateImage(prompt: string, isUltra: boolean): Promise<string> {
  const model = isUltra ? 'fal-ai/flux-realism' : 'fal-ai/flux/schnell';
  const result = (await fal.subscribe(model, {
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

// export async function generateCnft(recipient: any, prompt: string, isUltra: boolean) {
//   const imageUrl = await generateImage(prompt);

//   // const merkleTree = generateSigner(umi);
//   // console.log(merkleTree.publicKey);
//   // const walletKeypair = umi.eddsa.createKeypairFromSecretKey(keypair.secretKey);
//   // console.log(walletKeypair.publicKey);
//   // const payer = createSignerFromKeypair(umi, walletKeypair);
//   // console.log(payer.publicKey);
//   // umi.use(keypairIdentity(payer));

//   // const builder = await createTree(umi, {
//   //   merkleTree,
//   //   payer,
//   //   maxDepth: 15,
//   //   maxBufferSize: 64
//   // });

//   // await builder.sendAndConfirm(umi);
//   const merkleTreePublicKey = publicKey('Df2vbbooX1u2L8nfaA8cjzZzbsZsNVokA8YKrabk6Y8o');
//   const merkleTreeAccount = await fetchMerkleTree(umi, merkleTreePublicKey);

//   const { signature } = await mintV1(umi, {
//     leafOwner: recipient,
//     merkleTree: merkleTreeAccount.publicKey,
//     metadata: {
//       name: `Geneva-Generated NFT`,
//       uri: imageUrl,
//       sellerFeeBasisPoints: 500, // 5%
//       collection: none(),
//       creators: [{ address: umi.identity.publicKey, verified: false, share: 100 }]
//     }
//   }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });

//   // setTimeout(async () => {
//   //   const leaf: LeafSchema = await parseLeafFromMintV1Transaction(umi, signature);
//   //   console.log(leaf);
//   // }, 60000);
//   const leaf: LeafSchema = await parseLeafFromMintV1Transaction(umi, signature);
//   //

//   const rpc = umi.rpc as any;
//   const rpcAsset = await rpc.getAsset(leaf.id);
//   console.log(rpcAsset);
//   return rpcAsset.content.json_uri;
// }

export async function GET(req: NextRequest) {
  let response = await client.createActionGetResponseV1(req.url, {
    type: 'action',
    icon: `https://res.cloudinary.com/dbuaprzc0/image/upload/f_auto,q_auto/xav9x6oqqsxmn5w9rqhg`,
    title: 'Geneva',
    description: `Generate an Image pased on a prompt 
  10 $SEND to generate a normal image
  20 $SEND to generate an ultra-realistic image`,
    label: 'Generate Image',
    links: {
      actions: [
        {
          label: 'Pay in $SEND',
          href: '/api/actions/glitch-my-pfp',
          parameters: [
            {
              name: 'prompt',
              label: 'Go wild..',
              type: 'textarea'
            },
            {
              name: 'isUltra',
              label: '',
              type: 'checkbox',
              options: [
                {
                  label: 'Ultra-Realistic Mode',
                  value: 'ultra',
                  selected: false
                }
              ]
            }
          ]
        }
      ]
    }
  });

  return NextResponse.json(response, {
    headers: ACTIONS_CORS_HEADERS
  });
}

export const OPTIONS = async () => Response.json(null, { headers });

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      account: string;
      data: { prompt: string; isUltra: Array<string> };
    };

    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      throw 'Invalid "account" provided';
    }
    await client.trackActionV2(account as unknown as string, req.url);

    const { searchParams } = new URL(req.url);
    console.log(searchParams);
    const prompt = body?.data?.prompt || searchParams.get('prompt');
    console.log(prompt);

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    let ultraman = body?.data?.isUltra || searchParams.get('isUltra')?.split('');
    let isUltra: boolean = false;

    if (ultraman[0] === 'ultra') {
      isUltra = true;
    }

    // Generate image based on prompt
    const imageUrl = await generateImage(prompt, isUltra);
    // const imageUrl = await generateCnft(account, prompt, Boolean(isUltra));
    const blinksightsActionIdentityInstruction = await client.getActionIdentityInstructionV2(
      account as unknown as string,
      req.url
    );
    const connection = new Connection(process.env.SOLANA_RPC! || clusterApiUrl('mainnet-beta'));

    // Get the associated token addresses
    const fromTokenAddress = await getAssociatedTokenAddress(SEND_TOKEN_ADDRESS, account);
    const toTokenAddress = await getAssociatedTokenAddress(SEND_TOKEN_ADDRESS, RECIPIENT_ADDRESS);

    const transaction = new Transaction();

    // Check if the recipient's token account exists, if not, create it
    const toTokenAccount = await connection.getAccountInfo(toTokenAddress);
    if (!toTokenAccount) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          account,
          toTokenAddress,
          RECIPIENT_ADDRESS,
          SEND_TOKEN_ADDRESS
        )
      );
    }

    // Add transfer instruction
    const imageGenerationCost = isUltra ? 20000000 : 1000000; // calculate cost based on isUltra
    transaction.add(
      createTransferInstruction(
        fromTokenAddress,
        toTokenAddress,
        account,
        imageGenerationCost, // 10 SEND tokens (assuming 9 decimals)
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Add blinksights action identity instruction
    transaction.add(blinksightsActionIdentityInstruction!);

    // Set the fee payer
    transaction.feePayer = account;

    // Get the latest blockhash
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
