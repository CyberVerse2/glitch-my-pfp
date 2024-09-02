import { NextRequest, NextResponse } from 'next/server';
import {
  Transaction,
  PublicKey,
  Connection,
  clusterApiUrl,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { ACTIONS_CORS_HEADERS, createPostResponse, ActionGetResponse } from '@solana/actions';
import axios from 'axios';
import { Metaplex, keypairIdentity, irysStorage } from '@metaplex-foundation/js';
import { Keypair } from '@solana/web3.js';


const base58PrivateKey =
  'EATP68qnKvrJjWSkZbwwNvNG9YRaRugudkHcED79ZMERsF9Rkk8WxgG4iofisgR9chZybxMeMyyYymVqem3brQA';
const user = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(base58PrivateKey, 'base64')));
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(user))
  .use(
    irysStorage({
      address: 'https://devnet.irys.xyz',
      providerUrl: 'https://api.devnet.solana.com',
      timeout: 60000
    })
  );

const SEND_TOKEN_MINT = new PublicKey('SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa'); // Replace with actual $SEND token mint address

async function generateImage(prompt: string): Promise<string> {
  // Simulating image generation with GlitchMyPFP
  const response = await axios.post('https://api.glitchypfp.com/v1/glitch', {
    prompt: prompt,
    style: 'cyberpunk' // You can adjust the style as needed
  });
  return response.data.image_url;
}

async function mintNFT(walletAddress: PublicKey, imageUrl: string, prompt: string) {

  const { uri } = await metaplex.nfts().uploadMetadata({
    name: 'Generated NFT',
    description: prompt,
    image: imageUrl
  });
  
  const { nft } = await metaplex.nfts().create({
    uri,
    name: 'Generated NFT',
    sellerFeeBasisPoints: 500 // 5% royalty
  });

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

    // Transfer $SEND tokens (assuming 1 $SEND token = 1 SOL for simplicity)
    const sendTokenAmount = LAMPORTS_PER_SOL;
    const transferTransaction = await transferSendTokens(
      userWallet,
      new PublicKey('SEND_TOKEN_RECIPIENT_ADDRESS'), // Replace with actual recipient address
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
