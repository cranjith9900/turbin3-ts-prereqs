// transfer.ts
import wallet from "./dev-wallet.json";
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  devnet,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type TransactionMessageBytesBase64,
} from "@solana/kit";

const LAMPORTS_PER_SOL = BigInt(1_000_000_000);

async function main() {
  try {
    const keypair = await createKeyPairSignerFromBytes(new Uint8Array(wallet));
    console.log(`Using wallet address: ${keypair.address}`);

    const turbin3Wallet = address("F4a697XQNKrjQzfJfMkvomS9pv56QfWEFamUu9aixhv2");

    const httpEndpoint = "https://api.devnet.solana.com";
    const wsEndpoint = "wss://api.devnet.solana.com";
    const rpc = createSolanaRpc(devnet(httpEndpoint));
    const rpcSubscriptions = createSolanaRpcSubscriptions(devnet(wsEndpoint));

    // Helper to fetch balance
    const fetchBalanceSOL = async (pubkey: ReturnType<typeof address>) => {
      const balResp = await rpc.getBalance(pubkey).send();
      const lam = balResp?.value ?? 0n;
      return lam; // return raw lamports
    };

    // ---- 🔥 Step 1: Get balance ----
    const balance = await fetchBalanceSOL(keypair.address);
    console.log(`Balance before: ${Number(balance) / Number(LAMPORTS_PER_SOL)} SOL`);

    if (balance === 0n) {
      throw new Error("Wallet is already empty.");
    }

    // ---- 🔥 Step 2: Get latest blockhash ----
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    if (!latestBlockhash) throw new Error("Failed to fetch latest blockhash");

    // ---- 🔥 Step 3: Build dummy tx to calculate fee ----
    const { getTransferSolInstruction } = await import("@solana-program/system");
    const dummyInstruction = getTransferSolInstruction({
      source: keypair,
      destination: turbin3Wallet,
      amount: lamports(0n),
    });

    const dummyMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(keypair, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([dummyInstruction], tx)
    );

    const compiledDummy = compileTransaction(dummyMessage);
    const dummyMessageBase64 = Buffer.from(compiledDummy.messageBytes).toString("base64") as TransactionMessageBytesBase64;

    const { value: fee } = (await rpc.getFeeForMessage(dummyMessageBase64).send()) || { value: 0n };

    if (fee === null) throw new Error("Unable to calculate fee");
    if (balance <= fee) throw new Error(`Not enough balance to cover fee. Balance: ${balance}, Fee: ${fee}`);

    // ---- 🔥 Step 4: Calculate sendAmount ----
    const sendAmount = balance - fee;
    console.log(`Sending ${Number(sendAmount) / Number(LAMPORTS_PER_SOL)} SOL (after fee)`);

    // ---- 🔥 Step 5: Real transfer instruction ----
    const transferInstruction = getTransferSolInstruction({
      source: keypair,
      destination: turbin3Wallet,
      amount: lamports(sendAmount),
    });

    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(keypair, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([transferInstruction], tx)
    );

    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    assertIsTransactionWithinSizeLimit(signedTransaction);

    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

    console.log("Sending ALL funds...");
    await sendAndConfirmTransaction(signedTransaction, { commitment: "confirmed" });

    const signature = getSignatureFromTransaction(signedTransaction);
    console.log(`✅ Success! TX: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Check balance after
    const after = await fetchBalanceSOL(keypair.address);
    console.log(`Balance after: ${after} lamports (should be 0)`);
  } catch (err) {
    console.error("❌ Transfer failed:", err);
    process.exitCode = 1;
  }
}

main();
