// enroll.ts
// Turbin3 Enrollment (Devnet) — final submission with your GitHub handle
// IMPORTANT: Do NOT commit your wallet file. Add "*wallet.json" to .gitignore.

import wallet from "./Turbin3-wallet.json";

import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  addSignersToTransactionMessage,
  getProgramDerivedAddress,
  generateKeyPairSigner,
  getAddressEncoder,
  type TransactionMessageBytesBase64,
} from "@solana/kit";

// Generated client (Codama)
import { getSubmitTsInstruction } from "./clients/js/src/generated";

// ----- Constants -----
const MPL_CORE_PROGRAM = address("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const PROGRAM_ADDRESS  = address("TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM");
const SYSTEM_PROGRAM   = address("11111111111111111111111111111111");
const COLLECTION       = address("5ebsp5RChCGK7ssRZMVMufgVZhd2kFbNaotcZ5UvytN2");

async function main() {
  try {
    const keypair = await createKeyPairSignerFromBytes(new Uint8Array(wallet as any));
    console.log("Using wallet:", keypair.address);

    // ✅ Use plain URLs
    const rpc  = createSolanaRpc("https://api.devnet.solana.com");
    const subs = createSolanaRpcSubscriptions("wss://api.devnet.solana.com");

    const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: subs });
    const encoder = getAddressEncoder();

    // ----- Enrollment Account PDA -----
    const accountSeeds = [Buffer.from("prereqs"), encoder.encode(keypair.address)];
    const [accountPda] = await getProgramDerivedAddress({
      programAddress: PROGRAM_ADDRESS,
      seeds: accountSeeds,
    });
    console.log("Prereqs account PDA:", accountPda.toString());

    // ----- STEP: SubmitTs (mint NFT) -----
    const mintKeyPair = await generateKeyPairSigner();
    console.log("Mint keypair:", mintKeyPair.address);

    // Authority PDA (IDL shows seeds = ["collection", collection])
    const [authorityPda] = await getProgramDerivedAddress({
      programAddress: PROGRAM_ADDRESS,
      seeds: [
        Buffer.from("collection"),
        encoder.encode(COLLECTION),
      ],
    });
    console.log("Authority PDA:", authorityPda.toString());

    // Build submitTs instruction
    const submitIx = getSubmitTsInstruction({
      user: keypair,                               // signer
      account: address(accountPda.toString()),     // PDA
      mint: mintKeyPair,                           // signer
      collection: COLLECTION,
      authority: address(authorityPda.toString()), // PDA
      mplCoreProgram: MPL_CORE_PROGRAM,
      systemProgram: SYSTEM_PROGRAM,
    });

    // Build and send transaction
    const { value: bh } = await rpc.getLatestBlockhash().send();
    const txSubmitMsg = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayerSigner(keypair, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(bh, tx),
      tx => appendTransactionMessageInstructions([submitIx], tx),
      tx => addSignersToTransactionMessage([mintKeyPair], tx),
    );

    try {
      const compiled = compileTransaction(txSubmitMsg);
      const msgBase64 = Buffer.from(compiled.messageBytes).toString("base64") as TransactionMessageBytesBase64;
      const feeResp = await rpc.getFeeForMessage(msgBase64).send();
      console.log("Estimated submitTx fee (lamports):", feeResp?.value ?? "unknown");
    } catch (e) {
      console.warn("Could not estimate fee:", e);
    }

    const signedSubmit = await signTransactionMessageWithSigners(txSubmitMsg);
    assertIsTransactionWithinSizeLimit(signedSubmit);

    console.log("Sending submitTs...");
    await sendAndConfirm(signedSubmit, { commitment: "confirmed", skipPreflight: false });
    const sigSubmit = getSignatureFromTransaction(signedSubmit);
    console.log(`✅ submitTs OK: https://explorer.solana.com/tx/${sigSubmit}?cluster=devnet`);
  } catch (err) {
    console.error("enroll.ts error:", err);
    process.exit(1);
  }
}

main();
