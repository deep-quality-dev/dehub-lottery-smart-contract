const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  now,
  increaseTime,
  setBlockTime,
  generateTicketNumbers,
} = require("./utils/common");

describe("StandardLottery-claimable", () => {
  const DEHUB_PRICE = 50000 * 100000;
  const SIX_HOUR = 3600 * 6;

  let admin, operator, degrand, alpha, beta, gamma;
  let addrs;

  let lotteryStartTime, lotteryEndTime;

  beforeEach(async () => {
    [admin, operator, degrand, alpha, beta, gamma, ...addrs] =
      await ethers.getSigners();

    const DehubToken = await ethers.getContractFactory("MockERC20", admin);
    const DehubRandom = await ethers.getContractFactory(
      "MockDehubFixedRand",
      admin
    );
    const StandardLotteryV1 = await ethers.getContractFactory(
      "StandardLottery",
      admin
    );
    const StandardLotteryV2 = await ethers.getContractFactory(
      "StandardLotteryV2",
      admin
    );
    const SpecialLottery = await ethers.getContractFactory(
      "SpecialLottery",
      admin
    );

    this.dehubToken = await DehubToken.deploy(
      "Dehub",
      "$Dehub",
      BigNumber.from("1000000000000")
    );
    await this.dehubToken.deployed();
    this.dehubRandom = await DehubRandom.deploy();
    await this.dehubRandom.deployed();
    this.standardLotteryV1 = await upgrades.deployProxy(
      StandardLotteryV1,
      [this.dehubToken.address, this.dehubRandom.address],
      {
        kind: "uups",
        initializer: "__StandardLottery_init",
      }
    );
    await this.standardLotteryV1.deployed();
    this.standardLottery = await upgrades.upgradeProxy(
      this.standardLotteryV1.address,
      StandardLotteryV2
    );
    await this.standardLottery.upgradeToV2();
    this.specialLottery = await upgrades.deployProxy(
      SpecialLottery,
      [this.dehubToken.address, this.dehubRandom.address],
      {
        kind: "uups",
        initializer: "__SpecialLottery_init",
      }
    );
    await this.specialLottery.deployed();

    await this.dehubToken.transfer(
      alpha.address,
      BigNumber.from("100000000000")
    );
    await this.dehubToken.transfer(
      beta.address,
      BigNumber.from("100000000000")
    );
    await this.dehubToken.transfer(
      gamma.address,
      BigNumber.from("100000000000")
    );

    /// Initialize Lottery
    // Set operator address
    await this.standardLottery.setOperatorAddress(operator.address);
    // Set DeGrand address
    await this.standardLottery.setDeGrandAddress(degrand.address);
    // Set team address
    await this.standardLottery.setTeamWallet(operator.address);
    // Set breakdown percent
    await this.standardLottery.setBreakdownPercent(
      5000, // DeLotto pot
      3000, // DeGrand pot
      1000, // Team Wallet
      1000 // Burn
    );

    /// Start Lottery
    lotteryStartTime = await now();
    lotteryEndTime = lotteryStartTime + SIX_HOUR;
    await this.standardLottery.connect(operator).startLottery(
      lotteryEndTime, // lottery endtime
      DEHUB_PRICE, // price in $Dehub
      [0, 1000, 2500, 10000] // [zero, Bronze, Silver, Gold] breakdown
    );
  });

  it("buy/close/draw/claim tickets-bronze prize", async () => {
    const lotteryId = await this.standardLottery.viewCurrentTaskId();

    /// Buy ticket
    const alphaTickets = [102070406, 115030105, 101140803, 106150208];
    await this.dehubToken
      .connect(alpha)
      .approve(this.standardLottery.address, DEHUB_PRICE * alphaTickets.length);
    await this.standardLottery.connect(alpha).buyTickets(
      lotteryId,
      alphaTickets.length, // purchased ticket count
      alphaTickets
    );

    const deLottoAmount = (DEHUB_PRICE * alphaTickets.length) / 2; // 50%	Towards	DeLotto	pot

    /// Close Lottery
    await setBlockTime(lotteryEndTime);
    await this.standardLottery.connect(operator).closeLottery(lotteryId);

    /// Set random result manually to match with tickets.
    // Let us make a silver prize for third ticket.
    const randomResult = 102140702; // considering _wrappingFinalNumber()
    await this.dehubRandom.setRandomResult(randomResult);
    expect(
      await this.dehubRandom.viewRandomResult256(this.standardLottery.address)
    ).to.equal(randomResult);

    /// Draw lottery
    await this.standardLottery.connect(operator).drawFinalNumber(lotteryId);

    const userInfo = await this.standardLottery
      .connect(alpha)
      .viewUserInfoForLotteryId(alpha.address, lotteryId, 0, 100);

    /// Check rewards
    const ticketId = userInfo[0][2]; // third ticket id
    const bracket = 1; // already matched 2 numbers
    const rewards = await this.standardLottery.viewRewardsForTicketId(
      lotteryId,
      ticketId,
      bracket
    );
    expect(rewards).to.equal((deLottoAmount * 1000) / 10000); // bronze percent

    /// Claim tickets
    const bracketIds = new Array(userInfo[0].length).fill(0);
    await this.standardLottery
      .connect(alpha)
      .claimTickets(lotteryId, userInfo[0], bracketIds);

    // Check if there are not claimable tickets
    const userInfoAfterClaim = await this.standardLottery
      .connect(alpha)
      .viewUserInfoForLotteryId(alpha.address, lotteryId, 0, 100);
    let unclaimed = 0;
    userInfoAfterClaim[2].forEach((claimed) => (unclaimed |= !claimed));
    expect(unclaimed).to.equal(0);
  });

  it("buy/close/draw/claim tickets-silver prize", async () => {
    const lotteryId = await this.standardLottery.viewCurrentTaskId();

    /// Buy ticket
    const alphaTickets = [102070406, 115030803, 101140803, 106150208];
    await this.dehubToken
      .connect(alpha)
      .approve(this.standardLottery.address, DEHUB_PRICE * alphaTickets.length);
    await this.standardLottery.connect(alpha).buyTickets(
      lotteryId,
      alphaTickets.length, // purchased ticket count
      alphaTickets
    );

    const deLottoAmount = (DEHUB_PRICE * alphaTickets.length) / 2; // 50%	Towards	DeLotto	pot

    /// Close Lottery
    await setBlockTime(lotteryEndTime);
    await this.standardLottery.connect(operator).closeLottery(lotteryId);

    /// Set random result manually to match with tickets.
    // Let us make a silver prize for third ticket.
    const randomResult = 102130702; // considering _wrappingFinalNumber()
    await this.dehubRandom.setRandomResult(randomResult);
    expect(
      await this.dehubRandom.viewRandomResult256(this.standardLottery.address)
    ).to.equal(randomResult);

    /// Draw lottery
    await this.standardLottery.connect(operator).drawFinalNumber(lotteryId);

    const userInfo = await this.standardLottery
      .connect(alpha)
      .viewUserInfoForLotteryId(alpha.address, lotteryId, 0, 100);

    /// Check rewards
    // Check rewards of double matched number
    const ticketId2 = userInfo[0][1]; // second ticket id
    const bracket2 = 1;
    const rewards2 = await this.standardLottery.viewRewardsForTicketId(
      lotteryId,
      ticketId2,
      bracket2
    );
    expect(rewards2).to.equal(0); // silver percent

    // Check rewards of triple matched number
    const ticketId3 = userInfo[0][2]; // third ticket id
    const bracket3 = 2;
    const rewards3 = await this.standardLottery.viewRewardsForTicketId(
      lotteryId,
      ticketId3,
      bracket3
    );
    expect(rewards3).to.equal((deLottoAmount * 2500) / 10000); // silver percent

    /// Claim tickets
    const bracketIds = new Array(userInfo[0].length).fill(0);
    await this.standardLottery
      .connect(alpha)
      .claimTickets(lotteryId, userInfo[0], bracketIds);

    // Check if there are not claimable tickets
    const userInfoAfterClaim = await this.standardLottery
      .connect(alpha)
      .viewUserInfoForLotteryId(alpha.address, lotteryId, 0, 100);
    let unclaimed = 0;
    userInfoAfterClaim[2].forEach((claimed) => (unclaimed |= !claimed));
    expect(unclaimed).to.equal(0);
  });

  it("buy/close/draw/claim tickets-gold prize", async () => {
    const lotteryId = await this.standardLottery.viewCurrentTaskId();

    /// Buy ticket
    const alphaTickets = [102070406, 115030803, 101140803, 106140803];
    await this.dehubToken
      .connect(alpha)
      .approve(this.standardLottery.address, DEHUB_PRICE * alphaTickets.length);
    await this.standardLottery.connect(alpha).buyTickets(
      lotteryId,
      alphaTickets.length, // purchased ticket count
      alphaTickets
    );

    const deLottoAmount = (DEHUB_PRICE * alphaTickets.length) / 2; // 50%	Towards	DeLotto	pot

    /// Close Lottery
    await setBlockTime(lotteryEndTime);
    await this.standardLottery.connect(operator).closeLottery(lotteryId);

    /// Set random result manually to match with tickets.
    // Let us make a silver prize for third ticket.
    const randomResult = 105130702; // considering _wrappingFinalNumber()
    await this.dehubRandom.setRandomResult(randomResult);
    expect(
      await this.dehubRandom.viewRandomResult256(this.standardLottery.address)
    ).to.equal(randomResult);

    /// Draw lottery
    await this.standardLottery.connect(operator).drawFinalNumber(lotteryId);

    const userInfo = await this.standardLottery
      .connect(alpha)
      .viewUserInfoForLotteryId(alpha.address, lotteryId, 0, 100);

    /// Check rewards
    // Check rewards of double matched number
    const ticketId4 = userInfo[0][3]; // forth ticket id
    const bracket4 = 3;
    const rewards4 = await this.standardLottery.viewRewardsForTicketId(
      lotteryId,
      ticketId4,
      bracket4
    );
    expect(rewards4).to.equal(deLottoAmount); // gold percent

    /// Claim tickets
    const bracketIds = new Array(userInfo[0].length).fill(0);
    await this.standardLottery
      .connect(alpha)
      .claimTickets(lotteryId, userInfo[0], bracketIds);

    // Check if there are not claimable tickets
    const userInfoAfterClaim = await this.standardLottery
      .connect(alpha)
      .viewUserInfoForLotteryId(alpha.address, lotteryId, 0, 100);
    let unclaimed = 0;
    userInfoAfterClaim[2].forEach((claimed) => (unclaimed |= !claimed));
    expect(unclaimed).to.equal(0);
  });

  it("buy/close/draw/claim tickets-double gold prize", async () => {
    const lotteryId = await this.standardLottery.viewCurrentTaskId();

    /// Buy ticket
    const alphaTickets = [
      102070406, 115030803, 101140803, 106140803, 106140803,
    ];
    await this.dehubToken
      .connect(alpha)
      .approve(this.standardLottery.address, DEHUB_PRICE * alphaTickets.length);
    await this.standardLottery.connect(alpha).buyTickets(
      lotteryId,
      alphaTickets.length, // purchased ticket count
      alphaTickets
    );

    const deLottoAmount = (DEHUB_PRICE * alphaTickets.length) / 2; // 50%	Towards	DeLotto	pot

    /// Close Lottery
    await setBlockTime(lotteryEndTime);
    await this.standardLottery.connect(operator).closeLottery(lotteryId);

    /// Set random result manually to match with tickets.
    // Let us make a silver prize for third ticket.
    const randomResult = 105130702; // considering _wrappingFinalNumber()
    await this.dehubRandom.setRandomResult(randomResult);
    expect(
      await this.dehubRandom.viewRandomResult256(this.standardLottery.address)
    ).to.equal(randomResult);

    /// Draw lottery
    await this.standardLottery.connect(operator).drawFinalNumber(lotteryId);

    const userInfo = await this.standardLottery
      .connect(alpha)
      .viewUserInfoForLotteryId(alpha.address, lotteryId, 0, 100);

    /// Check rewards
    // Check rewards of double matched number
    const ticketId4 = userInfo[0][3]; // forth ticket id
    const bracket4 = 3;
    const rewards4 = await this.standardLottery.viewRewardsForTicketId(
      lotteryId,
      ticketId4,
      bracket4
    );
    expect(rewards4).to.equal(deLottoAmount / 2); // gold percent

    /// Claim tickets
    const bracketIds = new Array(userInfo[0].length).fill(0);
    await this.standardLottery
      .connect(alpha)
      .claimTickets(lotteryId, userInfo[0], bracketIds);

    // Check if there are not claimable tickets
    const userInfoAfterClaim = await this.standardLottery
      .connect(alpha)
      .viewUserInfoForLotteryId(alpha.address, lotteryId, 0, 100);
    let unclaimed = 0;
    userInfoAfterClaim[2].forEach((claimed) => (unclaimed |= !claimed));
    expect(unclaimed).to.equal(0);
  });
});
