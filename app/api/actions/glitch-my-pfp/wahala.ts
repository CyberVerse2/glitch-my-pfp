import * as fal from '@fal-ai/serverless-client';
import { NextRequest, NextResponse } from 'next/server';
import {
  Transaction,
  PublicKey,
  Connection,
  clusterApiUrl,
  SystemProgram,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { ACTIONS_CORS_HEADERS, createPostResponse, ActionGetResponse } from '@solana/actions';
import { Metaplex, keypairIdentity, irysStorage } from '@metaplex-foundation/js';
import { Keypair } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  createMint,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint
} from '@solana/spl-token';
import * as bs58 from 'bs58';

const base58PrivateKey =
  'EATP68qnKvrJjWSkZbwwNvNG9YRaRugudkHcED79ZMERsF9Rkk8WxgG4iofisgR9chZybxMeMyyYymVqem3brQA';
const privateKey = bs58.decode(base58PrivateKey);
const user = Keypair.fromSecretKey(privateKey);

const connection = new Connection(
  'https://devnet.helius-rpc.com/?api-key=1d33d108-520d-4e5c-998e-548383eb6665',
  'confirmed'
);

fal.config({
  credentials: '6fbb6aa3-2ce9-49ee-a350-963f4e379264:3976f7a73dcfcc5a629747061f36a28a'
});

const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(user))
  .use(
    irysStorage({
      address: 'https://devnet.irys.xyz',
      providerUrl: 'https://mainnet.helius-rpc.com/?api-key=1d33d108-520d-4e5c-998e-548383eb6665',
      timeout: 60000
    })
  );

// const SEND_TOKEN_MINT = new PublicKey('SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa'); // Replace with actual $SEND token mint address

let SEND_TOKEN_MINT: PublicKey;

async function createToken() {
  const mintRent = await getMinimumBalanceForRentExemptMint(connection);
  const mintAccount = Keypair.generate();

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: user.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID
    })
  );

  await sendAndConfirmTransaction(connection, transaction, [user, mintAccount]);

  const mint = await createMint(connection, user, user.publicKey, user.publicKey, 6, mintAccount);

  console.log(`Created new token: ${mint.toString()}`);
  return mint;
}

async function ensureToken() {
  if (!SEND_TOKEN_MINT) {
    SEND_TOKEN_MINT = await createToken();
  }
  return SEND_TOKEN_MINT;
}

async function generateImage(prompt: string): Promise<string> {
  const result = (await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt
    },
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

async function mintNFT(walletAddress: PublicKey, imageUrl: string, prompt: string) {
  const { uri } = await metaplex.nfts().uploadMetadata({
    name: 'Generated NFT',
    description: prompt,
    image: imageUrl
  });
  console.log(uri);

  const { nft } = await metaplex.nfts().create({
    uri,
    name: 'Generated NFT',
    sellerFeeBasisPoints: 500 // 5% royalty
  });
  console.log(nft);

  return nft;
}

async function transferSendTokens(fromAddress: PublicKey, toAddress: PublicKey, amount: number) {
  const fromTokenAccount = await connection.getTokenAccountsByOwner(fromAddress, {
    mint: SEND_TOKEN_MINT
  });
  const toTokenAccount = await connection.getTokenAccountsByOwner(toAddress, {
    mint: SEND_TOKEN_MINT
  });

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromTokenAccount.value[0].pubkey,
      toPubkey: toTokenAccount.value[0].pubkey,
      lamports: amount
    })
  );

  return transaction;
}

export async function GET(req: NextRequest) {
  let response: ActionGetResponse = {
    type: 'action',
    icon: `https://pplx-res.cloudinary.com/image/upload/v1725313230/ai_generated_images/azth7nt5jly1xyruzdhh.png`,
    title: 'Generate and Mint NFT',
    description: 'Generate an NFT based on a prompt and mint it for $SEND tokens',
    label: 'Generate NFT',
    links: {
      actions: [
        {
          label: 'Generate and Mint',
          href: '/api/generate-nft',
          parameters: [
            {
              name: 'prompt',
              label: 'Enter your NFT generation prompt'
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

export const OPTIONS = GET;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { account: string; signature: string };
    const { searchParams } = new URL(req.url);
    const prompt = searchParams.get('prompt');

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    const userWallet = new PublicKey(body.account);

    // Generate image based on prompt
    const imageUrl = await generateImage(prompt);

    // Mint the NFT
    const mintedNFT = await mintNFT(userWallet, imageUrl, prompt);
    console.log(mintedNFT);

    // Transfer $SEND tokens (assuming 1 $SEND token = 1 SOL for simplicity)
    const sendTokenAmount = 268970;
    const transferTransaction = await transferSendTokens(
      userWallet,
      new PublicKey('6kexz7VwA5J895tdWaDP6b4S9okQez1Att6E2jzWLXMk'), // Replace with actual recipient address
      sendTokenAmount
    );

    // Combine minting and token transfer into one transaction
    const tx = new Transaction().add(transferTransaction);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = userWallet;

    const payload = await createPostResponse({
      fields: {
        transaction: tx,
        message: `NFT generated and minted: ${mintedNFT.address.toString()}. Sign the transaction to complete the process and transfer $SEND tokens.`
      }
    });

    return NextResponse.json(payload, {
      headers: ACTIONS_CORS_HEADERS
    });
  } catch (err) {
    console.error('Error in POST /api/generate-nft', err);
    let message = 'An unknown error occurred';
    if (err instanceof Error) message = err.message;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS
    });
  }
}
