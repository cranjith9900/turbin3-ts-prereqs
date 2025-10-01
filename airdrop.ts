// airdrop.ts
import wallet from "./dev-wallet.json";
import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  devnet,
  airdropFactory,
  lamports
} from "@solana/kit";

const LAMPORTS_PER_SOL = BigInt(1_000_000_000);

// Wrap in an async function so we can use await cleanly
async function main() {
  try {
    // Recreate the Keypair object from bytes (dev-wallet.json held as array of numbers)
    const keypair = await createKeyPairSignerFromBytes(new Uint8Array(wallet));
    console.log(`Your Solana wallet address: ${keypair.address}`);

    // Create RPC connection (HTTP + WebSocket)
    const httpEndpoint = "https://api.devnet.solana.com";
    const wsEndpoint = "wss://api.devnet.solana.com"; // use wss for secure websockets

    const rpc = createSolanaRpc(devnet(httpEndpoint));
    const rpcSubscriptions = createSolanaRpcSubscriptions(devnet(wsEndpoint));

    // Create airdrop helper from solana kit
    const airdrop = airdropFactory({ rpc, rpcSubscriptions });

    console.log("Requesting airdrop of 2 SOL (devnet)...");
    const sig = await airdrop({
      commitment: "confirmed",
      recipientAddress: keypair.address,
      lamports: lamports(2n * LAMPORTS_PER_SOL),
    });

    console.log(`Success! Check TX: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  } catch (error) {
    console.error("Airdrop failed:", error);
  }
}

main();
