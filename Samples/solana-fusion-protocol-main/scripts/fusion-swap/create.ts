import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import * as splToken from "@solana/spl-token";
const fs = require("fs");

import FUSION_IDL from "../../target/idl/fusion_swap.json";
import { FusionSwap } from "../../target/types/fusion_swap";
import {
  calculateOrderHash,
  defaultAuctionData,
  defaultExpirationTime,
  defaultFeeConfig,
  findEscrowAddress,
  getClusterUrlEnv,
  getTokenDecimals,
  loadKeypairFromFile,
  OrderConfig,
  prompt_,
} from "../utils";

import { AuctionData, FeeConfig } from "../../ts-common/common";

async function create(
  connection: Connection,
  program: Program<FusionSwap>,
  makerKeypair: Keypair,
  srcAmount: BN,
  minDstAmount: BN,
  srcMint: PublicKey,
  dstMint: PublicKey,
  orderId: number,
  expirationTime: number = defaultExpirationTime(),
  receiver: PublicKey = makerKeypair.publicKey,
  srcAssetIsNative: boolean = false,
  dstAssetIsNative: boolean = false,
  fee: FeeConfig = defaultFeeConfig,
  protocolDstAcc: PublicKey = null,
  integratorDstAcc: PublicKey = null,
  estimatedDstAmount: BN = minDstAmount,
  dutchAuctionData: AuctionData = defaultAuctionData,
  cancellationAuctionDuration: number = defaultAuctionData.duration,
  srcTokenProgram: PublicKey = splToken.TOKEN_PROGRAM_ID
): Promise<[PublicKey, PublicKey]> {
  const orderConfig: OrderConfig = {
    id: orderId,
    srcAmount,
    minDstAmount,
    estimatedDstAmount,
    expirationTime,
    srcAssetIsNative,
    dstAssetIsNative,
    fee: {
      ...fee,
      protocolDstAcc,
      integratorDstAcc,
    },
    dutchAuctionData,
    cancellationAuctionDuration,
    srcMint,
    dstMint,
    receiver,
  };

  const orderHash = calculateOrderHash(orderConfig);
  console.log(`Order hash hex: ${Buffer.from(orderHash).toString("hex")}`);

  fs.writeFileSync("order.json", JSON.stringify(orderConfig));
  console.log("Saved full and reduced order configs to order.json");

  const escrow = findEscrowAddress(
    program.programId,
    makerKeypair.publicKey,
    Buffer.from(orderHash)
  );
  const escrowAta = await splToken.getAssociatedTokenAddress(
    srcMint,
    escrow,
    true
  );

  let tx = new Transaction();

  const createIx = await program.methods
    .create(orderConfig)
    .accountsPartial({
      maker: makerKeypair.publicKey,
      makerReceiver: receiver,
      srcMint,
      dstMint,
      escrow,
      srcTokenProgram,
      protocolDstAcc,
      integratorDstAcc,
      makerSrcAta: orderConfig.srcAssetIsNative ? null : undefined,
      // if srcAssetIsNative then set makerSrcAta as null, else leave
      // it as undefined so that anchor will compute it using other accounts.
    })
    .signers([makerKeypair])
    .instruction();

  tx.add(createIx);

  const signature = await sendAndConfirmTransaction(connection, tx, [
    makerKeypair,
  ]);
  console.log(`Transaction signature ${signature}`);

  return [escrow, escrowAta];
}

async function main() {
  const clusterUrl = getClusterUrlEnv();
  const makerKeypairPath = prompt_("maker", "Enter maker keypair path: ");
  const srcMint = new PublicKey(
    prompt_("src-mint", "Enter src mint public key: ")
  );
  const dstMint = new PublicKey(
    prompt_("dst-mint", "Enter dst mint public key: ")
  );
  const srcAmount = Number(prompt_("amount", "Enter src amount: "));
  const minDstAmount = Number(
    prompt_("min-dst-amount", "Enter min dst amount: ")
  );
  const orderId = Number(prompt_("order-id", "Enter order id: "));

  const connection = new Connection(clusterUrl, "confirmed");
  const fusionSwap = new Program<FusionSwap>(FUSION_IDL, { connection });

  const makerKeypair = await loadKeypairFromFile(makerKeypairPath);

  const srcMintDecimals = await getTokenDecimals(connection, srcMint);
  const dstMintDecimals = await getTokenDecimals(connection, dstMint);

  const [escrowAddr, escrowAtaAddr] = await create(
    connection,
    fusionSwap,
    makerKeypair,
    new BN(srcAmount * Math.pow(10, srcMintDecimals)),
    new BN(minDstAmount * Math.pow(10, dstMintDecimals)),
    new PublicKey(srcMint),
    new PublicKey(dstMint),
    orderId,
    defaultExpirationTime(),
    makerKeypair.publicKey,
    srcMint.equals(splToken.NATIVE_MINT) // If source mint is native, then set srcAssetIsNative arg.
  );

  console.log(`Escrow account address: ${escrowAddr.toString()}`);
  console.log(`Escrow src ata address: ${escrowAtaAddr.toString()}`);
}

main();
