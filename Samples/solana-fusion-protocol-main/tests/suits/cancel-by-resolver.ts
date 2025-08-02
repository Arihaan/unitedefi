import * as anchor from "@coral-xyz/anchor";
import * as splToken from "@solana/spl-token";
import { BankrunProvider } from "anchor-bankrun";
import { BanksClient, ProgramTestContext } from "solana-bankrun";
import { FusionSwap } from "../../target/types/fusion_swap";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  TestState,
  setCurrentTime,
  trackReceivedTokenAndTx,
} from "../utils/utils";

const FusionSwapIDL = require("../../target/idl/fusion_swap.json");
chai.use(chaiAsPromised);

describe("Cancel by Resolver", () => {
  const defaultSrcAmount = new anchor.BN(1000000);
  const defaultMaxCancellationPremium = defaultSrcAmount
    .muln(50 * 100)
    .divn(100 * 100); // 50% from the srcAmount
  const defaultRewardLimit = defaultMaxCancellationPremium;
  let provider: BankrunProvider;
  let banksClient: BanksClient;
  let context: ProgramTestContext;
  let state: TestState;
  let program: anchor.Program<FusionSwap>;
  let payer: anchor.web3.Keypair;
  let tokenAccountRent: number;

  const order = {
    createTime: 0, // We update it before each test
    auctionDuration: 32000,
  };

  before(async () => {
    const usersKeypairs = [];
    for (let i = 0; i < 4; i++) {
      usersKeypairs.push(anchor.web3.Keypair.generate());
    }
    context = await TestState.bankrunContext(usersKeypairs);
    provider = new BankrunProvider(context);
    anchor.setProvider(provider);
    banksClient = context.banksClient;
    payer = context.payer;

    program = new anchor.Program<FusionSwap>(FusionSwapIDL, provider);

    state = await TestState.bankrunCreate(context, payer, usersKeypairs, {
      tokensNums: 3,
    });
    tokenAccountRent =
      await provider.connection.getMinimumBalanceForRentExemption(
        splToken.AccountLayout.span
      );
  });

  beforeEach(async () => {
    order.createTime = Math.floor(new Date().getTime() / 1000);
    // Rollback clock to the current time after tests that move time forward when order already expired
    await setCurrentTime(context, order.createTime);
  });

  it("Resolver can cancel the order for free at the beginning of the auction", async () => {
    const escrow = await state.createEscrow({
      escrowProgram: program,
      payer,
      provider: banksClient,
      orderConfig: state.orderConfig({
        srcAmount: defaultSrcAmount,
        dutchAuctionData: undefined,
        fee: {
          maxCancellationPremium: defaultMaxCancellationPremium,
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
        },
        cancellationAuctionDuration: order.auctionDuration,
      }),
    });

    const makerNativeBalanceBefore = (
      await provider.connection.getAccountInfo(state.alice.keypair.publicKey)
    ).lamports;
    const resolverNativeBalanceBefore = (
      await provider.connection.getAccountInfo(state.bob.keypair.publicKey)
    ).lamports;

    // Rewind time to expire the order
    await setCurrentTime(context, state.defaultExpirationTime);

    const transactionPromise = () =>
      program.methods
        .cancelByResolver(escrow.orderConfig, defaultRewardLimit)
        .accountsPartial({
          resolver: state.bob.keypair.publicKey,
          maker: state.alice.keypair.publicKey,
          makerReceiver: escrow.orderConfig.receiver,
          srcMint: escrow.orderConfig.srcMint,
          dstMint: escrow.orderConfig.dstMint,
          escrow: escrow.escrow,
          escrowSrcAta: escrow.ata,
          protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
          integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([payer, state.bob.keypair])
        .rpc();

    const results = await trackReceivedTokenAndTx(
      provider.connection,
      [
        state.alice.atas[state.tokens[0].toString()].address,
        state.bob.atas[state.tokens[0].toString()].address,
      ],
      transactionPromise
    );

    expect(
      (await provider.connection.getAccountInfo(state.alice.keypair.publicKey))
        .lamports
    ).to.be.eq(makerNativeBalanceBefore + tokenAccountRent);
    expect(
      (await provider.connection.getAccountInfo(state.bob.keypair.publicKey))
        .lamports
    ).to.be.eq(resolverNativeBalanceBefore);

    expect(results).to.be.deep.eq([
      BigInt(defaultSrcAmount.toNumber()),
      BigInt(0),
    ]);
  });

  it("Resolver cannot cancel the order involving spl-tokens without providing maker-src-ata", async () => {
    const escrow = await state.createEscrow({
      escrowProgram: program,
      payer,
      provider: banksClient,
      orderConfig: state.orderConfig({
        srcAmount: defaultSrcAmount,
        fee: {
          maxCancellationPremium: defaultMaxCancellationPremium,
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
        },
        cancellationAuctionDuration: order.auctionDuration,
      }),
    });

    // Rewind time to expire the order
    await setCurrentTime(context, state.defaultExpirationTime);

    expect(
      program.methods
        .cancelByResolver(escrow.orderConfig, defaultRewardLimit)
        .accountsPartial({
          resolver: state.bob.keypair.publicKey,
          maker: state.alice.keypair.publicKey,
          makerReceiver: escrow.orderConfig.receiver,
          srcMint: escrow.orderConfig.srcMint,
          dstMint: escrow.orderConfig.dstMint,
          escrow: escrow.escrow,
          escrowSrcAta: escrow.ata,
          protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
          integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          makerSrcAta: null,
        })
        .signers([payer, state.bob.keypair])
        .rpc()
    ).to.be.rejectedWith("Error Code: MissingMakerSrcAta");
  });

  it("Resolver can cancel the order at different points in the order time frame", async () => {
    const cancellationPoints = [10, 25, 50, 100].map(
      (percentage) =>
        state.defaultExpirationTime +
        (order.auctionDuration * (percentage * 100)) / (100 * 100)
    );
    for (const cancellationPoint of cancellationPoints) {
      const maxCancellationPremiums = [1, 2.5, 7.5].map(
        (percentage) => (tokenAccountRent * (percentage * 100)) / (100 * 100)
      );
      for (const maxCancellationPremium of maxCancellationPremiums) {
        await setCurrentTime(context, order.createTime);
        const escrow = await state.createEscrow({
          escrowProgram: program,
          payer,
          provider: banksClient,
          orderConfig: state.orderConfig({
            srcAmount: defaultSrcAmount,
            fee: {
              maxCancellationPremium: new anchor.BN(maxCancellationPremium),
              protocolDstAcc: undefined,
              integratorDstAcc: undefined,
              protocolFee: undefined,
              integratorFee: undefined,
              surplusPercentage: undefined,
            },
            cancellationAuctionDuration: order.auctionDuration,
          }),
        });

        const makerNativeBalanceBefore = (
          await provider.connection.getAccountInfo(
            state.alice.keypair.publicKey
          )
        ).lamports;
        const resolverNativeBalanceBefore = (
          await provider.connection.getAccountInfo(state.bob.keypair.publicKey)
        ).lamports;

        await setCurrentTime(context, cancellationPoint);

        const timeElapsed = cancellationPoint - state.defaultExpirationTime;
        const resolverPremium = Math.floor(
          (maxCancellationPremium * timeElapsed) / order.auctionDuration
        );

        const transactionPromise = () =>
          program.methods
            .cancelByResolver(escrow.orderConfig, defaultRewardLimit)
            .accountsPartial({
              resolver: state.bob.keypair.publicKey,
              maker: state.alice.keypair.publicKey,
              makerReceiver: escrow.orderConfig.receiver,
              srcMint: escrow.orderConfig.srcMint,
              dstMint: escrow.orderConfig.dstMint,
              escrow: escrow.escrow,
              escrowSrcAta: escrow.ata,
              protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
              integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
              srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
            })
            .signers([payer, state.bob.keypair])
            .rpc();

        const results = await trackReceivedTokenAndTx(
          provider.connection,
          [
            state.alice.atas[state.tokens[0].toString()].address,
            state.bob.atas[state.tokens[0].toString()].address,
          ],
          transactionPromise
        );

        expect(
          (
            await provider.connection.getAccountInfo(
              state.alice.keypair.publicKey
            )
          ).lamports
        ).to.be.eq(
          makerNativeBalanceBefore + tokenAccountRent - resolverPremium
        );
        expect(
          (
            await provider.connection.getAccountInfo(
              state.bob.keypair.publicKey
            )
          ).lamports
        ).to.be.eq(resolverNativeBalanceBefore + resolverPremium);

        expect(results).to.be.deep.eq([
          BigInt(defaultSrcAmount.toNumber()),
          BigInt(0),
        ]);
      }
    }
  });

  it("Resolver can cancel the order after auction", async () => {
    const escrow = await state.createEscrow({
      escrowProgram: program,
      payer,
      provider: banksClient,
      orderConfig: state.orderConfig({
        srcAmount: defaultSrcAmount,
        fee: {
          maxCancellationPremium: defaultMaxCancellationPremium,
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
        },
        cancellationAuctionDuration: order.auctionDuration,
      }),
    });

    const makerNativeBalanceBefore = (
      await provider.connection.getAccountInfo(state.alice.keypair.publicKey)
    ).lamports;
    const resolverNativeBalanceBefore = (
      await provider.connection.getAccountInfo(state.bob.keypair.publicKey)
    ).lamports;

    await setCurrentTime(
      context,
      state.defaultExpirationTime + order.auctionDuration + 1
    );

    const transactionPromise = () =>
      program.methods
        .cancelByResolver(escrow.orderConfig, defaultRewardLimit)
        .accountsPartial({
          resolver: state.bob.keypair.publicKey,
          maker: state.alice.keypair.publicKey,
          makerReceiver: escrow.orderConfig.receiver,
          srcMint: escrow.orderConfig.srcMint,
          dstMint: escrow.orderConfig.dstMint,
          escrow: escrow.escrow,
          escrowSrcAta: escrow.ata,
          protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
          integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([payer, state.bob.keypair])
        .rpc({ skipPreflight: true });

    const results = await trackReceivedTokenAndTx(
      provider.connection,
      [
        state.alice.atas[state.tokens[0].toString()].address,
        state.bob.atas[state.tokens[0].toString()].address,
      ],
      transactionPromise
    );

    const resolverPremium = defaultMaxCancellationPremium.toNumber();

    expect(
      (await provider.connection.getAccountInfo(state.alice.keypair.publicKey))
        .lamports
    ).to.be.eq(makerNativeBalanceBefore + tokenAccountRent - resolverPremium);
    expect(
      (await provider.connection.getAccountInfo(state.bob.keypair.publicKey))
        .lamports
    ).to.be.eq(resolverNativeBalanceBefore + resolverPremium);

    expect(results).to.be.deep.eq([
      BigInt(defaultSrcAmount.toNumber()),
      BigInt(0),
    ]);
  });

  it("Resolver can get reward less than auction calculated", async () => {
    const escrow = await state.createEscrow({
      escrowProgram: program,
      payer,
      provider: banksClient,
      orderConfig: state.orderConfig({
        srcAmount: defaultSrcAmount,
        fee: {
          maxCancellationPremium: defaultMaxCancellationPremium,
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
        },
        cancellationAuctionDuration: order.auctionDuration,
      }),
    });
    const resolverPremium = new anchor.BN(1);

    const makerNativeBalanceBefore = (
      await provider.connection.getAccountInfo(state.alice.keypair.publicKey)
    ).lamports;
    const resolverNativeBalanceBefore = (
      await provider.connection.getAccountInfo(state.bob.keypair.publicKey)
    ).lamports;

    await setCurrentTime(
      context,
      state.defaultExpirationTime + order.auctionDuration + 1
    );

    const transactionPromise = () =>
      program.methods
        .cancelByResolver(escrow.orderConfig, resolverPremium)
        .accountsPartial({
          resolver: state.bob.keypair.publicKey,
          maker: state.alice.keypair.publicKey,
          makerReceiver: escrow.orderConfig.receiver,
          srcMint: escrow.orderConfig.srcMint,
          dstMint: escrow.orderConfig.dstMint,
          escrow: escrow.escrow,
          escrowSrcAta: escrow.ata,
          protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
          integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([payer, state.bob.keypair])
        .rpc({ skipPreflight: true });

    const results = await trackReceivedTokenAndTx(
      provider.connection,
      [
        state.alice.atas[state.tokens[0].toString()].address,
        state.bob.atas[state.tokens[0].toString()].address,
      ],
      transactionPromise
    );

    expect(
      (await provider.connection.getAccountInfo(state.alice.keypair.publicKey))
        .lamports
    ).to.be.eq(
      makerNativeBalanceBefore + tokenAccountRent - resolverPremium.toNumber()
    );
    expect(
      (await provider.connection.getAccountInfo(state.bob.keypair.publicKey))
        .lamports
    ).to.be.eq(resolverNativeBalanceBefore + resolverPremium.toNumber());

    expect(results).to.be.deep.eq([
      BigInt(defaultSrcAmount.toNumber()),
      BigInt(0),
    ]);
  });

  it("Maker recives native tokens if order was created with native src assets", async () => {
    const amount = new anchor.BN(10000);
    const escrow = await state.createEscrow({
      escrowProgram: program,
      payer,
      provider: banksClient,
      orderConfig: state.orderConfig({
        srcMint: splToken.NATIVE_MINT,
        srcAssetIsNative: true,
        srcAmount: amount,
        fee: {
          maxCancellationPremium: defaultMaxCancellationPremium,
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
        },
        cancellationAuctionDuration: order.auctionDuration,
      }),
    });

    const makerNativeBalanceBefore = (
      await provider.connection.getAccountInfo(state.alice.keypair.publicKey)
    ).lamports;
    const resolverNativeBalanceBefore = (
      await provider.connection.getAccountInfo(state.bob.keypair.publicKey)
    ).lamports;

    // Rewind time to expire the order
    await setCurrentTime(context, state.defaultExpirationTime);

    const transactionPromise = () =>
      program.methods
        .cancelByResolver(escrow.orderConfig, new anchor.BN(0))
        .accountsPartial({
          resolver: state.bob.keypair.publicKey,
          maker: state.alice.keypair.publicKey,
          makerReceiver: escrow.orderConfig.receiver,
          srcMint: escrow.orderConfig.srcMint,
          dstMint: escrow.orderConfig.dstMint,
          escrow: escrow.escrow,
          escrowSrcAta: escrow.ata,
          protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
          integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
          makerSrcAta: null,
        })
        .signers([payer, state.bob.keypair])
        .rpc();

    const results = await trackReceivedTokenAndTx(
      provider.connection,
      [
        state.alice.atas[state.tokens[0].toString()].address,
        state.bob.atas[state.tokens[0].toString()].address,
      ],
      transactionPromise
    );

    expect(
      (await provider.connection.getAccountInfo(state.alice.keypair.publicKey))
        .lamports
    ).to.be.eq(makerNativeBalanceBefore + amount.toNumber() + tokenAccountRent);
    expect(
      (await provider.connection.getAccountInfo(state.bob.keypair.publicKey))
        .lamports
    ).to.be.eq(resolverNativeBalanceBefore);

    expect(results).to.be.deep.eq([BigInt(0), BigInt(0)]);
  });

  it("Cancel works without maker-src-ata if order was created with native src assets", async () => {
    const amount = new anchor.BN(10000);
    const escrow = await state.createEscrow({
      escrowProgram: program,
      payer,
      provider: banksClient,
      orderConfig: state.orderConfig({
        srcMint: splToken.NATIVE_MINT,
        srcAssetIsNative: true,
        srcAmount: amount,
        fee: {
          maxCancellationPremium: defaultMaxCancellationPremium,
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
        },
        cancellationAuctionDuration: order.auctionDuration,
      }),
    });

    // Rewind time to expire the order
    await setCurrentTime(context, state.defaultExpirationTime);

    await program.methods
      .cancelByResolver(escrow.orderConfig, new anchor.BN(0))
      .accountsPartial({
        resolver: state.bob.keypair.publicKey,
        maker: state.alice.keypair.publicKey,
        makerReceiver: escrow.orderConfig.receiver,
        srcMint: escrow.orderConfig.srcMint,
        dstMint: escrow.orderConfig.dstMint,
        escrow: escrow.escrow,
        escrowSrcAta: escrow.ata,
        protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
        integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
        srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        makerSrcAta: null,
      })
      .signers([payer, state.bob.keypair])
      .rpc();
  });

  it("Cancel does not work with maker-src-ata if order was created with native src assets", async () => {
    const amount = new anchor.BN(10000);
    const escrow = await state.createEscrow({
      escrowProgram: program,
      payer,
      provider: banksClient,
      orderConfig: state.orderConfig({
        srcMint: splToken.NATIVE_MINT,
        srcAssetIsNative: true,
        srcAmount: amount,
        fee: {
          maxCancellationPremium: defaultMaxCancellationPremium,
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
        },
        cancellationAuctionDuration: order.auctionDuration,
      }),
    });

    // Rewind time to expire the order
    await setCurrentTime(context, state.defaultExpirationTime);

    await expect(
      program.methods
        .cancelByResolver(escrow.orderConfig, new anchor.BN(0))
        .accountsPartial({
          resolver: state.bob.keypair.publicKey,
          maker: state.alice.keypair.publicKey,
          makerReceiver: escrow.orderConfig.receiver,
          srcMint: escrow.orderConfig.srcMint,
          dstMint: escrow.orderConfig.dstMint,
          escrow: escrow.escrow,
          escrowSrcAta: escrow.ata,
          protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
          integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([payer, state.bob.keypair])
        .rpc()
    ).to.be.rejectedWith("Error Code: InconsistentNativeSrcTrait");
  });

  it("Resolver can't cancel if the order has not expired", async () => {
    const escrow = await state.createEscrow({
      escrowProgram: program,
      payer,
      provider: banksClient,
      orderConfig: state.orderConfig({
        fee: {
          maxCancellationPremium: defaultMaxCancellationPremium,
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
        },
        cancellationAuctionDuration: order.auctionDuration,
      }),
    });

    await expect(
      program.methods
        .cancelByResolver(escrow.orderConfig, defaultRewardLimit)
        .accountsPartial({
          resolver: state.bob.keypair.publicKey,
          maker: state.alice.keypair.publicKey,
          makerReceiver: escrow.orderConfig.receiver,
          srcMint: escrow.orderConfig.srcMint,
          dstMint: escrow.orderConfig.dstMint,
          escrow: escrow.escrow,
          escrowSrcAta: escrow.ata,
          protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
          integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([state.bob.keypair])
        .rpc()
    ).to.be.rejectedWith("Error Code: OrderNotExpired");
  });

  it("Resolver can't cancel if the caller is not a whitelisted resolver", async () => {
    const escrow = await state.createEscrow({
      escrowProgram: program,
      payer,
      provider: banksClient,
      orderConfig: state.orderConfig({
        fee: {
          maxCancellationPremium: defaultMaxCancellationPremium,
          protocolDstAcc: undefined,
          integratorDstAcc: undefined,
          protocolFee: undefined,
          integratorFee: undefined,
          surplusPercentage: undefined,
        },
        cancellationAuctionDuration: order.auctionDuration,
      }),
    });

    await setCurrentTime(context, state.defaultExpirationTime + 1);
    await expect(
      program.methods
        .cancelByResolver(escrow.orderConfig, defaultRewardLimit)
        .accountsPartial({
          resolver: state.charlie.keypair.publicKey,
          maker: state.alice.keypair.publicKey,
          makerReceiver: escrow.orderConfig.receiver,
          srcMint: escrow.orderConfig.srcMint,
          dstMint: escrow.orderConfig.dstMint,
          escrow: escrow.escrow,
          escrowSrcAta: escrow.ata,
          protocolDstAcc: escrow.orderConfig.fee.protocolDstAcc,
          integratorDstAcc: escrow.orderConfig.fee.integratorDstAcc,
          srcTokenProgram: splToken.TOKEN_PROGRAM_ID,
        })
        .signers([state.charlie.keypair])
        .rpc()
    ).to.be.rejectedWith(
      "AnchorError caused by account: resolver_access. Error Code: AccountNotInitialized"
    );
  });

  it("Maker can't create an escrow if the fee is greater than lamports balance", async () => {
    await expect(
      state.createEscrow({
        escrowProgram: program,
        payer,
        provider: banksClient,
        orderConfig: state.orderConfig({
          fee: {
            maxCancellationPremium: new anchor.BN(tokenAccountRent + 1),
            protocolDstAcc: undefined,
            integratorDstAcc: undefined,
            protocolFee: undefined,
            integratorFee: undefined,
            surplusPercentage: undefined,
          },
          cancellationAuctionDuration: order.auctionDuration,
        }),
      })
    ).to.be.rejectedWith("Error Code: InvalidCancellationFee");
  });
});
