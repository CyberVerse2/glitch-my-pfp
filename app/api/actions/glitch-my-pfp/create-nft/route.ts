/**
 * Solana Action chaining example
 */

import {
  createActionHeaders,
  NextActionPostRequest,
  ActionError,
  CompletedAction,
  createPostResponse,
  MEMO_PROGRAM_ID,
  ActionPostRequest,
  ActionPostResponse,
  ActionGetResponse
} from '@solana/actions';
import {
  clusterApiUrl,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import { BlinksightsClient } from 'blinksights-sdk';
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

// create the standard headers for this route (including CORS)
const headers = createActionHeaders();

const connection = new Connection(process.env.SOLANA_RPC_DEVNET! || clusterApiUrl('devnet'));
const umi = createUmi(process.env.SOLANA_RPC!).use(mplBubblegum());

const client = new BlinksightsClient(process.env.BLINKSIGHTS_API_KEY!);
/**
 * since this endpoint is only meant to handle the callback request
 * for the action chaining, it does not accept or process GET requests
 */
export const GET = async (req: Request) => {
  let response: ActionGetResponse = await client.createActionGetResponseV1(req.url, {
    type: 'action',
    icon: `https://res.cloudinary.com/dbuaprzc0/image/upload/f_auto,q_auto/xav9x6oqqsxmn5w9rqhg`,
    title: 'Geneva',
    description: `Congratulations! You have successfully generated an image. You can mint it as an nft on devnet.`,
    label: 'Generate Image',
    links: {
      actions: [
        {
          label: 'Mint NFT',
          href: `/api/actions/glitch-my-pfp/create-nft/nft-success`
        }
      ]
    }
  });
  return Response.json(response, {
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
    console.log('Signature status:', status);

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

export async function generateCnft(recipient: any, imageUrl: string) {
  const merkleTreePublicKey = publicKey('Df2vbbooX1u2L8nfaA8cjzZzbsZsNVokA8YKrabk6Y8o');
  const merkleTreeAccount = await fetchMerkleTree(umi, merkleTreePublicKey);

  const { signature } = await mintV1(umi, {
    leafOwner: recipient,
    merkleTree: merkleTreeAccount.publicKey,
    metadata: {
      name: `Geneva-Generated NFT`,
      uri: imageUrl,
      sellerFeeBasisPoints: 500, // 5%
      collection: none(),
      creators: [{ address: umi.identity.publicKey, verified: false, share: 100 }]
    }
  }).sendAndConfirm(umi, { confirm: { commitment: 'finalized' } });

  const leaf: LeafSchema = await parseLeafFromMintV1Transaction(umi, signature);

  const rpc = umi.rpc as any;
  const rpcAsset = await rpc.getAsset(leaf.id);
  console.log(rpcAsset);
  return rpcAsset.content.json_uri;
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
    } catch (error) {
      console.error('Transaction confirmation failed:', error);
      throw 'Unable to confirm the transaction';
    }
    console.log(imageUrl, 'from second blink in action chaining');
    const cnft = await generateCnft(account, imageUrl!);
    if (!cnft) {
      throw 'Unable to generate CNFT';
    }
    const transaction = new Transaction().add(
      // note: `createPostResponse` requires at least 1 non-memo instruction
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1000
      }),
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from('geneva', 'utf8'),
        keys: []
      })
    );

    // set the end user as the fee payer
    transaction.feePayer = account;

    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: 'NFT Minted Successfully',
        links: {
          next: {
            type: 'post',
            href: `/api/actions/glitch-my-pfp/create-nft/nft-success?url=${imageUrl}`
          }
        }
      }
    });

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
