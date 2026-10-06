import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture, setBalance } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { MilestoneProject, TestReceiver } from "../typechain-types";

const DAY = 24n * 60n * 60n;

const ProjectStatus = { Setup: 0n, Active: 1n, Stopped: 2n, Completed: 3n };
const MilestoneStatus = { Unfunded: 0n, Funded: 1n, Delivered: 2n, Paid: 3n, Returned: 4n };
const ReceiverMode = { Accept: 0, Reject: 1, Reenter: 2 };

function via(
  receiver: TestReceiver,
  project: MilestoneProject,
  fn: string,
  args: unknown[],
  value = 0n
) {
  return receiver.execute(project.target, value, project.interface.encodeFunctionData(fn, args), { value });
}

async function deployProject(developer: string, client: string, asset: string, deposit: bigint, amounts: bigint[]) {
  const MilestoneProject = await ethers.getContractFactory("MilestoneProject");
  return MilestoneProject.deploy(
    developer,
    client,
    asset,
    deposit,
    amounts,
    amounts.map(() => 2n * DAY)
  );
}

describe("MilestoneProject payouts", function () {
  const deposit = ethers.parseEther("0.5");
  const amount = ethers.parseEther("1");

  async function receiversFixture() {
    const [deployer, client, thirdParty] = await ethers.getSigners();
    const TestReceiver = await ethers.getContractFactory("TestReceiver");
    const devReceiver = await TestReceiver.deploy();
    const clientReceiver = await TestReceiver.deploy();
    return { deployer, client, thirdParty, devReceiver, clientReceiver };
  }

  describe("Rejected ETH transfers", function () {
    it("credits a developer that rejects ETH on the start lock, and pays the credit on withdraw", async function () {
      const { client, devReceiver } = await loadFixture(receiversFixture);
      await devReceiver.setMode(ReceiverMode.Reject);
      const project = await deployProject(await devReceiver.getAddress(), client.address, ethers.ZeroAddress, deposit, [
        amount,
      ]);

      await expect(project.connect(client).startLock(deposit, amount, 2n * DAY, { value: deposit + amount }))
        .to.emit(project, "PaymentCredited")
        .withArgs(devReceiver.target, deposit);
      expect(await project.status()).to.equal(ProjectStatus.Active);
      expect(await project.owed(devReceiver.target)).to.equal(deposit);
      expect(await ethers.provider.getBalance(project.target)).to.equal(deposit + amount);

      await devReceiver.setMode(ReceiverMode.Accept);
      await expect(via(devReceiver, project, "withdraw", [])).to.changeEtherBalances(
        [devReceiver, project],
        [deposit, -deposit]
      );
      expect(await project.owed(devReceiver.target)).to.equal(0n);
      expect(await ethers.provider.getBalance(project.target)).to.equal(amount);
    });

    it("stops the project and credits a client that rejects the refund", async function () {
      const { deployer, clientReceiver } = await loadFixture(receiversFixture);
      const project = await deployProject(deployer.address, await clientReceiver.getAddress(), ethers.ZeroAddress, deposit, [
        amount,
        amount,
      ]);
      await via(clientReceiver, project, "startLock", [deposit, amount, 2n * DAY], deposit + amount);
      await project.connect(deployer).markDelivered(0);
      await clientReceiver.setMode(ReceiverMode.Reject);

      await expect(via(clientReceiver, project, "reject", [0]))
        .to.emit(project, "PaymentCredited")
        .withArgs(clientReceiver.target, amount);
      expect(await project.status()).to.equal(ProjectStatus.Stopped);
      expect((await project.getMilestone(0)).status).to.equal(MilestoneStatus.Returned);
      expect(await project.owed(clientReceiver.target)).to.equal(amount);

      await clientReceiver.setMode(ReceiverMode.Accept);
      await expect(via(clientReceiver, project, "withdraw", [])).to.changeEtherBalance(clientReceiver, amount);
    });

    it("reverts a withdraw when the recipient still rejects, keeping the credit", async function () {
      const { client, devReceiver } = await loadFixture(receiversFixture);
      await devReceiver.setMode(ReceiverMode.Reject);
      const project = await deployProject(await devReceiver.getAddress(), client.address, ethers.ZeroAddress, deposit, [
        amount,
      ]);
      await project.connect(client).startLock(deposit, amount, 2n * DAY, { value: deposit + amount });

      await expect(via(devReceiver, project, "withdraw", [])).to.be.revertedWithCustomError(project, "WithdrawFailed");
      expect(await project.owed(devReceiver.target)).to.equal(deposit);
    });

    it("reverts a withdraw with no credit", async function () {
      const { thirdParty } = await loadFixture(receiversFixture);
      const [developer, client] = await ethers.getSigners();
      const project = await deployProject(developer.address, client.address, ethers.ZeroAddress, deposit, [amount]);
      await expect(project.connect(thirdParty).withdraw()).to.be.revertedWithCustomError(project, "NothingOwed");
    });
  });

  describe("Frozen token recipients (KTD2 call-out)", function () {
    it("credits a frozen developer on accept, blocks withdraw while frozen, and pays after the freeze lifts", async function () {
      const [developer, client] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Mock USDC", "USDC", 6);
      const project = await deployProject(developer.address, client.address, await token.getAddress(), 500_000n, [
        1_000_000n,
      ]);
      await token.mint(client.address, 1_500_000n);
      await token.connect(client).approve(project.target, 1_500_000n);
      await project.connect(client).startLock(500_000n, 1_000_000n, 2n * DAY);
      await project.connect(developer).markDelivered(0);
      await token.setFrozen(developer.address, true);

      await expect(project.connect(client).accept(0))
        .to.emit(project, "PaymentCredited")
        .withArgs(developer.address, 1_000_000n);
      expect(await project.status()).to.equal(ProjectStatus.Completed);
      expect(await project.owed(developer.address)).to.equal(1_000_000n);

      await expect(project.connect(developer).withdraw()).to.be.revertedWith("MockERC20: recipient frozen");
      expect(await project.owed(developer.address)).to.equal(1_000_000n);

      await token.setFrozen(developer.address, false);
      await expect(project.connect(developer).withdraw()).to.changeTokenBalances(
        token,
        [developer, project],
        [1_000_000n, -1_000_000n]
      );
      expect(await project.owed(developer.address)).to.equal(0n);
    });
  });

  describe("USDT-shaped token with no return values", function () {
    async function usdtFixture() {
      const [developer, client, thirdParty] = await ethers.getSigners();
      const MockNoReturnERC20 = await ethers.getContractFactory("MockNoReturnERC20");
      const usdt = await MockNoReturnERC20.deploy("Mock USDT", "USDT", 6);
      const project = await deployProject(developer.address, client.address, await usdt.getAddress(), 100n, [
        1_000n,
        2_000n,
      ]);
      await usdt.mint(client.address, 10_000n);
      await usdt.connect(client).approve(project.target, 10_000n);
      return { developer, client, thirdParty, usdt, project };
    }

    it("runs start lock, accept, fund-next, and release", async function () {
      const { developer, client, thirdParty, usdt, project } = await loadFixture(usdtFixture);

      await project.connect(client).startLock(100n, 1_000n, 2n * DAY);
      expect(await usdt.balanceOf(developer.address)).to.equal(100n);
      expect(await usdt.balanceOf(project.target)).to.equal(1_000n);

      await project.connect(developer).markDelivered(0);
      await project.connect(client).accept(0);
      expect(await usdt.balanceOf(developer.address)).to.equal(1_100n);

      await project.connect(client).fundMilestone(1, 2_000n, 2n * DAY);
      await project.connect(developer).markDelivered(1);
      await time.increase(2n * DAY);
      await project.connect(thirdParty).release(1);
      expect(await usdt.balanceOf(developer.address)).to.equal(3_100n);
      expect(await usdt.balanceOf(project.target)).to.equal(0n);
      expect(await project.status()).to.equal(ProjectStatus.Completed);
    });

    it("runs reject", async function () {
      const { developer, client, usdt, project } = await loadFixture(usdtFixture);
      await project.connect(client).startLock(100n, 1_000n, 2n * DAY);
      await project.connect(developer).markDelivered(0);
      await project.connect(client).reject(0);
      expect(await usdt.balanceOf(client.address)).to.equal(10_000n - 100n);
      expect(await usdt.balanceOf(developer.address)).to.equal(100n);
      expect(await project.status()).to.equal(ProjectStatus.Stopped);
    });

    it("runs withdraw after a frozen push", async function () {
      const { developer, client, usdt, project } = await loadFixture(usdtFixture);
      await usdt.setFrozen(developer.address, true);
      await project.connect(client).startLock(100n, 1_000n, 2n * DAY);
      expect(await project.owed(developer.address)).to.equal(100n);

      await usdt.setFrozen(developer.address, false);
      await project.connect(developer).withdraw();
      expect(await usdt.balanceOf(developer.address)).to.equal(100n);
      expect(await project.owed(developer.address)).to.equal(0n);
    });
  });

  describe("Fee-on-transfer tokens", function () {
    it("reverts the start lock when a 1% fee is skimmed, changing no state", async function () {
      const [developer, client] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Fee token", "FEE", 18);
      const project = await deployProject(developer.address, client.address, await token.getAddress(), 100n, [
        10_000n,
      ]);
      await token.mint(client.address, 1_000_000n);
      await token.connect(client).approve(project.target, 10_100n);
      await token.setFeeBps(100);

      await expect(project.connect(client).startLock(100n, 10_000n, 2n * DAY)).to.be.revertedWithCustomError(
        project,
        "IncompleteReceipt"
      );
      expect(await project.status()).to.equal(ProjectStatus.Setup);
      expect((await project.getMilestone(0)).status).to.equal(MilestoneStatus.Unfunded);
      expect(await token.balanceOf(client.address)).to.equal(1_000_000n);
      expect(await token.balanceOf(project.target)).to.equal(0n);
    });

    it("reverts fund-next when a fee switch turns on mid-project", async function () {
      const [developer, client] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Fee token", "FEE", 6);
      const project = await deployProject(developer.address, client.address, await token.getAddress(), 100n, [
        10_000n,
        10_000n,
      ]);
      await token.mint(client.address, 1_000_000n);
      await token.connect(client).approve(project.target, 1_000_000n);
      await project.connect(client).startLock(100n, 10_000n, 2n * DAY);
      await project.connect(developer).markDelivered(0);
      await project.connect(client).accept(0);
      await token.setFeeBps(100);

      await expect(project.connect(client).fundMilestone(1, 10_000n, 2n * DAY)).to.be.revertedWithCustomError(
        project,
        "IncompleteReceipt"
      );
      expect((await project.getMilestone(1)).status).to.equal(MilestoneStatus.Unfunded);
    });
  });

  describe("Reentrancy", function () {
    it("blocks a developer from re-entering markDelivered during the deposit payout", async function () {
      const { client, devReceiver } = await loadFixture(receiversFixture);
      const project = await deployProject(await devReceiver.getAddress(), client.address, ethers.ZeroAddress, deposit, [
        amount,
      ]);
      await devReceiver.setReentry(project.target, project.interface.encodeFunctionData("markDelivered", [0]));
      await devReceiver.setMode(ReceiverMode.Reenter);

      await project.connect(client).startLock(deposit, amount, 2n * DAY, { value: deposit + amount });

      expect((await project.getMilestone(0)).status).to.equal(MilestoneStatus.Funded);
      expect(await project.owed(devReceiver.target)).to.equal(deposit);
    });

    it("blocks a developer from re-entering release during an accept payout", async function () {
      const { client, devReceiver } = await loadFixture(receiversFixture);
      const project = await deployProject(await devReceiver.getAddress(), client.address, ethers.ZeroAddress, deposit, [
        amount,
      ]);
      await project.connect(client).startLock(deposit, amount, 2n * DAY, { value: deposit + amount });
      await via(devReceiver, project, "markDelivered", [0]);
      await devReceiver.setReentry(project.target, project.interface.encodeFunctionData("release", [0]));
      await devReceiver.setMode(ReceiverMode.Reenter);

      await project.connect(client).accept(0);

      expect((await project.getMilestone(0)).status).to.equal(MilestoneStatus.Paid);
      expect(await project.owed(devReceiver.target)).to.equal(amount);
      expect(await ethers.provider.getBalance(project.target)).to.equal(amount);
    });

    it("blocks a developer from re-entering withdraw during a withdraw", async function () {
      const { client, devReceiver } = await loadFixture(receiversFixture);
      await devReceiver.setMode(ReceiverMode.Reject);
      const project = await deployProject(await devReceiver.getAddress(), client.address, ethers.ZeroAddress, deposit, [
        amount,
      ]);
      await project.connect(client).startLock(deposit, amount, 2n * DAY, { value: deposit + amount });
      await devReceiver.setReentry(project.target, project.interface.encodeFunctionData("withdraw", []));
      await devReceiver.setMode(ReceiverMode.Reenter);

      await expect(via(devReceiver, project, "withdraw", [])).to.be.revertedWithCustomError(project, "WithdrawFailed");
      expect(await project.owed(devReceiver.target)).to.equal(deposit);
      expect(await ethers.provider.getBalance(project.target)).to.equal(deposit + amount);
    });
  });

  describe("Balances outside the recorded amounts", function () {
    it("never pays out force-fed ETH", async function () {
      const [developer, client, thirdParty] = await ethers.getSigners();
      const project = await deployProject(developer.address, client.address, ethers.ZeroAddress, deposit, [
        amount,
        amount,
      ]);
      const forced = ethers.parseEther("3");
      await setBalance(await project.getAddress(), forced);

      await expect(
        project.connect(client).startLock(deposit, amount, 2n * DAY, { value: deposit + amount })
      ).to.changeEtherBalance(developer, deposit);
      await project.connect(developer).markDelivered(0);
      await expect(project.connect(client).accept(0)).to.changeEtherBalance(developer, amount);
      await project.connect(client).fundMilestone(1, amount, 2n * DAY, { value: amount });
      await project.connect(developer).markDelivered(1);
      await time.increase(2n * DAY);
      await expect(project.connect(thirdParty).release(1)).to.changeEtherBalance(developer, amount);

      expect(await project.status()).to.equal(ProjectStatus.Completed);
      expect(await ethers.provider.getBalance(project.target)).to.equal(forced);
    });

    it("never pays out tokens transferred to the project directly", async function () {
      const [developer, client] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Mock WBTC", "WBTC", 8);
      const project = await deployProject(developer.address, client.address, await token.getAddress(), 10n, [100n]);
      await token.mint(client.address, 10_000n);
      await token.connect(client).transfer(project.target, 5_000n);
      await token.connect(client).approve(project.target, 110n);

      await project.connect(client).startLock(10n, 100n, 2n * DAY);
      await project.connect(developer).markDelivered(0);
      await project.connect(client).accept(0);

      expect(await token.balanceOf(developer.address)).to.equal(110n);
      expect(await token.balanceOf(project.target)).to.equal(5_000n);
    });

    it("holds exactly the forced amount plus the one remaining credit after two credits and one withdraw", async function () {
      const { devReceiver, clientReceiver } = await loadFixture(receiversFixture);
      const project = await deployProject(
        await devReceiver.getAddress(),
        await clientReceiver.getAddress(),
        ethers.ZeroAddress,
        deposit,
        [amount, amount]
      );
      const forced = ethers.parseEther("2");
      await setBalance(await project.getAddress(), forced);
      await devReceiver.setMode(ReceiverMode.Reject);
      await clientReceiver.setMode(ReceiverMode.Reject);

      await via(clientReceiver, project, "startLock", [deposit, amount, 2n * DAY], deposit + amount);
      await via(devReceiver, project, "markDelivered", [0]);
      await via(clientReceiver, project, "reject", [0]);
      expect(await project.owed(devReceiver.target)).to.equal(deposit);
      expect(await project.owed(clientReceiver.target)).to.equal(amount);

      await devReceiver.setMode(ReceiverMode.Accept);
      await via(devReceiver, project, "withdraw", []);

      expect(await ethers.provider.getBalance(project.target)).to.equal(forced + amount);
      await expect(via(devReceiver, project, "withdraw", [])).to.be.revertedWithCustomError(project, "NothingOwed");
    });
  });
});
