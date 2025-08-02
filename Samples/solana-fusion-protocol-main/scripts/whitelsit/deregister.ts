import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";

import WHITELIST_IDL from "../../target/idl/whitelist.json";
import { Whitelist } from "../../target/types/whitelist";

import {
  findResolverAccessAddress,
  findWhitelistStateAddress,
  getClusterUrlEnv,
  loadKeypairFromFile,
  prompt_,
} from "../utils";

async function deregister(
  connection: Connection,
  program: Program<Whitelist>,
  authorityKeypair: Keypair,
  user: PublicKey
): Promise<void> {
  const whitelistState = findWhitelistStateAddress(program.programId);
  const resolverAccess = findResolverAccessAddress(program.programId, user);

  const registerIx = await program.methods
    .deregister(user)
    .accountsPartial({
      authority: authorityKeypair.publicKey,
      whitelistState,
      resolverAccess,
    })
    .signers([authorityKeypair])
    .instruction();

  const tx = new Transaction().add(registerIx);

  const signature = await sendAndConfirmTransaction(connection, tx, [
    authorityKeypair,
  ]);
  console.log(`Transaction signature ${signature}`);
}

async function main() {
  const clusterUrl = getClusterUrlEnv();

  const connection = new Connection(clusterUrl, "confirmed");
  const whitelist = new Program<Whitelist>(WHITELIST_IDL, { connection });

  const authorityKeypairPath = prompt_(
    "authority-kp",
    "Enter authority keypair path: "
  );
  const authorityKeypair = await loadKeypairFromFile(authorityKeypairPath);
  const user = new PublicKey(prompt_("user-key", "Enter user public key: "));

  await deregister(connection, whitelist, authorityKeypair, user);
}

main();
