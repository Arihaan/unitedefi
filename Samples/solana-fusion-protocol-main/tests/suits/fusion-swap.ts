import * as anchor from "@coral-xyz/anchor";
import * as splToken from "@solana/spl-token";
import { FusionSwap } from "../../target/types/fusion_swap";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  TestState,
  createTokens,
  createAtasUsers,
  createWhitelistedAccount,
  debugLog,
  mintTokens,
  removeWhitelistedAccount,
  trackReceivedTokenAndTx,
  printTxCosts,
} from "../utils/utils";

import { Whitelist } from "../../target/types/whitelist";
import {
  initializeLookupTable,
  sendV0Transaction,
} from "../utils/lookupTables";
import { calculateOrderHash } from "../../scripts/utils";
chai.use(chaiAsPromised);

describe("Fusion Swap", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FusionSwap as anchor.Program<FusionSwap>;
  const whitelistProgram = anchor.workspace
    .Whitelist as anchor.Program<Whitelist>;

  const payer = (provider.wallet as NodeWallet).payer;
  debugLog(`Payer ::`, payer.publicKey.toString());

  let state: TestState;

  before(async () => {
    state = await TestState.anchorCreate(provider, payer, { tokensNums: 3 });
  });

  beforeEach(async () => {
    state.escrows = [];
    for (let i = 0; i < 2; ++i) {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
      });
      state.escrows.push(escrow);
      debugLog(`Escrow_${escrow.orderConfig.id} ::`, escrow.escrow.toString());
      debugLog(`escrowAta_${escrow.orderConfig.id} ::`, escrow.ata.toString());
    }
  });

  describe("Single escrow", () => {
    it("Execute the trade", async () => {
      const transactionPromise = () =>
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(state.buildAccountsDataForFill({}))
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, state.escrows[0].ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(state.defaultDstAmount.toNumber()),
        BigInt(state.defaultSrcAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
      ]);
    });

    it("Execute the trade with different maker's receiver", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          receiver: state.charlie.keypair.publicKey,
        },
      });
      const transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              makerReceiver: escrow.orderConfig.receiver,
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              makerDstAta:
                state.charlie.atas[state.tokens[1].toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.charlie.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(state.defaultDstAmount.toNumber()),
        BigInt(state.defaultSrcAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
      ]);
    });

    it("Execute the trade without u64 overflow", async () => {
      // amount * amount is greater than u64::max
      const amount = new anchor.BN(10 * Math.pow(10, 9));

      await mintTokens(
        state.tokens[0],
        state.alice,
        amount.toNumber(),
        provider,
        payer
      );

      await mintTokens(
        state.tokens[1],
        state.bob,
        amount.toNumber(),
        provider,
        payer
      );

      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          srcAmount: amount,
          minDstAmount: amount,
          estimatedDstAmount: amount,
        },
      });

      const transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, amount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(amount.toNumber()),
        BigInt(amount.toNumber()),
        -BigInt(amount.toNumber()),
      ]);

      // Burn excess tokens to not affect the global state
      await splToken.burn(
        provider.connection,
        state.alice.keypair,
        state.alice.atas[state.tokens[1].toString()].address,
        state.tokens[1],
        state.alice.keypair,
        amount.toNumber()
      );

      await splToken.burn(
        provider.connection,
        state.bob.keypair,
        state.bob.atas[state.tokens[0].toString()].address,
        state.tokens[0],
        state.bob.keypair,
        amount.toNumber()
      );
    });

    it("Execute the trade with different taker's receiver wallet", async () => {
      const transactionPromise = () =>
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              takerSrcAta:
                state.charlie.atas[state.tokens[0].toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
          state.charlie.atas[state.tokens[0].toString()].address,
          state.charlie.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, state.escrows[0].ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(state.defaultDstAmount.toNumber()),
        BigInt(0),
        -BigInt(state.defaultDstAmount.toNumber()),
        BigInt(state.defaultSrcAmount.toNumber()),
        BigInt(0),
      ]);
    });

    it("Doesn't execute the trade when maker's token account belongs to wrong mint", async () => {
      await expect(
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              makerDstAta: state.alice.atas[state.tokens[2].toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintTokenMint");
    });

    it("Execute the trade with native tokens => tokens", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          srcMint: splToken.NATIVE_MINT,
        },
      });

      const transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              srcMint: splToken.NATIVE_MINT,
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              takerSrcAta:
                state.bob.atas[splToken.NATIVE_MINT.toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[splToken.NATIVE_MINT.toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(state.defaultDstAmount.toNumber()),
        BigInt(state.defaultSrcAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
      ]);
    });

    it("Execute the trade with tokens => native tokens", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          dstMint: splToken.NATIVE_MINT,
        },
      });

      const transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              dstMint: splToken.NATIVE_MINT,
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              makerDstAta:
                state.alice.atas[splToken.NATIVE_MINT.toString()].address,
              takerDstAta:
                state.bob.atas[splToken.NATIVE_MINT.toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[splToken.NATIVE_MINT.toString()].address,
          state.bob.atas[splToken.NATIVE_MINT.toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(state.defaultDstAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
        BigInt(state.defaultSrcAmount.toNumber()),
      ]);
    });

    describe("Token 2022", () => {
      before(async () => {
        const tokens = await createTokens(
          2,
          provider,
          payer,
          splToken.TOKEN_2022_PROGRAM_ID
        );
        state.tokens.push(...tokens);

        const usersWithToken2022Atas = await createAtasUsers(
          [state.alice.keypair, state.bob.keypair],
          tokens,
          provider,
          payer,
          splToken.TOKEN_2022_PROGRAM_ID
        );
        state.alice.atas = {
          ...state.alice.atas,
          ...usersWithToken2022Atas[0].atas,
        };
        state.bob.atas = {
          ...state.bob.atas,
          ...usersWithToken2022Atas[1].atas,
        };

        await mintTokens(
          tokens[0],
          state.alice,
          100_000_000,
          provider,
          payer,
          splToken.TOKEN_2022_PROGRAM_ID
        );
        await mintTokens(
          tokens[1],
          state.bob,
          100_000_000,
          provider,
          payer,
          splToken.TOKEN_2022_PROGRAM_ID
        );
      });

      it("Execute trade with SPL Token -> Token 2022", async () => {
        const dstTokenProgram = splToken.TOKEN_2022_PROGRAM_ID;
        const dstMint = state.tokens[state.tokens.length - 1]; // Token 2022
        const makerDstAta = state.alice.atas[dstMint.toString()].address;
        const takerDstAta = state.bob.atas[dstMint.toString()].address;
        const escrow = await state.createEscrow({
          escrowProgram: program,
          payer,
          provider,
          orderConfig: {
            dstMint,
          },
        });

        const transactionPromise = () =>
          program.methods
            .fill(escrow.orderConfig, state.defaultSrcAmount)
            .accountsPartial({
              ...state.buildAccountsDataForFill({
                escrow: escrow.escrow,
                escrowSrcAta: escrow.ata,
                dstMint,
                makerDstAta,
                takerDstAta,
                dstTokenProgram,
              }),
            })
            .signers([state.bob.keypair])
            .rpc();

        const results = await trackReceivedTokenAndTx(
          provider.connection,
          [
            { publicKey: makerDstAta, programId: dstTokenProgram },
            {
              publicKey: state.bob.atas[state.tokens[0].toString()].address,
              programId: splToken.TOKEN_PROGRAM_ID,
            },
            { publicKey: takerDstAta, programId: dstTokenProgram },
          ],
          transactionPromise
        );

        expect(results).to.be.deep.eq([
          BigInt(state.defaultDstAmount.toNumber()),
          BigInt(state.defaultSrcAmount.toNumber()),
          -BigInt(state.defaultDstAmount.toNumber()),
        ]);
      });

      it("Execute trade with Token 2022 -> SPL Token", async () => {
        const srcTokenProgram = splToken.TOKEN_2022_PROGRAM_ID;
        const srcMint = state.tokens[state.tokens.length - 2]; // Token 2022
        const takerSrcAta = state.bob.atas[srcMint.toString()].address;

        const escrow = await state.createEscrow({
          escrowProgram: program,
          payer,
          provider,
          orderConfig: {
            srcMint,
          },
          srcTokenProgram,
        });

        const transactionPromise = () =>
          program.methods
            .fill(escrow.orderConfig, state.defaultSrcAmount)
            .accountsPartial({
              ...state.buildAccountsDataForFill({
                escrow: escrow.escrow,
                escrowSrcAta: escrow.ata,
                srcMint,
                takerSrcAta,
                srcTokenProgram,
              }),
            })
            .signers([state.bob.keypair])
            .rpc();

        const results = await trackReceivedTokenAndTx(
          provider.connection,
          [
            {
              publicKey: state.alice.atas[state.tokens[1].toString()].address,
              programId: splToken.TOKEN_PROGRAM_ID,
            },
            { publicKey: takerSrcAta, programId: srcTokenProgram },
            {
              publicKey: state.bob.atas[state.tokens[1].toString()].address,
              programId: splToken.TOKEN_PROGRAM_ID,
            },
          ],
          transactionPromise
        );

        expect(results).to.be.deep.eq([
          BigInt(state.defaultDstAmount.toNumber()),
          BigInt(state.defaultSrcAmount.toNumber()),
          -BigInt(state.defaultDstAmount.toNumber()),
        ]);
      });

      it("Execute trade between two Token 2022 tokens", async () => {
        const tokenProgram = splToken.TOKEN_2022_PROGRAM_ID;
        const srcMint = state.tokens[state.tokens.length - 2]; // First Token 2022
        const dstMint = state.tokens[state.tokens.length - 1]; // Second Token 2022
        const makerDstAta = state.alice.atas[dstMint.toString()].address;
        const takerSrcAta = state.bob.atas[srcMint.toString()].address;
        const takerDstAta = state.bob.atas[dstMint.toString()].address;

        const escrow = await state.createEscrow({
          escrowProgram: program,
          payer,
          provider,
          orderConfig: {
            srcMint,
            dstMint,
          },
          srcTokenProgram: tokenProgram,
        });

        const transactionPromise = () =>
          program.methods
            .fill(escrow.orderConfig, state.defaultSrcAmount)
            .accountsPartial({
              ...state.buildAccountsDataForFill({
                escrow: escrow.escrow,
                escrowSrcAta: escrow.ata,
                srcMint,
                dstMint,
                makerDstAta,
                takerSrcAta,
                takerDstAta,
                srcTokenProgram: tokenProgram,
                dstTokenProgram: tokenProgram,
              }),
            })
            .signers([state.bob.keypair])
            .rpc();

        const results = await trackReceivedTokenAndTx(
          provider.connection,
          [
            { publicKey: makerDstAta, programId: tokenProgram },
            { publicKey: takerSrcAta, programId: tokenProgram },
            { publicKey: takerDstAta, programId: tokenProgram },
          ],
          transactionPromise
        );

        expect(results).to.be.deep.eq([
          BigInt(state.defaultDstAmount.toNumber()),
          BigInt(state.defaultSrcAmount.toNumber()),
          -BigInt(state.defaultDstAmount.toNumber()),
        ]);
      });

      it("Cancel escrow with Token 2022", async () => {
        const tokenProgram = splToken.TOKEN_2022_PROGRAM_ID;
        const srcMint = state.tokens[state.tokens.length - 2]; // Token 2022

        const escrow = await state.createEscrow({
          escrowProgram: program,
          payer,
          provider,
          orderConfig: {
            srcMint,
          },
          srcTokenProgram: tokenProgram,
        });

        const orderHash = calculateOrderHash(escrow.orderConfig);

        const transactionPromise = () =>
          program.methods
            .cancel(Array.from(orderHash), false)
            .accountsPartial({
              maker: state.alice.keypair.publicKey,
              srcMint,
              escrow: escrow.escrow,
              srcTokenProgram: tokenProgram,
            })
            .signers([state.alice.keypair])
            .rpc();

        const results = await trackReceivedTokenAndTx(
          provider.connection,
          [
            {
              publicKey: state.alice.atas[srcMint.toString()].address,
              programId: tokenProgram,
            },
          ],
          transactionPromise
        );

        expect(results).to.be.deep.eq([
          BigInt(state.defaultSrcAmount.toNumber()),
        ]);
      });
    });

    it("Execute the trade with protocol fee", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          fee: {
            protocolDstAcc:
              state.charlie.atas[state.tokens[1].toString()].address,
            protocolFee: 10000, // 10%
            integratorDstAcc: undefined,
            integratorFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });

      const transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              protocolDstAcc:
                state.charlie.atas[state.tokens[1].toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
          state.charlie.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt((state.defaultDstAmount.toNumber() * 9) / 10),
        BigInt(state.defaultSrcAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
        BigInt(state.defaultDstAmount.toNumber() / 10),
      ]);
    });

    it("Execute the trade with native tokens (SOL) as destination + protocol fee", async () => {
      const makerNativeTokenBalanceBefore =
        await provider.connection.getBalance(state.alice.keypair.publicKey);
      const feeReciverNativeTokenBalanceBefore =
        await provider.connection.getBalance(
          state.charlie.atas[splToken.NATIVE_MINT.toString()].address
        );

      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          dstAssetIsNative: true,
          dstMint: splToken.NATIVE_MINT,
          fee: {
            protocolDstAcc:
              state.charlie.atas[splToken.NATIVE_MINT.toString()].address,
            protocolFee: 10000, // 10%
            integratorDstAcc: undefined,
            integratorFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });
      const fee = Math.floor(state.defaultDstAmount.toNumber() / 10);

      await program.methods
        .fill(escrow.orderConfig, state.defaultSrcAmount)
        .accountsPartial(
          state.buildAccountsDataForFill({
            escrow: escrow.escrow,
            escrowSrcAta: escrow.ata,
            dstMint: splToken.NATIVE_MINT,
            makerDstAta: null,
            takerDstAta: null,
            protocolDstAcc:
              state.charlie.atas[splToken.NATIVE_MINT.toString()].address,
          })
        )
        .signers([state.bob.keypair])
        .rpc();

      const makerNativeTokenBalanceAfter = await provider.connection.getBalance(
        state.alice.keypair.publicKey
      );
      const feeReciverNativeTokenBalanceAfter =
        await provider.connection.getBalance(
          state.charlie.atas[splToken.NATIVE_MINT.toString()].address
        );

      // check that native tokens were sent to maker
      expect(makerNativeTokenBalanceAfter).to.be.eq(
        makerNativeTokenBalanceBefore + state.defaultDstAmount.toNumber() - fee
      );
      // check that protocol fee was sent to the protocol fee receiver
      expect(feeReciverNativeTokenBalanceAfter).to.be.eq(
        feeReciverNativeTokenBalanceBefore + fee
      );

      // Verify that the escrow account was closed
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);
    });

    it("Execute the trade with integrator fee", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          fee: {
            integratorDstAcc:
              state.charlie.atas[state.tokens[1].toString()].address,
            integratorFee: 15000, // 15%
            protocolDstAcc: undefined,
            protocolFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });

      const transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              integratorDstAcc:
                state.charlie.atas[state.tokens[1].toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
          state.charlie.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(Math.ceil((state.defaultDstAmount.toNumber() * 85) / 100)),
        BigInt(state.defaultSrcAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
        BigInt(Math.floor((state.defaultDstAmount.toNumber() * 15) / 100)),
      ]);
    });

    it("Execute the trade with native tokens (SOL) as destination + integrator fee", async () => {
      const makerNativeTokenBalanceBefore =
        await provider.connection.getBalance(state.alice.keypair.publicKey);
      const feeReciverNativeTokenBalanceBefore =
        await provider.connection.getBalance(
          state.charlie.atas[splToken.NATIVE_MINT.toString()].address
        );

      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          dstAssetIsNative: true,
          dstMint: splToken.NATIVE_MINT,
          fee: {
            integratorDstAcc:
              state.charlie.atas[splToken.NATIVE_MINT.toString()].address,
            integratorFee: 15000, // 15%
            protocolDstAcc: undefined,
            protocolFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });
      const fee = Math.floor((state.defaultDstAmount.toNumber() * 15) / 100);

      await program.methods
        .fill(escrow.orderConfig, state.defaultSrcAmount)
        .accountsPartial(
          state.buildAccountsDataForFill({
            escrow: escrow.escrow,
            escrowSrcAta: escrow.ata,
            dstMint: splToken.NATIVE_MINT,
            makerDstAta: null,
            takerDstAta: null,
            integratorDstAcc:
              state.charlie.atas[splToken.NATIVE_MINT.toString()].address,
          })
        )
        .signers([state.bob.keypair])
        .rpc();

      const makerNativeTokenBalanceAfter = await provider.connection.getBalance(
        state.alice.keypair.publicKey
      );
      const feeReciverNativeTokenBalanceAfter =
        await provider.connection.getBalance(
          state.charlie.atas[splToken.NATIVE_MINT.toString()].address
        );

      // check that native tokens were sent to maker
      expect(makerNativeTokenBalanceAfter).to.be.eq(
        makerNativeTokenBalanceBefore + state.defaultDstAmount.toNumber() - fee
      );
      // check that protocol fee was sent to the protocol fee receiver
      expect(feeReciverNativeTokenBalanceAfter).to.be.eq(
        feeReciverNativeTokenBalanceBefore + fee
      );

      // Verify that the escrow account was closed
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);
    });

    it("Execute the trade with native tokens (SOL) as destination and different maker receiver", async () => {
      const makerReceiverNativeTokenBalanceBefore =
        await provider.connection.getBalance(state.charlie.keypair.publicKey);

      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          dstAssetIsNative: true,
          dstMint: splToken.NATIVE_MINT,
          receiver: state.charlie.keypair.publicKey,
        },
      });

      await program.methods
        .fill(escrow.orderConfig, state.defaultSrcAmount)
        .accountsPartial(
          state.buildAccountsDataForFill({
            escrow: escrow.escrow,
            escrowSrcAta: escrow.ata,
            dstMint: splToken.NATIVE_MINT,
            makerReceiver: escrow.orderConfig.receiver,
            makerDstAta: null,
            takerDstAta:
              state.bob.atas[splToken.NATIVE_MINT.toString()].address,
          })
        )
        .signers([state.bob.keypair])
        .rpc();

      const makerReceiverNativeTokenBalanceAfter =
        await provider.connection.getBalance(state.charlie.keypair.publicKey);

      // check that native tokens were sent to maker
      expect(makerReceiverNativeTokenBalanceAfter).to.be.eq(
        makerReceiverNativeTokenBalanceBefore +
          state.defaultDstAmount.toNumber()
      );

      // Verify that the escrow account was closed
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);
    });

    it("Execute the trade with wrapped native tokens (wSOL) as destination + protocol & integrator fee", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          dstMint: splToken.NATIVE_MINT,
          fee: {
            protocolDstAcc:
              state.charlie.atas[splToken.NATIVE_MINT.toString()].address,
            protocolFee: 10000, // 10%
            integratorDstAcc:
              state.dave.atas[splToken.NATIVE_MINT.toString()].address,
            integratorFee: 15000, // 15%
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });

      const transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              dstMint: splToken.NATIVE_MINT,
              makerDstAta:
                state.alice.atas[splToken.NATIVE_MINT.toString()].address,
              takerDstAta:
                state.bob.atas[splToken.NATIVE_MINT.toString()].address,
              protocolDstAcc:
                state.charlie.atas[splToken.NATIVE_MINT.toString()].address,
              integratorDstAcc:
                state.dave.atas[splToken.NATIVE_MINT.toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[splToken.NATIVE_MINT.toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[splToken.NATIVE_MINT.toString()].address,
          state.charlie.atas[splToken.NATIVE_MINT.toString()].address,
          state.dave.atas[splToken.NATIVE_MINT.toString()].address,
        ],
        transactionPromise
      );
      // Verify that the escrow account was closed
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(Math.ceil((state.defaultDstAmount.toNumber() * 75) / 100)),
        BigInt(state.defaultSrcAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
        BigInt(Math.floor((state.defaultDstAmount.toNumber() * 10) / 100)),
        BigInt(Math.floor((state.defaultDstAmount.toNumber() * 15) / 100)),
      ]);
    });

    it("Doesn't execute the trade with exchange amount more than escow has (src token)", async () => {
      await expect(
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount.muln(10))
          .accountsPartial(state.buildAccountsDataForFill({}))
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: NotEnoughTokensInEscrow");
    });

    it("Doesn't execute the trade without taking dst ata", async () => {
      await expect(
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              takerDstAta: null,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: MissingTakerDstAta");
    });

    it("Check that maker's yToken account is created automatically if it wasn't initialized before", async () => {
      // burn maker's yToken and close account
      const aliceBalanceYToken = await splToken.getAccount(
        provider.connection,
        state.alice.atas[state.tokens[1].toString()].address
      );
      await splToken.burn(
        provider.connection,
        state.alice.keypair,
        state.alice.atas[state.tokens[1].toString()].address,
        state.tokens[1],
        state.alice.keypair,
        aliceBalanceYToken.amount,
        []
      );
      await splToken.closeAccount(
        provider.connection,
        state.alice.keypair,
        state.alice.atas[state.tokens[1].toString()].address,
        state.alice.keypair.publicKey,
        state.alice.keypair.publicKey,
        []
      );
      // calc maker's yToken ata
      const aliceAtaYToken = await splToken.getAssociatedTokenAddress(
        state.tokens[1],
        state.alice.keypair.publicKey
      );

      // Check that token account doesn't exist before executing the trade
      try {
        await splToken.getAccount(provider.connection, aliceAtaYToken);
        chai.assert(false);
      } catch (e) {
        expect(e.toString().includes("TokenAccountNotFoundError"));
      }

      await program.methods
        .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
        .accountsPartial(
          state.buildAccountsDataForFill({
            makerDstAta: aliceAtaYToken,
          })
        )
        .signers([state.bob.keypair])
        .rpc();

      // Check that token account exists after trade and has expected balance
      const aliceYAta = await splToken.getAccount(
        provider.connection,
        aliceAtaYToken
      );
      expect(aliceYAta.amount).to.be.eq(
        BigInt(state.defaultDstAmount.toNumber())
      );
    });

    // TODO uncomment after receiver wallet initialization will be implemented

    // it.only("Check that taker's xToken account is created automatically if it wasn't initialized before", async () => {
    //   // burn taker's xToken and close account
    //   const state.bobBalanceXToken = await splToken.getAccount(provider.connection, state.bob.atas[state.tokens[0].toString()].address);
    //   await splToken.burn(provider.connection, state.bob.keypair, state.bob.atas[state.tokens[0].toString()].address, state.tokens[0], state.bob.keypair, state.bobBalanceXToken.amount, []);
    //   await splToken.closeAccount(provider.connection, state.bob.keypair, state.bob.atas[state.tokens[0].toString()].address, state.bob.keypair.publicKey, state.bob.keypair.publicKey, []);
    //   // calc takers's xToken ata
    //   const state.bobAtaXToken = await splToken.getAssociatedTokenAddress(state.tokens[0], state.bob.keypair.publicKey);

    //   // Check that token account doesn't exist before executing the trade
    //   try {
    //     await splToken.getAccount(provider.connection, state.bobAtaXToken);
    //     chai.assert(false);
    //   } catch (e) {
    //     expect(e.toString().includes("TokenAccountNotFoundError"));
    //   }

    //   await program.methods.fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
    //   .accounts({
    //     taker: state.bob.keypair.publicKey,
    //     maker: state.alice.keypair.publicKey,
    //     srcMint: state.tokens[0],
    //     dstMint: state.tokens[1],
    //     escrow: state.escrows[0].escrow,
    //     escrowSrcAta: state.escrows[0].ata,
    //     makerDstAta: state.alice.atas[state.tokens[1].toString()].address,
    //     takerSrcAta: state.bobAtaXToken,
    //     takerDstAta: state.bob.atas[state.tokens[1].toString()].address,
    //     tokenProgram: splToken.TOKEN_PROGRAM_ID,
    //     associatedTokenProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
    //     systemProgram: anchor.web3.SystemProgram.programId,
    //   })
    //   .signers([state.bob.keypair])
    //   .rpc();

    //   // Check that token account exists after trade and has expected balance
    //   const state.bobXAta = await splToken.getAccount(provider.connection, state.bobAtaXToken);
    //   expect(bobXAta.amount).to.be.eq(BigInt(state.defaultSrcAmount.toNumber()));
    // });

    // TODO: Add a test for the case of accepting an expired order

    it("Fails to create with zero src amount", async () => {
      const orderConfig = state.orderConfig({
        srcAmount: new anchor.BN(0),
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      await expect(
        program.methods
          .create(orderConfig)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            makerReceiver: orderConfig.receiver,
            srcMint: state.tokens[0],
            dstMint: state.tokens[1],
            protocolDstAcc: null,
            integratorDstAcc: null,
            escrow: escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: InvalidAmount");
    });

    it("Fails to create with spl-tokens, if maker-src-ata is missing", async () => {
      const orderConfig = state.orderConfig({});

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      // srcAmount = 0
      await expect(
        program.methods
          .create(orderConfig)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            makerReceiver: orderConfig.receiver,
            srcMint: state.tokens[0],
            dstMint: state.tokens[1],
            protocolDstAcc: orderConfig.fee.protocolDstAcc,
            integratorDstAcc: null,
            escrow: escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
            makerSrcAta: null,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: InconsistentNativeSrcTrait");
    });

    it("Fails to create with zero min dst amount", async () => {
      const orderConfig = state.orderConfig({
        minDstAmount: new anchor.BN(0),
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      await expect(
        program.methods
          .create(orderConfig)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            makerReceiver: orderConfig.receiver,
            srcMint: state.tokens[0],
            dstMint: state.tokens[1],
            protocolDstAcc: null,
            integratorDstAcc: null,
            escrow: escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: InvalidAmount");
    });

    it("Fails to create if escrow has been created already", async () => {
      const orderConfig = state.orderConfig();

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      await program.methods
        .create(orderConfig)
        .accountsPartial({
          maker: state.alice.keypair.publicKey,
          makerReceiver: orderConfig.receiver,
          srcMint: state.tokens[0],
          dstMint: state.tokens[1],
          protocolDstAcc: null,
          integratorDstAcc: null,
          escrow: escrow,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([state.alice.keypair])
        .rpc();

      await expect(
        program.methods
          .create(orderConfig)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            makerReceiver: orderConfig.receiver,
            srcMint: state.tokens[0],
            dstMint: state.tokens[1],
            protocolDstAcc: null,
            integratorDstAcc: null,
            escrow: escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Provided owner is not allowed"); // https://github.com/solana-program/associated-token-account/blob/c3f117d3bc0dd6904b8bd12c61053afb28a6a02d/program/src/processor.rs#L109C34-L109C46
    });

    it("Doesn't execute the trade with the wrong order_id", async () => {
      await expect(
        program.methods
          .fill(state.escrows[1].orderConfig, state.defaultSrcAmount)
          .accountsPartial(state.buildAccountsDataForFill({}))
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Doesn't execute the trade with the wrong escrow ata", async () => {
      await expect(
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrowSrcAta: state.escrows[1].ata,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintTokenOwner");
    });

    it("Doesn't execute the trade with the wrong dstMint", async () => {
      await expect(
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              dstMint: state.tokens[0],
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintTokenMint");
    });

    it("Doesn't execute the trade with the wrong maker receiver", async () => {
      await expect(
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              makerReceiver: state.charlie.keypair.publicKey,
              makerDstAta:
                state.charlie.atas[state.tokens[1].toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Doesn't create escrow with the wrong surplus param", async () => {
      const orderConfig = state.orderConfig({
        fee: {
          surplusPercentage: 146, // 146%
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          maxCancellationPremium: undefined,
        },
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      await expect(
        program.methods
          .create(orderConfig)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            makerReceiver: orderConfig.receiver,
            srcMint: state.tokens[0],
            dstMint: state.tokens[1],
            protocolDstAcc: null,
            integratorDstAcc: null,
            escrow: escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: InvalidProtocolSurplusFee");
    });

    it("Doesn't create escrow with protocol_dst_acc from different mint", async () => {
      const orderConfig = state.orderConfig({
        fee: {
          protocolFee: 10000, // 10%
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
          maxCancellationPremium: undefined,
        },
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      await expect(
        program.methods
          .create(orderConfig)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            makerReceiver: orderConfig.receiver,
            srcMint: state.tokens[0],
            dstMint: state.tokens[1],
            protocolDstAcc:
              state.charlie.atas[state.tokens[0].toString()].address,
            integratorDstAcc: null,
            escrow: escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Doesn't create escrow with intergrator_dst_acc from different mint", async () => {
      const orderConfig = state.orderConfig({
        fee: {
          integratorFee: 10000, // 10%
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          surplusPercentage: undefined,
          maxCancellationPremium: undefined,
        },
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      await expect(
        program.methods
          .create(orderConfig)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            makerReceiver: orderConfig.receiver,
            srcMint: state.tokens[0],
            dstMint: state.tokens[1],
            protocolDstAcc: null,
            integratorDstAcc:
              state.charlie.atas[state.tokens[0].toString()].address,
            escrow: escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Doesn't execute the trade with wrong protocol_dst_acc authority", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          fee: {
            protocolDstAcc:
              state.charlie.atas[state.tokens[1].toString()].address,
            protocolFee: 10000, // 10%
            integratorDstAcc: undefined,
            integratorFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });

      await expect(
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              protocolDstAcc:
                state.bob.atas[state.tokens[1].toString()].address, // wrong protocol_dst_acc authority
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Doesn't execute the trade with the wrong protocol_dst_acc mint", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          fee: {
            protocolDstAcc:
              state.charlie.atas[state.tokens[0].toString()].address, // wrong protocol_dst_acc mint
            protocolFee: 10000, // 10%
            integratorDstAcc: undefined,
            integratorFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });

      await expect(
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              protocolDstAcc:
                state.charlie.atas[state.tokens[0].toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error: Account not associated with this Mint");
    });

    it("Doesn't execute the trade without protocol_dst_acc", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          fee: {
            protocolDstAcc:
              state.charlie.atas[state.tokens[1].toString()].address,
            protocolFee: 10000, // 10%
            integratorDstAcc: undefined,
            integratorFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });

      await expect(
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Doesn't execute the trade with the wrong integrator_dst_acc authority", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          fee: {
            integratorDstAcc:
              state.charlie.atas[state.tokens[1].toString()].address,
            integratorFee: 10000, // 10%
            protocolDstAcc: undefined,
            protocolFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });

      await expect(
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              integratorDstAcc:
                state.bob.atas[state.tokens[1].toString()].address, // wrong integrator_dst_acc authority
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Doesn't execute the trade with the wrong integrator_dst_acc mint", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          fee: {
            integratorDstAcc:
              state.charlie.atas[state.tokens[0].toString()].address, // wrong integrator_dst_acc mint
            integratorFee: 10000, // 10%
            protocolDstAcc: undefined,
            protocolFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });

      await expect(
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              integratorDstAcc:
                state.charlie.atas[state.tokens[0].toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error: Account not associated with this Mint");
    });

    it("Doesn't execute the trade without integrator_dst_acc", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          fee: {
            integratorDstAcc:
              state.charlie.atas[state.tokens[1].toString()].address,
            integratorFee: 10000, // 10%
            protocolDstAcc: undefined,
            protocolFee: undefined,
            surplusPercentage: undefined,
            maxCancellationPremium: undefined,
          },
        },
      });

      await expect(
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Execute the multiple trades", async () => {
      let transactionPromise = () =>
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount.divn(2))
          .accountsPartial(state.buildAccountsDataForFill({}))
          .signers([state.bob.keypair])
          .rpc();

      let results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.escrows[0].ata,
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );

      expect(results).to.be.deep.eq([
        -BigInt(state.defaultSrcAmount.divn(2).toNumber()),
        BigInt(state.defaultDstAmount.divn(2).toNumber()),
        BigInt(state.defaultSrcAmount.divn(2).toNumber()),
        -BigInt(state.defaultDstAmount.divn(2).toNumber()),
      ]);

      // Second trade
      transactionPromise = () =>
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount.divn(2))
          .accountsPartial(state.buildAccountsDataForFill({}))
          .signers([state.bob.keypair])
          .rpc();

      results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, state.escrows[0].ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(state.defaultDstAmount.divn(2).toNumber()),
        BigInt(state.defaultSrcAmount.divn(2).toNumber()),
        -BigInt(state.defaultDstAmount.divn(2).toNumber()),
      ]);
    });

    it("Execute the multiple trades, rounding", async () => {
      const _srcAmount = new anchor.BN(101);
      const _dstAmount = new anchor.BN(101);
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          srcAmount: _srcAmount,
          minDstAmount: _dstAmount,
          estimatedDstAmount: _dstAmount,
        },
      });

      let transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, _srcAmount.divn(2))
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      let results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          escrow.ata,
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );

      expect(results).to.be.deep.eq([
        -BigInt(_srcAmount.divn(2).toNumber()),
        BigInt(_dstAmount.divn(2).toNumber()),
        BigInt(_srcAmount.divn(2).toNumber()),
        -BigInt(_dstAmount.divn(2).toNumber()),
      ]);

      // Second trade
      transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, _srcAmount.divn(2))
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          escrow.ata,
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );

      expect(results).to.be.deep.eq([
        -BigInt(_srcAmount.divn(2).toNumber()),
        BigInt(_dstAmount.divn(2).toNumber()),
        BigInt(_srcAmount.divn(2).toNumber()),
        -BigInt(_dstAmount.divn(2).toNumber()),
      ]);

      // Third trade
      transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, new anchor.BN(1))
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          // escrow.ata, // escrow closed and ata not exists
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );

      expect(results).to.be.deep.eq([
        // -BigInt(new anchor.BN(1).toNumber()), // escrow closed and ata not exists
        BigInt(new anchor.BN(1).toNumber()),
        BigInt(new anchor.BN(1).toNumber()),
        -BigInt(new anchor.BN(1).toNumber()),
      ]);
    });

    it("Cancel the trade", async () => {
      const orderHash = calculateOrderHash(state.escrows[0].orderConfig);

      const transactionPromise = () =>
        program.methods
          .cancel(Array.from(orderHash), false)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            srcMint: state.tokens[0],
            escrow: state.escrows[0].escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [state.alice.atas[state.tokens[0].toString()].address],
        transactionPromise
      );

      expect(results).to.be.deep.eq([
        BigInt(state.defaultSrcAmount.toNumber()),
      ]);
    });

    it("Cancellation works if src-token is native and maker-src-ata is not provided", async () => {
      const srcAmount = new anchor.BN(10000);
      // create new escrow
      const orderConfig = state.orderConfig({
        srcMint: splToken.NATIVE_MINT,
        srcAssetIsNative: true,
        srcAmount,
        expirationTime: 0xffffffff,
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      await program.methods
        .create(orderConfig)
        .accountsPartial({
          maker: state.alice.keypair.publicKey,
          makerReceiver: orderConfig.receiver,
          srcMint: splToken.NATIVE_MINT,
          dstMint: state.tokens[1],
          protocolDstAcc: null,
          integratorDstAcc: null,
          escrow,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          makerSrcAta: null,
        })
        .signers([state.alice.keypair])
        .rpc();

      await program.methods
        .cancel(Array.from(calculateOrderHash(orderConfig)), true)
        .accountsPartial({
          maker: state.alice.keypair.publicKey,
          srcMint: splToken.NATIVE_MINT,
          escrow: escrow,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          makerSrcAta: null,
        })
        .signers([state.alice.keypair])
        .rpc();
    });

    it("Cancellation with spl tokens fails if maker-src-ata is absent", async () => {
      const orderHash = calculateOrderHash(state.escrows[0].orderConfig);

      await expect(
        program.methods
          .cancel(Array.from(orderHash), false)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            srcMint: state.tokens[0],
            escrow: state.escrows[0].escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
            makerSrcAta: null,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: InconsistentNativeSrcTrait");
    });

    it("Cancel the trade with native tokens", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          srcMint: splToken.NATIVE_MINT,
        },
      });

      const orderHash = calculateOrderHash(escrow.orderConfig);

      const makerNativeBalanceBefore = (
        await provider.connection.getAccountInfo(state.alice.keypair.publicKey)
      ).lamports;

      await program.methods
        .cancel(Array.from(orderHash), true)
        .accountsPartial({
          maker: state.alice.keypair.publicKey,
          srcMint: splToken.NATIVE_MINT,
          escrow: escrow.escrow,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          makerSrcAta: null,
        })
        .signers([state.alice.keypair])
        .rpc();

      const tokenAccountRent =
        await provider.connection.getMinimumBalanceForRentExemption(
          splToken.AccountLayout.span
        );

      expect(
        (
          await provider.connection.getAccountInfo(
            state.alice.keypair.publicKey
          )
        ).lamports
      ).to.be.eq(
        makerNativeBalanceBefore +
          state.defaultSrcAmount.toNumber() +
          tokenAccountRent
      );

      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);
    });

    it("Doesn't cancel the trade with the wrong order_id", async () => {
      const orderHash = calculateOrderHash(state.escrows[1].orderConfig);

      await expect(
        program.methods
          .cancel(Array.from(orderHash), false)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            srcMint: state.tokens[0],
            escrow: state.escrows[0].escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Doesn't cancel the trade with the wrong escrow ata", async () => {
      const orderHash = calculateOrderHash(state.escrows[0].orderConfig);

      await expect(
        program.methods
          .cancel(Array.from(orderHash), false)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            srcMint: state.tokens[0],
            escrow: state.escrows[0].escrow,
            escrowSrcAta: state.escrows[1].ata,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintTokenOwner");
    });

    it("Doesn't cancel the trade with the wrong maker", async () => {
      const orderHash = calculateOrderHash(state.escrows[0].orderConfig);

      await expect(
        program.methods
          .cancel(Array.from(orderHash), false)
          .accountsPartial({
            maker: state.charlie.keypair.publicKey,
            srcMint: state.tokens[0],
            escrow: state.escrows[0].escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.charlie.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });

    it("Fails when taker isn't whitelisted", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
      });

      await expect(
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount.divn(2))
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              taker: state.charlie.keypair.publicKey,
              takerDstAta:
                state.charlie.atas[state.tokens[1].toString()].address,
              takerSrcAta:
                state.charlie.atas[state.tokens[0].toString()].address,
            })
          )
          .signers([state.charlie.keypair])
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: resolver_access. Error Code: AccountNotInitialized"
      );
    });

    it("Execute the partial fill and close escow after", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
      });

      // Fill the trade partially
      const transactionPromiseFill = () =>
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount.divn(2))
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const resultsFill = await trackReceivedTokenAndTx(
        provider.connection,
        [
          escrow.ata,
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
        ],
        transactionPromiseFill
      );

      expect(resultsFill).to.be.deep.eq([
        -BigInt(state.defaultSrcAmount.divn(2).toNumber()),
        BigInt(state.defaultDstAmount.divn(2).toNumber()),
        BigInt(state.defaultSrcAmount.divn(2).toNumber()),
        -BigInt(state.defaultDstAmount.divn(2).toNumber()),
      ]);

      const orderHash = calculateOrderHash(escrow.orderConfig);

      // Cancel the trade
      const transactionPromiseCancel = () =>
        program.methods
          .cancel(Array.from(orderHash), false)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            srcMint: state.tokens[0],
            escrow: escrow.escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc();

      const resultsCancel = await trackReceivedTokenAndTx(
        provider.connection,
        [state.alice.atas[state.tokens[0].toString()].address],
        transactionPromiseCancel
      );

      expect(resultsCancel).to.be.deep.eq([
        BigInt(state.defaultSrcAmount.divn(2).toNumber()),
      ]);
    });

    it("Can create with native token source, even if maker-src-ata is missing", async () => {
      const srcAmount = new anchor.BN(10000);
      // create new escrow
      const orderConfig = state.orderConfig({
        srcMint: splToken.NATIVE_MINT,
        srcAssetIsNative: true,
        srcAmount,
        expirationTime: 0xffffffff,
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      await program.methods
        .create(orderConfig)
        .accountsPartial({
          maker: state.alice.keypair.publicKey,
          makerReceiver: orderConfig.receiver,
          srcMint: splToken.NATIVE_MINT,
          dstMint: state.tokens[1],
          protocolDstAcc: null,
          integratorDstAcc: null,
          escrow,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          makerSrcAta: null,
        })
        .signers([state.alice.keypair])
        .rpc();
    });

    it("Execute the trade with native tokens (SOL) as destination", async () => {
      const makerNativeTokenBalanceBefore =
        await provider.connection.getBalance(state.alice.keypair.publicKey);

      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          dstAssetIsNative: true,
          dstMint: splToken.NATIVE_MINT,
        },
      });

      await program.methods
        .fill(escrow.orderConfig, state.defaultSrcAmount)
        .accountsPartial(
          state.buildAccountsDataForFill({
            escrow: escrow.escrow,
            escrowSrcAta: escrow.ata,
            dstMint: splToken.NATIVE_MINT,
            makerDstAta: null,
            takerDstAta:
              state.bob.atas[splToken.NATIVE_MINT.toString()].address,
          })
        )
        .signers([state.bob.keypair])
        .rpc();

      const makerNativeTokenBalanceAfter = await provider.connection.getBalance(
        state.alice.keypair.publicKey
      );

      // check that native tokens were sent to maker
      expect(makerNativeTokenBalanceAfter).to.be.eq(
        makerNativeTokenBalanceBefore + state.defaultDstAmount.toNumber()
      );

      // Verify that the escrow account was closed
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);
    });

    it("Fails to execute the trade if maker_dst_acc is missing", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          dstMint: splToken.NATIVE_MINT,
        },
      });

      await expect(
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accounts(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              dstMint: splToken.NATIVE_MINT,
              makerDstAta: null,
              takerDstAta:
                state.bob.atas[splToken.NATIVE_MINT.toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: MissingMakerDstAta");
    });

    it("Fails to create if dst_asset_is_native = true but mint is different from native mint", async () => {
      const orderConfig = state.orderConfig({
        dstAssetIsNative: true,
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      await expect(
        program.methods
          .create(orderConfig)
          .accountsPartial({
            maker: state.alice.keypair.publicKey,
            makerReceiver: orderConfig.receiver,
            srcMint: state.tokens[0],
            dstMint: state.tokens[1],
            protocolDstAcc: null,
            integratorDstAcc: null,
            escrow: escrow,
            srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          })
          .signers([state.alice.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: InconsistentNativeDstTrait.");
    });

    it("Execute the trade and transfer wSOL if dst_asset_is_native = false and native dst mint is provided", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          dstMint: splToken.NATIVE_MINT,
          dstAssetIsNative: false,
        },
      });

      const transactionPromise = () =>
        program.methods
          .fill(escrow.orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              dstMint: splToken.NATIVE_MINT,
              makerDstAta:
                state.alice.atas[splToken.NATIVE_MINT.toString()].address,
              takerDstAta:
                state.bob.atas[splToken.NATIVE_MINT.toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc();

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[splToken.NATIVE_MINT.toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[splToken.NATIVE_MINT.toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, escrow.ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(state.defaultDstAmount.toNumber()),
        BigInt(state.defaultSrcAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
      ]);
    });
  });

  describe("Optional tests", () => {
    it("Doesn't execute the trade with the wrong maker's ata", async () => {
      await expect(
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              makerDstAta:
                state.charlie.atas[state.tokens[1].toString()].address,
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintTokenOwner");
    });

    it("Doesn't execute the trade with the wrong token", async () => {
      await expect(
        program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              srcMint: state.tokens[1],
            })
          )
          .signers([state.bob.keypair])
          .rpc()
      ).to.be.rejectedWith("Error Code: ConstraintSeeds");
    });
  });

  describe("Multiple escrows", () => {
    it("Double fill", async () => {
      const transactionPromise = async () => {
        await program.methods
          .fill(state.escrows[0].orderConfig, state.defaultSrcAmount)
          .accountsPartial(state.buildAccountsDataForFill({}))
          .signers([state.bob.keypair])
          .rpc();

        // Add Charlie to the whitelist
        await createWhitelistedAccount(
          whitelistProgram,
          state.charlie.keypair,
          payer
        );
        await program.methods
          .fill(state.escrows[1].orderConfig, state.defaultSrcAmount)
          .accountsPartial(
            state.buildAccountsDataForFill({
              taker: state.charlie.keypair.publicKey,
              escrow: state.escrows[1].escrow,
              escrowSrcAta: state.escrows[1].ata,
              takerSrcAta:
                state.charlie.atas[state.tokens[0].toString()].address,
              takerDstAta:
                state.charlie.atas[state.tokens[1].toString()].address,
            })
          )
          .signers([state.charlie.keypair])
          .rpc();

        // Remove Charlie from the whitelist
        await removeWhitelistedAccount(state.charlie.keypair, payer);
      };

      const results = await trackReceivedTokenAndTx(
        provider.connection,
        [
          state.alice.atas[state.tokens[1].toString()].address,
          state.bob.atas[state.tokens[0].toString()].address,
          state.bob.atas[state.tokens[1].toString()].address,
          state.charlie.atas[state.tokens[0].toString()].address,
          state.charlie.atas[state.tokens[1].toString()].address,
        ],
        transactionPromise
      );
      await expect(
        splToken.getAccount(provider.connection, state.escrows[0].ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);
      await expect(
        splToken.getAccount(provider.connection, state.escrows[1].ata)
      ).to.be.rejectedWith(splToken.TokenAccountNotFoundError);

      expect(results).to.be.deep.eq([
        BigInt(state.defaultDstAmount.toNumber()) * 2n,
        BigInt(state.defaultSrcAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
        BigInt(state.defaultSrcAmount.toNumber()),
        -BigInt(state.defaultDstAmount.toNumber()),
      ]);
    });
  });

  describe("Tests tx cost", () => {
    it("Print bumps", async () => {
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          expirationTime: 0xffffffff,
        },
      });

      const [, bump] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(escrow.orderConfig),
        ],
        program.programId
      );
      console.log("escrow bump", bump);

      const [, whitelistBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("resolver_access"),
          state.bob.keypair.publicKey.toBuffer(),
        ],
        whitelistProgram.programId
      );
      console.log("resolver access bump", whitelistBump);
    });

    it("Calculate and print tx cost", async () => {
      // create new escrow
      const orderConfig = state.orderConfig({
        expirationTime: 0xffffffff,
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      const escrowAta = await splToken.getAssociatedTokenAddress(
        orderConfig.srcMint,
        escrow,
        true,
        splToken.TOKEN_PROGRAM_ID
      );

      const txSignature = await program.methods
        .create(orderConfig)
        .accountsPartial({
          maker: state.alice.keypair.publicKey,
          makerReceiver: orderConfig.receiver,
          srcMint: state.tokens[0],
          dstMint: state.tokens[1],
          protocolDstAcc: null,
          integratorDstAcc: null,
          escrow,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([state.alice.keypair])
        .rpc();

      // create tx
      await printTxCosts("Create", txSignature, provider.connection);

      // fill tx
      const txFillSignature = await program.methods
        .fill(orderConfig, state.defaultSrcAmount)
        .accountsPartial(
          state.buildAccountsDataForFill({
            escrow,
            escrowSrcAta: escrowAta,
          })
        )
        .signers([state.bob.keypair])
        .rpc();

      await printTxCosts("Fill", txFillSignature, provider.connection);

      // cancel tx
      // re-create escrow with same id
      await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          id: orderConfig.id,
          expirationTime: 0xffffffff,
        },
      });

      const txCancelSignature = await program.methods
        .cancel(Array.from(calculateOrderHash(orderConfig)), false)
        .accountsPartial({
          maker: state.alice.keypair.publicKey,
          srcMint: state.tokens[0],
          escrow: escrow,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([state.alice.keypair])
        .rpc();

      await printTxCosts("Cancel", txCancelSignature, provider.connection);
    });

    it("Calculate and print tx cost (native src)", async () => {
      const srcAmount = new anchor.BN(10000);
      // create new escrow
      const orderConfig = state.orderConfig({
        srcMint: splToken.NATIVE_MINT,
        srcAssetIsNative: true,
        srcAmount,
        expirationTime: 0xffffffff,
      });

      const [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("escrow"),
          state.alice.keypair.publicKey.toBuffer(),
          calculateOrderHash(orderConfig),
        ],
        program.programId
      );

      const escrowAta = await splToken.getAssociatedTokenAddress(
        orderConfig.srcMint,
        escrow,
        true,
        splToken.TOKEN_PROGRAM_ID
      );

      const txSignature = await program.methods
        .create(orderConfig)
        .accountsPartial({
          maker: state.alice.keypair.publicKey,
          makerReceiver: orderConfig.receiver,
          srcMint: splToken.NATIVE_MINT,
          dstMint: state.tokens[1],
          protocolDstAcc: null,
          integratorDstAcc: null,
          escrow,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          makerSrcAta: null,
        })
        .signers([state.alice.keypair])
        .rpc();

      // create tx
      await printTxCosts("Native src create", txSignature, provider.connection);

      // fill tx
      const txFillSignature = await program.methods
        .fill(orderConfig, srcAmount)
        .accountsPartial(
          state.buildAccountsDataForFill({
            escrow,
            srcMint: splToken.NATIVE_MINT,
            takerSrcAta:
              state.bob.atas[splToken.NATIVE_MINT.toString()].address,
            escrowSrcAta: escrowAta,
          })
        )
        .signers([state.bob.keypair])
        .rpc();

      await printTxCosts(
        "Native src fill",
        txFillSignature,
        provider.connection
      );

      // cancel tx
      // re-create escrow with same id
      await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig,
      });

      const txCancelSignature = await program.methods
        .cancel(Array.from(calculateOrderHash(orderConfig)), false)
        .accountsPartial({
          maker: state.alice.keypair.publicKey,
          srcMint: splToken.NATIVE_MINT,
          escrow: escrow,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([state.alice.keypair])
        .rpc();

      await printTxCosts(
        "Native src cancel",
        txCancelSignature,
        provider.connection
      );
    });

    it("Calculate and print tx cost (lookup tables)", async () => {
      // create new escrow
      const escrow = await state.createEscrow({
        escrowProgram: program,
        payer,
        provider,
        orderConfig: {
          expirationTime: 0xffffffff,
        },
      });

      const fillInst = await program.methods
        .fill(escrow.orderConfig, state.defaultSrcAmount)
        .accountsPartial(
          state.buildAccountsDataForFill({
            escrow: escrow.escrow,
            escrowSrcAta: escrow.ata,
          })
        )
        .signers([state.bob.keypair])
        .instruction();

      const addressesList = fillInst.keys.map((acc) => acc.pubkey);
      const addresses = Array.from(new Set(addressesList));
      const { address: lookupTableAddress, txid } = await initializeLookupTable(
        state.bob.keypair,
        provider.connection,
        addresses
      );
      await printTxCosts("Deploy lookup (lookup)", txid, provider.connection);
      const lookupTableAccount = (
        await provider.connection.getAddressLookupTable(lookupTableAddress)
      ).value;
      const txFillSignature = await sendV0Transaction(
        provider.connection,
        state.bob.keypair,
        [fillInst],
        [lookupTableAccount]
      );

      await printTxCosts("Fill (lookup)", txFillSignature, provider.connection);
    });
  });
});
