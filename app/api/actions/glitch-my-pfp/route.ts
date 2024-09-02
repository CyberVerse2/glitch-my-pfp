import { NextRequest, NextResponse } from 'next/server';
import { Transaction, PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { ACTIONS_CORS_HEADERS, createPostResponse, ActionGetResponse } from '@solana/actions';
import * as fal from '@fal-ai/serverless-client';
import axios from 'axios';

const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

fal.config({
  credentials: '6fbb6aa3-2ce9-49ee-a350-963f4e379264:3976f7a73dcfcc5a629747061f36a28a'
});

async function fetchUserNFTs(walletAddress: string) {
  const endpoint = 'https://api.mainnet-beta.solana.com';
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenAccountsByOwner',
    params: [
      walletAddress,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' } // Token program ID
    ]
  };

  try {
    const response = await axios.post(endpoint, payload);
    return response.data.result.value;
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    return null;
  }
}

async function createGlitchedNFT(originalNFT: string) {
  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt:
        'photo of a rhino dressed suit and tie sitting at a table in a bar with a bar stools, award winning photography, Elke vogelsang'
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        update.logs.map((log) => log.message).forEach(console.log);
      }
    }
  });
  console.log(result)
  return `Glitched_${originalNFT}`;
}

async function mintGlitchedNFT(walletAddress: string, glitchedNFTMint: string) {
  const endpoint = 'https://api.mainnet-beta.solana.com';
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sendTransaction',
    params: [glitchedNFTMint, { owner: walletAddress }]
  };

  try {
    const response = await axios.post(endpoint, payload);
    return response.data;
  } catch (error) {
    console.error('Error minting glitched NFT:', error);
    return null;
  }
}

async function transferSendTokens(fromAddress: string, toAddress: string, amount: number) {
  const endpoint = 'https://api.mainnet-beta.solana.com';
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'transfer',
    params: [fromAddress, toAddress, amount]
  };

  try {
    const response = await axios.post(endpoint, payload);
    return response.data;
  } catch (error) {
    console.error('Error transferring $SEND tokens:', error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  let response: ActionGetResponse = {
    type: 'action',
    icon: `https://res.cloudinary.com/dbuaprzc0/image/upload/f_auto,q_auto/spzg9pi88n6s1z0388u2`,
    title: 'Glitch and Mint NFT',
    description: 'Get a glitched version of your NFT and mint it for $SEND tokens',
    label: 'Glitch NFT',
    links: {
      actions: [
        {
          label: 'Glitch and Mint',
          href: '/api/glitch-nft'
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
    const userWallet = new PublicKey(body.account);

    // Fetch user's NFTs
    const userNFTs = await fetchUserNFTs(userWallet.toString());
    if (!userNFTs || userNFTs.length === 0) {
      throw new Error('No NFTs found in the wallet');
    }

    // Select a random NFT
    const selectedNFT = userNFTs[Math.floor(Math.random() * userNFTs.length)];

    // Create a glitched version
    const glitchedNFT = await createGlitchedNFT(selectedNFT.pubkey);

    // Mint the glitched NFT
    const mintResult = await mintGlitchedNFT(userWallet.toString(), glitchedNFT);
    if (!mintResult) {
      throw new Error('Failed to mint glitched NFT');
    }

    // Transfer $SEND tokens (assuming 1 $SEND token = 1000000 lamports)
    const sendTokenAmount = 1000000;
    const transferResult = await transferSendTokens(
      userWallet.toString(),
      'SEND_TOKEN_RECIPIENT_ADDRESS', // Replace with actual recipient address
      sendTokenAmount
    );
    if (!transferResult) {
      throw new Error('Failed to transfer $SEND tokens');
    }

    // Create a transaction to combine minting and token transfer
    const tx = new Transaction();
    // Add instructions for minting the glitched NFT and transferring $SEND tokens
    // (In a real implementation, you would add the actual instructions here)

    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = userWallet;

    const payload = await createPostResponse({
      fields: {
        transaction: tx,
        message: `Glitched NFT created and minted: ${glitchedNFT}. $SEND tokens transferred.`
      }
    });

    return NextResponse.json(payload, {
      headers: ACTIONS_CORS_HEADERS
    });
  } catch (err) {
    console.error('Error in POST /api/glitch-nft', err);
    let message = 'An unknown error occurred';
    if (err instanceof Error) message = err.message;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS
    });
  }
}
