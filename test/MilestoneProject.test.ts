import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { ContractTransactionResponse } from "ethers";

const DAY = 24n * 60n * 60n;

const ProjectStatus = { Setup: 0n, Active: 1n, Stopped: 2n, Completed: 3n };
const MilestoneStatus = { Unfunded: 0n, Funded: 1n, Delivered: 2n, Paid: 3n, Returned: 4n };

async function gasCost(tx: ContractTransactionResponse): Promise<bigint> {
  const receipt = await tx.wait();
  return receipt!.gasUsed * receipt!.gasPrice;
}

describe("MilestoneProject", function () {
  async function ethProjectFixture() {
    const [developer, client, thirdParty] = await ethers.getSigners();
    const deposit = ethers.parseEther("0.5");
    const amounts = [ethers.parseEther("1"), ethers.parseEther("1"), ethers.parseEther("1")];
    const windows = [2n * DAY, 5n * DAY, 7n * DAY];

    const MilestoneProject = await ethers.getContractFactory("MilestoneProject");
    const project = await MilestoneProject.deploy(
      developer.address,
      client.address,
      ethers.ZeroAddress,
      deposit,
      amounts,
      windows
    );

    return { project, developer, client, thirdParty, deposit, amounts, windows };
  }

  async function startedEthProjectFixture() {
    const f = await ethProjectFixture();
    await f.project
      .connect(f.client)
      .startLock(f.deposit, f.amounts[0], f.windows[0], { value: f.deposit + f.amounts[0] });
    return f;
  }

  async function deliveredEthProjectFixture() {
    const f = await startedEthProjectFixture();
    await f.project.connect(f.developer).markDelivered(0);
    const m = await f.project.getMilestone(0);
    const reviewEnd = m.deliveredAt + m.reviewWindow;
    return { ...f, reviewEnd };
  }

  async function singleMilestoneFixture() {
    const [developer, client, thirdParty] = await ethers.getSigners();
    const deposit = ethers.parseEther("0.1");
    const amount = ethers.parseEther("1");
    const window = 3n * DAY;
    const MilestoneProject = await ethers.getContractFactory("MilestoneProject");
    const project = await MilestoneProject.deploy(
      developer.address,
      client.address,
      ethers.ZeroAddress,
      deposit,
      [amount],
      [window]
    );
    await project.connect(client).startLock(deposit, amount, window, { value: deposit + amount });
    await project.connect(developer).markDelivered(0);
    const m = await project.getMilestone(0);
    return { project, developer, client, thirdParty, amount, reviewEnd: m.deliveredAt + m.reviewWindow };
  }

  async function tokenProjectFixture() {
    const [developer, client, thirdParty] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock USDC", "USDC", 6);
    const deposit = 500_000n;
    const amounts = [1_000_000n, 2_000_000n];
    const windows = [2n * DAY, 2n * DAY];
    const MilestoneProject = await ethers.getContractFactory("MilestoneProject");
    const project = await MilestoneProject.deploy(
      developer.address,
      client.address,
      await token.getAddress(),
      deposit,
      amounts,
      windows
    );
    await token.mint(client.address, 10_000_000n);
    await token.connect(client).approve(await project.getAddress(), deposit + amounts[0]);
    return { project, token, developer, client, thirdParty, deposit, amounts, windows };
  }

  describe("Setup terms", function () {
    it("stores each amount and window as given (AE7, AE10)", async function () {
      const { project, developer, client, deposit, amounts, windows } = await loadFixture(ethProjectFixture);

      expect(await project.developer()).to.equal(developer.address);
      expect(await project.client()).to.equal(client.address);
      expect(await project.asset()).to.equal(ethers.ZeroAddress);
      expect(await project.deposit()).to.equal(deposit);
      expect(await project.milestoneCount()).to.equal(3n);
      expect(await project.status()).to.equal(ProjectStatus.Setup);
      for (let i = 0; i < 3; i++) {
        const m = await project.getMilestone(i);
        expect(m.amount).to.equal(amounts[i]);
        expect(m.reviewWindow).to.equal(windows[i]);
        expect(m.status).to.equal(MilestoneStatus.Unfunded);
        expect(m.deliveredAt).to.equal(0n);
      }
    });

    it("accepts unequal amounts, including a later milestone larger than the previous one (AE6)", async function () {
      const [developer, client] = await ethers.getSigners();
      const amounts = [ethers.parseEther("1"), ethers.parseEther("3"), ethers.parseEther("2")];
      const MilestoneProject = await ethers.getContractFactory("MilestoneProject");
      const project = await MilestoneProject.deploy(
        developer.address,
        client.address,
        ethers.ZeroAddress,
        ethers.parseEther("0.1"),
        amounts,
        [DAY, DAY, DAY]
      );

      for (let i = 0; i < 3; i++) {
        expect((await project.getMilestone(i)).amount).to.equal(amounts[i]);
      }
      await project.connect(client).editMilestone(2, ethers.parseEther("5"), DAY, await project.termsVersion());
      expect((await project.getMilestone(2)).amount).to.equal(ethers.parseEther("5"));
    });

    it("returns the project summary in one call", async function () {
      const { project, developer, client, deposit } = await loadFixture(ethProjectFixture);
      const s = await project.getSummary();
      expect(s.developer).to.equal(developer.address);
      expect(s.client).to.equal(client.address);
      expect(s.asset).to.equal(ethers.ZeroAddress);
      expect(s.deposit).to.equal(deposit);
      expect(s.status).to.equal(ProjectStatus.Setup);
      expect(s.milestoneCount).to.equal(3n);
      expect(s.currentMilestone).to.equal(0n);
      expect(s.termsVersion).to.equal(s.confirmedVersion);
    });

    it("rejects edits from a third party and out-of-bounds edit values", async function () {
      const { project, client, thirdParty } = await loadFixture(ethProjectFixture);
      await expect(project.connect(thirdParty).editDeposit(1n, await project.termsVersion())).to.be.revertedWithCustomError(project, "NotParty");
      await expect(project.connect(thirdParty).editMilestone(1, 1n, DAY, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "NotParty"
      );
      await expect(project.connect(client).editDeposit(0n, await project.termsVersion())).to.be.revertedWithCustomError(project, "InvalidAmount");
      await expect(project.connect(client).editMilestone(1, 0n, DAY, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "InvalidAmount"
      );
      await expect(project.connect(client).editMilestone(1, 1n, 0n, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "InvalidWindow"
      );
      await expect(project.connect(client).editMilestone(1, 1n, 366n * DAY, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "InvalidWindow"
      );
      await expect(project.connect(client).editMilestone(3, 1n, DAY, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "UnknownMilestone"
      );
    });

    it("emits an event for each edit", async function () {
      const { project, developer, client } = await loadFixture(ethProjectFixture);
      const v = await project.termsVersion();
      await expect(project.connect(client).editDeposit(7n, await project.termsVersion()))
        .to.emit(project, "DepositEdited")
        .withArgs(client.address, 7n, v + 1n);
      await expect(project.connect(developer).editMilestone(1, 9n, DAY, await project.termsVersion()))
        .to.emit(project, "MilestoneEdited")
        .withArgs(1n, developer.address, 9n, DAY, v + 2n);
    });
  });

  describe("Start lock", function () {
    it("pays the deposit to the developer and holds exactly milestone 1", async function () {
      const { project, developer, client, deposit, amounts, windows } = await loadFixture(ethProjectFixture);

      await expect(
        project.connect(client).startLock(deposit, amounts[0], windows[0], { value: deposit + amounts[0] })
      ).to.changeEtherBalances([developer, client, project], [deposit, -(deposit + amounts[0]), amounts[0]]);

      expect((await project.getMilestone(0)).status).to.equal(MilestoneStatus.Funded);
      expect(await project.status()).to.equal(ProjectStatus.Active);
      expect(await ethers.provider.getBalance(project.target)).to.equal(amounts[0]);
      expect(await project.owed(developer.address)).to.equal(0n);
      await expect(project.connect(developer).withdraw()).to.be.revertedWithCustomError(project, "NothingOwed");
    });

    it("reverts if msg.value is one wei short or one wei over", async function () {
      const { project, client, deposit, amounts, windows } = await loadFixture(ethProjectFixture);
      const exact = deposit + amounts[0];

      await expect(
        project.connect(client).startLock(deposit, amounts[0], windows[0], { value: exact - 1n })
      ).to.be.revertedWithCustomError(project, "WrongValue");
      await expect(
        project.connect(client).startLock(deposit, amounts[0], windows[0], { value: exact + 1n })
      ).to.be.revertedWithCustomError(project, "WrongValue");
    });

    it("reverts when called by the developer or a third party", async function () {
      const { project, developer, thirdParty, deposit, amounts, windows } = await loadFixture(ethProjectFixture);
      const value = deposit + amounts[0];

      await expect(
        project.connect(developer).startLock(deposit, amounts[0], windows[0], { value })
      ).to.be.revertedWithCustomError(project, "NotClient");
      await expect(
        project.connect(thirdParty).startLock(deposit, amounts[0], windows[0], { value })
      ).to.be.revertedWithCustomError(project, "NotClient");
    });

    it("cannot run twice", async function () {
      const { project, client, deposit, amounts, windows } = await loadFixture(startedEthProjectFixture);
      await expect(
        project.connect(client).startLock(deposit, amounts[0], windows[0], { value: deposit + amounts[0] })
      ).to.be.revertedWithCustomError(project, "WrongProjectStatus");
    });
  });

  describe("Editing locked and unlocked amounts (AE8)", function () {
    it("lets either party change an unfunded milestone but not a funded milestone or the deposit", async function () {
      const { project, developer, client } = await loadFixture(startedEthProjectFixture);

      await project.connect(developer).editMilestone(1, ethers.parseEther("2"), 4n * DAY, await project.termsVersion());
      let m1 = await project.getMilestone(1);
      expect(m1.amount).to.equal(ethers.parseEther("2"));
      expect(m1.reviewWindow).to.equal(4n * DAY);

      await project.connect(client).editMilestone(1, ethers.parseEther("1.5"), 6n * DAY, await project.termsVersion());
      m1 = await project.getMilestone(1);
      expect(m1.amount).to.equal(ethers.parseEther("1.5"));
      expect(m1.reviewWindow).to.equal(6n * DAY);

      await expect(project.connect(developer).editMilestone(0, 1n, DAY, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongMilestoneStatus"
      );
      await expect(project.connect(client).editMilestone(0, 1n, DAY, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongMilestoneStatus"
      );
      await expect(project.connect(developer).editDeposit(1n, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      await expect(project.connect(client).editDeposit(1n, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      expect((await project.getMilestone(0)).amount).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Expected values and developer consent (KTD5)", function () {
    it("reverts a start lock with values the developer changed, and succeeds with the new ones", async function () {
      const { project, developer, client, deposit, amounts, windows } = await loadFixture(ethProjectFixture);
      const newAmount = ethers.parseEther("1.2");
      await project.connect(developer).editMilestone(0, newAmount, windows[0], await project.termsVersion());

      await expect(
        project.connect(client).startLock(deposit, amounts[0], windows[0], { value: deposit + amounts[0] })
      ).to.be.revertedWithCustomError(project, "TermsChanged");

      await expect(
        project.connect(client).startLock(deposit, newAmount, windows[0], { value: deposit + newAmount })
      ).to.changeEtherBalance(project, newAmount);
    });

    it("reverts a start lock when the window or deposit differs from what the client expected", async function () {
      const { project, developer, client, deposit, amounts, windows } = await loadFixture(ethProjectFixture);
      await project.connect(developer).editMilestone(0, amounts[0], windows[0] + 1n, await project.termsVersion());
      await expect(
        project.connect(client).startLock(deposit, amounts[0], windows[0], { value: deposit + amounts[0] })
      ).to.be.revertedWithCustomError(project, "TermsChanged");

      await project.connect(developer).editDeposit(deposit + 1n, await project.termsVersion());
      await expect(
        project.connect(client).startLock(deposit, amounts[0], windows[0] + 1n, { value: deposit + amounts[0] })
      ).to.be.revertedWithCustomError(project, "TermsChanged");
    });

    it("blocks a start lock after a client edit until the developer confirms the current version", async function () {
      const { project, developer, client, amounts, windows } = await loadFixture(ethProjectFixture);
      const lowered = ethers.parseEther("0.1");
      await project.connect(client).editDeposit(lowered, await project.termsVersion());
      expect(await project.confirmedVersion()).to.be.lessThan(await project.termsVersion());

      await expect(
        project.connect(client).startLock(lowered, amounts[0], windows[0], { value: lowered + amounts[0] })
      ).to.be.revertedWithCustomError(project, "TermsNotConfirmed");

      const version = await project.termsVersion();
      await expect(project.connect(developer).confirmTerms(version))
        .to.emit(project, "TermsConfirmed")
        .withArgs(version);

      await expect(
        project.connect(client).startLock(lowered, amounts[0], windows[0], { value: lowered + amounts[0] })
      ).to.changeEtherBalance(developer, lowered);
    });

    it("blocks fund-next after a client edit to milestone 2 until the developer confirms", async function () {
      const { project, developer, client, reviewEnd } = await loadFixture(deliveredEthProjectFixture);
      await time.setNextBlockTimestamp(reviewEnd - 10n);
      await project.connect(client).accept(0);

      const lowered = ethers.parseEther("0.4");
      const shorter = DAY;
      await project.connect(client).editMilestone(1, lowered, shorter, await project.termsVersion());
      await expect(
        project.connect(client).fundMilestone(1, lowered, shorter, { value: lowered })
      ).to.be.revertedWithCustomError(project, "TermsNotConfirmed");

      await project.connect(developer).confirmTerms(await project.termsVersion());
      await expect(project.connect(client).fundMilestone(1, lowered, shorter, { value: lowered })).to.changeEtherBalance(
        project,
        lowered
      );
      expect((await project.getMilestone(1)).status).to.equal(MilestoneStatus.Funded);
    });

    it("reverts confirm terms with a stale version or from anyone but the developer", async function () {
      const { project, developer, client, thirdParty } = await loadFixture(ethProjectFixture);
      await project.connect(client).editDeposit(1n, await project.termsVersion());
      const version = await project.termsVersion();

      await expect(project.connect(developer).confirmTerms(version - 1n)).to.be.revertedWithCustomError(
        project,
        "StaleVersion"
      );
      await expect(project.connect(client).confirmTerms(version)).to.be.revertedWithCustomError(
        project,
        "NotDeveloper"
      );
      await expect(project.connect(thirdParty).confirmTerms(version)).to.be.revertedWithCustomError(
        project,
        "NotDeveloper"
      );
    });

    it("treats a developer edit as confirmed without a separate call", async function () {
      const { project, developer } = await loadFixture(ethProjectFixture);
      await project.connect(developer).editDeposit(123n, await project.termsVersion());
      expect(await project.confirmedVersion()).to.equal(await project.termsVersion());
      await project.connect(developer).editMilestone(2, 5n, DAY, await project.termsVersion());
      expect(await project.confirmedVersion()).to.equal(await project.termsVersion());
    });

    it("does not confirm a client cut when the developer edits a different field", async function () {
      const { project, developer, client, amounts, windows } = await loadFixture(ethProjectFixture);
      const seen = await project.termsVersion();
      await project.connect(client).editDeposit(1n, seen);

      await project.connect(developer).editMilestone(1, amounts[1], windows[1], await project.termsVersion());
      expect(await project.confirmedVersion()).to.equal(seen);
      expect(await project.deposit()).to.equal(1n);

      await expect(
        project.connect(client).startLock(1n, amounts[0], windows[0], { value: 1n + amounts[0] })
      ).to.be.revertedWithCustomError(project, "TermsNotConfirmed");
    });

    it("reverts an edit signed against a version the client already replaced", async function () {
      const { project, developer, client } = await loadFixture(ethProjectFixture);
      const seen = await project.termsVersion();
      await project.connect(client).editDeposit(1n, seen);
      await expect(project.connect(developer).editMilestone(1, 9n, DAY, seen)).to.be.revertedWithCustomError(
        project,
        "StaleVersion"
      );
      expect(await project.deposit()).to.equal(1n);
      expect((await project.getMilestone(1)).amount).to.equal(ethers.parseEther("1"));
      expect(await project.confirmedVersion()).to.equal(seen);
    });

    it("does not let the client fund a cut milestone after the developer edits a different one", async function () {
      const { project, developer, client, deposit, amounts, windows } = await loadFixture(ethProjectFixture);
      await project.connect(client).startLock(deposit, amounts[0], windows[0], { value: deposit + amounts[0] });
      await project.connect(developer).markDelivered(0);
      await project.connect(client).accept(0);

      const seen = await project.termsVersion();
      await project.connect(client).editMilestone(1, 1n, windows[1], seen);
      await project.connect(developer).editMilestone(2, amounts[2], windows[2], await project.termsVersion());
      expect(await project.confirmedVersion()).to.equal(seen);
      expect((await project.getMilestone(1)).amount).to.equal(1n);

      await expect(
        project.connect(client).fundMilestone(1, 1n, windows[1], { value: 1n })
      ).to.be.revertedWithCustomError(project, "TermsNotConfirmed");
    });
  });

  describe("Delivery", function () {
    it("records deliveredAt when the developer marks a funded milestone delivered", async function () {
      const { project, developer } = await loadFixture(startedEthProjectFixture);
      const tx = await project.connect(developer).markDelivered(0);
      const block = await ethers.provider.getBlock((await tx.wait())!.blockNumber);
      const m = await project.getMilestone(0);
      expect(m.status).to.equal(MilestoneStatus.Delivered);
      expect(m.deliveredAt).to.equal(BigInt(block!.timestamp));
      await expect(tx)
        .to.emit(project, "MilestoneDelivered")
        .withArgs(0n, BigInt(block!.timestamp), BigInt(block!.timestamp) + m.reviewWindow);
    });

    it("rejects marking delivered from the client, a third party, or on an unfunded milestone", async function () {
      const { project, developer, client, thirdParty } = await loadFixture(startedEthProjectFixture);
      await expect(project.connect(client).markDelivered(0)).to.be.revertedWithCustomError(project, "NotDeveloper");
      await expect(project.connect(thirdParty).markDelivered(0)).to.be.revertedWithCustomError(
        project,
        "NotDeveloper"
      );
      await expect(project.connect(developer).markDelivered(1)).to.be.revertedWithCustomError(
        project,
        "WrongMilestoneStatus"
      );
    });

    it("rejects marking delivered before the start lock", async function () {
      const { project, developer } = await loadFixture(ethProjectFixture);
      await expect(project.connect(developer).markDelivered(0)).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
    });
  });

  describe("Review outcomes", function () {
    it("pays the developer when the client accepts one second after delivery (AE4)", async function () {
      const { project, developer, client, amounts, windows } = await loadFixture(deliveredEthProjectFixture);
      const deliveredAt = (await project.getMilestone(0)).deliveredAt;
      await time.setNextBlockTimestamp(deliveredAt + 1n);

      await expect(project.connect(client).accept(0)).to.changeEtherBalances(
        [developer, project],
        [amounts[0], -amounts[0]]
      );
      expect((await project.getMilestone(0)).status).to.equal(MilestoneStatus.Paid);
      expect(await project.owed(developer.address)).to.equal(0n);
      await expect(project.connect(developer).withdraw()).to.be.revertedWithCustomError(project, "NothingOwed");

      await expect(
        project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] })
      ).to.emit(project, "MilestoneFunded");
      expect(await project.currentMilestone()).to.equal(1n);
    });

    it("lets a third party release the payment at exactly the review end when no one acts (AE3, AE11)", async function () {
      const { project, developer, thirdParty, amounts, reviewEnd } = await loadFixture(deliveredEthProjectFixture);
      await time.setNextBlockTimestamp(reviewEnd);

      await expect(project.connect(thirdParty).release(0)).to.changeEtherBalances(
        [developer, project],
        [amounts[0], -amounts[0]]
      );
      expect((await project.getMilestone(0)).status).to.equal(MilestoneStatus.Paid);
      expect(await project.owed(developer.address)).to.equal(0n);
      await expect(project.connect(developer).withdraw()).to.be.revertedWithCustomError(project, "NothingOwed");
    });

    it("reverts release one second before the review end", async function () {
      const { project, thirdParty, reviewEnd } = await loadFixture(deliveredEthProjectFixture);
      await time.setNextBlockTimestamp(reviewEnd - 1n);
      await expect(project.connect(thirdParty).release(0)).to.be.revertedWithCustomError(project, "ReviewOpen");
    });

    it("at the review end accept and reject revert and release succeeds (KTD7 boundary)", async function () {
      // Each attempt reloads the fixture so its block lands exactly on the review end.
      let f = await loadFixture(deliveredEthProjectFixture);
      await time.setNextBlockTimestamp(f.reviewEnd);
      await expect(f.project.connect(f.client).accept(0)).to.be.revertedWithCustomError(f.project, "ReviewClosed");

      f = await loadFixture(deliveredEthProjectFixture);
      await time.setNextBlockTimestamp(f.reviewEnd);
      await expect(f.project.connect(f.client).reject(0)).to.be.revertedWithCustomError(f.project, "ReviewClosed");

      const { project, developer, client, amounts, reviewEnd } = await loadFixture(deliveredEthProjectFixture);
      await time.setNextBlockTimestamp(reviewEnd);
      const tx = await project.connect(client).release(0);
      const block = await ethers.provider.getBlock((await tx.wait())!.blockNumber);
      expect(BigInt(block!.timestamp)).to.equal(reviewEnd);
      await expect(tx).to.changeEtherBalance(developer, amounts[0]);
    });

    it("returns milestone 1 on a rejection, stops the project, and leaves the deposit with the developer (AE1)", async function () {
      const { project, developer, client, deposit, amounts, reviewEnd } = await loadFixture(
        deliveredEthProjectFixture
      );
      await time.setNextBlockTimestamp(reviewEnd - 1n);

      await expect(project.connect(client).reject(0)).to.changeEtherBalances(
        [client, developer, project],
        [amounts[0], 0n, -amounts[0]]
      );
      expect((await project.getMilestone(0)).status).to.equal(MilestoneStatus.Returned);
      expect(await project.status()).to.equal(ProjectStatus.Stopped);
      expect(await project.deposit()).to.equal(deposit);
      expect(await ethers.provider.getBalance(project.target)).to.equal(0n);
      expect(await project.owed(client.address)).to.equal(0n);
      await expect(project.connect(client).withdraw()).to.be.revertedWithCustomError(project, "NothingOwed");
    });

    it("returns milestone 2 on a later rejection while the developer keeps the deposit and milestone 1 (AE2)", async function () {
      const { project, developer, client, deposit, amounts, windows } = await loadFixture(ethProjectFixture);
      const devBefore = await ethers.provider.getBalance(developer.address);

      await project.connect(client).startLock(deposit, amounts[0], windows[0], { value: deposit + amounts[0] });
      let devGas = await gasCost(await project.connect(developer).markDelivered(0));
      await project.connect(client).accept(0);
      await project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] });
      devGas += await gasCost(await project.connect(developer).markDelivered(1));

      await expect(project.connect(client).reject(1)).to.changeEtherBalances(
        [client, developer, project],
        [amounts[1], 0n, -amounts[1]]
      );
      expect(await project.status()).to.equal(ProjectStatus.Stopped);
      expect((await project.getMilestone(0)).status).to.equal(MilestoneStatus.Paid);
      expect((await project.getMilestone(1)).status).to.equal(MilestoneStatus.Returned);
      const devAfter = await ethers.provider.getBalance(developer.address);
      expect(devAfter - devBefore + devGas).to.equal(deposit + amounts[0]);
    });

    it("blocks funding, editing, and marking delivered after a rejection", async function () {
      const { project, developer, client, amounts, windows } = await loadFixture(deliveredEthProjectFixture);
      await project.connect(client).reject(0);

      await expect(
        project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] })
      ).to.be.revertedWithCustomError(project, "WrongProjectStatus");
      await expect(project.connect(client).editMilestone(1, 1n, DAY, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      await expect(project.connect(developer).editMilestone(2, 1n, DAY, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      await expect(project.connect(developer).editDeposit(1n, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      await expect(project.connect(developer).markDelivered(0)).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      await expect(project.connect(developer).confirmTerms(await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
    });

    it("leaves the next milestone unlocked and the project active when the client does not fund it (AE5)", async function () {
      const { project, developer, client, thirdParty, deposit, amounts, windows } = await loadFixture(
        ethProjectFixture
      );
      const devBefore = await ethers.provider.getBalance(developer.address);

      await project.connect(client).startLock(deposit, amounts[0], windows[0], { value: deposit + amounts[0] });
      const devGas = await gasCost(await project.connect(developer).markDelivered(0));
      const m0 = await project.getMilestone(0);
      await time.increaseTo(m0.deliveredAt + m0.reviewWindow);
      await project.connect(thirdParty).release(0);
      await time.increase(365n * DAY);

      expect(await project.status()).to.equal(ProjectStatus.Active);
      expect((await project.getMilestone(1)).status).to.equal(MilestoneStatus.Unfunded);
      expect(await ethers.provider.getBalance(project.target)).to.equal(0n);
      const devAfter = await ethers.provider.getBalance(developer.address);
      expect(devAfter - devBefore + devGas).to.equal(deposit + amounts[0]);
    });

    it("rejects funding a milestone before the previous one is paid", async function () {
      const { project, developer, client, amounts, windows } = await loadFixture(startedEthProjectFixture);

      await expect(
        project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] })
      ).to.be.revertedWithCustomError(project, "PreviousNotPaid");

      await project.connect(developer).markDelivered(0);
      await expect(
        project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] })
      ).to.be.revertedWithCustomError(project, "PreviousNotPaid");

      await project.connect(client).accept(0);
      await expect(
        project.connect(client).fundMilestone(2, amounts[2], windows[2], { value: amounts[2] })
      ).to.be.revertedWithCustomError(project, "PreviousNotPaid");
    });

    it("rejects fund-next with stale expected values, a wrong value, a non-client caller, or index 0", async function () {
      const { project, developer, client, thirdParty, amounts, windows } = await loadFixture(
        deliveredEthProjectFixture
      );
      await project.connect(client).accept(0);

      await expect(
        project.connect(client).fundMilestone(1, amounts[1] - 1n, windows[1], { value: amounts[1] - 1n })
      ).to.be.revertedWithCustomError(project, "TermsChanged");
      await expect(
        project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] - 1n })
      ).to.be.revertedWithCustomError(project, "WrongValue");
      await expect(
        project.connect(thirdParty).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] })
      ).to.be.revertedWithCustomError(project, "NotClient");
      await expect(
        project.connect(developer).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] })
      ).to.be.revertedWithCustomError(project, "NotClient");
      await expect(
        project.connect(client).fundMilestone(0, amounts[0], windows[0], { value: amounts[0] })
      ).to.be.revertedWithCustomError(project, "WrongMilestoneStatus");
    });

    it("rejects funding a milestone again after it is funded, delivered, or paid", async function () {
      const { project, developer, client, amounts, windows } = await loadFixture(deliveredEthProjectFixture);
      await project.connect(client).accept(0);
      await project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] });

      await expect(
        project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] })
      ).to.be.revertedWithCustomError(project, "WrongMilestoneStatus");
      expect(await ethers.provider.getBalance(project.target)).to.equal(amounts[1]);

      await project.connect(developer).markDelivered(1);
      await expect(
        project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] })
      ).to.be.revertedWithCustomError(project, "WrongMilestoneStatus");
      expect(await ethers.provider.getBalance(project.target)).to.equal(amounts[1]);

      await project.connect(client).accept(1);
      await expect(
        project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: amounts[1] })
      ).to.be.revertedWithCustomError(project, "WrongMilestoneStatus");
      expect(await ethers.provider.getBalance(project.target)).to.equal(0n);
    });

    it("rejects accept, reject, and release on a milestone that is not delivered", async function () {
      const { project, client, thirdParty } = await loadFixture(startedEthProjectFixture);
      await expect(project.connect(client).accept(0)).to.be.revertedWithCustomError(project, "WrongMilestoneStatus");
      await expect(project.connect(client).reject(0)).to.be.revertedWithCustomError(project, "WrongMilestoneStatus");
      await expect(project.connect(thirdParty).release(0)).to.be.revertedWithCustomError(
        project,
        "WrongMilestoneStatus"
      );
      await expect(project.connect(client).accept(1)).to.be.revertedWithCustomError(project, "WrongMilestoneStatus");
    });

    it("rejects accept and reject from anyone but the client", async function () {
      const { project, developer, thirdParty } = await loadFixture(deliveredEthProjectFixture);
      await expect(project.connect(developer).accept(0)).to.be.revertedWithCustomError(project, "NotClient");
      await expect(project.connect(thirdParty).accept(0)).to.be.revertedWithCustomError(project, "NotClient");
      await expect(project.connect(developer).reject(0)).to.be.revertedWithCustomError(project, "NotClient");
      await expect(project.connect(thirdParty).reject(0)).to.be.revertedWithCustomError(project, "NotClient");
    });
  });

  describe("Completion", function () {
    it("completes the project when the last milestone is accepted, and every later call reverts", async function () {
      const { project, developer, client, thirdParty, amount } = await loadFixture(singleMilestoneFixture);

      const tx = project.connect(client).accept(0);
      await expect(tx).to.emit(project, "ProjectCompleted");
      await expect(tx).to.changeEtherBalance(developer, amount);
      expect(await project.status()).to.equal(ProjectStatus.Completed);

      await expect(project.connect(client).accept(0)).to.be.revertedWithCustomError(project, "WrongMilestoneStatus");
      await expect(project.connect(client).reject(0)).to.be.revertedWithCustomError(project, "WrongMilestoneStatus");
      await expect(project.connect(thirdParty).release(0)).to.be.revertedWithCustomError(
        project,
        "WrongMilestoneStatus"
      );
      await expect(project.connect(developer).markDelivered(0)).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      await expect(project.connect(client).editMilestone(0, 1n, DAY, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      await expect(project.connect(developer).editDeposit(1n, await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      await expect(project.connect(developer).confirmTerms(await project.termsVersion())).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
      await expect(project.connect(client).fundMilestone(0, amount, 3n * DAY, { value: amount })).to.be.revertedWithCustomError(
        project,
        "WrongProjectStatus"
      );
    });

    it("completes the project when the last milestone is released after silence", async function () {
      const { project, developer, thirdParty, amount, reviewEnd } = await loadFixture(singleMilestoneFixture);
      await time.setNextBlockTimestamp(reviewEnd);
      await expect(project.connect(thirdParty).release(0)).to.changeEtherBalance(developer, amount);
      expect(await project.status()).to.equal(ProjectStatus.Completed);
    });
  });

  describe("Token projects", function () {
    it("locks and pays out the exact token quantity with no price input (AE9)", async function () {
      const { project, token, developer, client, deposit, amounts, windows } = await loadFixture(tokenProjectFixture);

      await expect(project.connect(client).startLock(deposit, amounts[0], windows[0])).to.changeTokenBalances(
        token,
        [client, developer, project],
        [-(deposit + amounts[0]), deposit, amounts[0]]
      );
      await project.connect(developer).markDelivered(0);
      await expect(project.connect(client).accept(0)).to.changeTokenBalances(
        token,
        [developer, project],
        [amounts[0], -amounts[0]]
      );
      expect(await token.balanceOf(project.target)).to.equal(0n);
    });

    it("returns the exact token quantity on a rejection", async function () {
      const { project, token, developer, client, deposit, amounts, windows } = await loadFixture(tokenProjectFixture);
      await project.connect(client).startLock(deposit, amounts[0], windows[0]);
      await project.connect(developer).markDelivered(0);
      await expect(project.connect(client).reject(0)).to.changeTokenBalances(
        token,
        [client, developer, project],
        [amounts[0], 0n, -amounts[0]]
      );
    });

    it("reverts a token start lock that sends a non-zero msg.value", async function () {
      const { project, client, deposit, amounts, windows } = await loadFixture(tokenProjectFixture);
      await expect(
        project.connect(client).startLock(deposit, amounts[0], windows[0], { value: 1n })
      ).to.be.revertedWithCustomError(project, "WrongValue");
    });

    it("funds a later token milestone through transferFrom and rejects msg.value on it", async function () {
      const { project, token, developer, client, deposit, amounts, windows } = await loadFixture(tokenProjectFixture);
      await project.connect(client).startLock(deposit, amounts[0], windows[0]);
      await project.connect(developer).markDelivered(0);
      await project.connect(client).accept(0);
      await token.connect(client).approve(await project.getAddress(), amounts[1]);

      await expect(
        project.connect(client).fundMilestone(1, amounts[1], windows[1], { value: 1n })
      ).to.be.revertedWithCustomError(project, "WrongValue");
      await expect(project.connect(client).fundMilestone(1, amounts[1], windows[1])).to.changeTokenBalances(
        token,
        [client, project],
        [-amounts[1], amounts[1]]
      );
    });
  });
});
