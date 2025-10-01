// empty-wallet.ts
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
  type TransactionMessageBytesBase64
} from "@solana/kit";

const LAMPORTS_PER_SOL = BigInt(1_000_000_000);

async function main() {
  try {
    // 1) Recreate keypair
    const keypair = await createKeyPairSignerFromBytes(new Uint8Array(wallet));
    console.log(`Using wallet address: ${keypair.address}`);

    // 2) Destination (Turbin3)
    const turbin3Wallet = address("F4a697XQNKrjQzfJfMkvomS9pv56QfWEFamUu9aixhv2");

    // 3) RPC setup
    const httpEndpoint = "https://api.devnet.solana.com";
    const wsEndpoint = "wss://api.devnet.solana.com";
    const rpc = createSolanaRpc(devnet(httpEndpoint));
    const rpcSubscriptions = createSolanaRpcSubscriptions(devnet(wsEndpoint));

    // 4) Get balance
    const { value: balance } = await rpc.getBalance(keypair.address).send();
    console.log(`Current balance: ${Number(balance) / Number(LAMPORTS_PER_SOL)} SOL`);

    if (balance === 0n) {
      throw new Error("Wallet is already empty.");
    }

    // 5) Latest blockhash
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    if (!latestBlockhash) throw new Error("Failed to fetch latest blockhash");

    // 6) Build dummy tx with 0 lamports to calculate fee
    const { getTransferSolInstruction } = await import("@solana-program/system");
    const dummyTransferInstruction = getTransferSolInstruction({
      source: keypair,
      destination: turbin3Wallet,
      amount: lamports(0n),
    });

    const dummyMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(keypair, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([dummyTransferInstruction], tx)
    );

    const compiledDummy = compileTransaction(dummyMessage);
    const dummyMessageBase64 = Buffer.from(compiledDummy.messageBytes).toString("base64") as TransactionMessageBytesBase64;

    const { value: fee } = (await rpc.getFeeForMessage(dummyMessageBase64).send()) || { value: 0n };

    if (fee === null) {
      throw new Error("Unable to calculate transaction fee");
    }

    if (balance < fee) {
      throw new Error(`Insufficient balance for fee. Balance: ${balance}, Fee: ${fee}`);
    }

    // 7) Calculate exact send amount (balance - fee)
    const sendAmount = balance - fee;
    console.log(
      `Sending ${Number(sendAmount) / Number(LAMPORTS_PER_SOL)} SOL (exact, after fee deduction)`
    );

    // 8) Build real transfer
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

    // 9) Sign
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    assertIsTransactionWithinSizeLimit(signedTransaction);

    // 10) Send + confirm
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
    await sendAndConfirmTransaction(signedTransaction, { commitment: "confirmed" });

    const signature = getSignatureFromTransaction(signedTransaction);
    console.log(`✅ Success! Explorer link: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // 11) Check balance again
    const { value: newBalance } = await rpc.getBalance(keypair.address).send();
    console.log(`Remaining balance: ${newBalance} lamports (should be 0)`);
  } catch (err) {
    console.error("❌ Transfer failed:", err);
    process.exitCode = 1;
  }
}

main();
