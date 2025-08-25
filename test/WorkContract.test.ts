import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { WorkContract } from "../typechain-types";

describe("WorkContract", function () {
  async function deployWorkContractFixture() {
    const [client, worker, thirdParty] = await ethers.getSigners();
    
    const hourlyRate = ethers.parseEther("0.01");
    const hoursRequired = 10;
    const guaranteedAmount = ethers.parseEther("0.05");
    const idealDuration = 60 * 60 * 24 * 7; // 1 week
    const maxDuration = 60 * 60 * 24 * 14; // 2 weeks
    const funding = hourlyRate * BigInt(hoursRequired);

    const WorkContract = await ethers.getContractFactory("WorkContract");
    const contract = await WorkContract.deploy(
      worker.address,
      hourlyRate,
      hoursRequired,
      guaranteedAmount,
      idealDuration,
      maxDuration,
      { value: funding }
    );

    return { contract, client, worker, thirdParty, hourlyRate, hoursRequired, guaranteedAmount, funding };
  }

  describe("Deployment", function () {
    it("Should set correct initial parameters", async function () {
      const { contract, client, worker, hourlyRate, hoursRequired, guaranteedAmount } = await loadFixture(deployWorkContractFixture);

      expect(await contract.client()).to.equal(client.address);
      expect(await contract.worker()).to.equal(worker.address);
      expect(await contract.hourlyRate()).to.equal(hourlyRate);
      expect(await contract.hoursRequired()).to.equal(hoursRequired);
      expect(await contract.guaranteedAmount()).to.equal(guaranteedAmount);
    });

    it("Should be funded with correct amount", async function () {
      const { contract, funding } = await loadFixture(deployWorkContractFixture);
      
      const balance = await ethers.provider.getBalance(contract.target);
      expect(balance).to.equal(funding);
    });

    it("Should set correct deadlines", async function () {
      const { contract } = await loadFixture(deployWorkContractFixture);
      
      const [ideal, max] = await contract.getDeadlines();
      const currentTime = await time.latest();
      
      expect(ideal).to.be.greaterThan(currentTime);
      expect(max).to.be.greaterThan(ideal);
    });
  });

  describe("Approval System", function () {
    it("Should allow client to approve completion", async function () {
      const { contract, client } = await loadFixture(deployWorkContractFixture);
      
      await contract.connect(client).approveCompletion();
      const [clientApproved, workerApproved] = await contract.getApprovalStatus();
      
      expect(clientApproved).to.be.true;
      expect(workerApproved).to.be.false;
    });

    it("Should allow worker to approve completion", async function () {
      const { contract, worker } = await loadFixture(deployWorkContractFixture);
      
      await contract.connect(worker).approveCompletion();
      const [clientApproved, workerApproved] = await contract.getApprovalStatus();
      
      expect(clientApproved).to.be.false;
      expect(workerApproved).to.be.true;
    });

    it("Should release payment when both parties approve", async function () {
      const { contract, client, worker, funding } = await loadFixture(deployWorkContractFixture);
      
      const initialWorkerBalance = await ethers.provider.getBalance(worker.address);
      
      await contract.connect(client).approveCompletion();
      await contract.connect(worker).approveCompletion();
      
      const finalWorkerBalance = await ethers.provider.getBalance(worker.address);
      expect(finalWorkerBalance).to.be.greaterThan(initialWorkerBalance);
      
      const contractBalance = await contract.getContractBalance();
      expect(contractBalance).to.equal(0);
    });
  });

  describe("Dispute Resolution", function () {
    it("Should allow worker to claim guaranteed amount", async function () {
      const { contract, worker, guaranteedAmount } = await loadFixture(deployWorkContractFixture);
      
      const initialWorkerBalance = await ethers.provider.getBalance(worker.address);
      
      await contract.connect(worker).approveCompletion();
      await contract.connect(worker).claimGuaranteed();
      
      const finalWorkerBalance = await ethers.provider.getBalance(worker.address);
      expect(finalWorkerBalance).to.be.greaterThan(initialWorkerBalance);
    });

    it("Should refund client when worker claims guaranteed", async function () {
      const { contract, client, worker, funding, guaranteedAmount } = await loadFixture(deployWorkContractFixture);
      
      const initialClientBalance = await ethers.provider.getBalance(client.address);
      
      await contract.connect(worker).approveCompletion();
      await contract.connect(worker).claimGuaranteed();
      
      const finalClientBalance = await ethers.provider.getBalance(client.address);
      const expectedRefund = funding - guaranteedAmount;
      expect(finalClientBalance).to.be.greaterThan(initialClientBalance);
    });
  });

  describe("Timeout Handling", function () {
    it("Should allow worker to claim after max deadline if client doesn't approve", async function () {
      const { contract, worker, funding } = await loadFixture(deployWorkContractFixture);
      
      const [_, maxDeadline] = await contract.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);
      
      const initialWorkerBalance = await ethers.provider.getBalance(worker.address);
      await contract.connect(worker).workerClaimAfterDeadline();
      
      const finalWorkerBalance = await ethers.provider.getBalance(worker.address);
      expect(finalWorkerBalance).to.be.greaterThan(initialWorkerBalance);
    });

    it("Should allow client to claim after max deadline if worker doesn't approve", async function () {
      const { contract, client, funding } = await loadFixture(deployWorkContractFixture);
      
      const [_, maxDeadline] = await contract.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);
      
      const initialClientBalance = await ethers.provider.getBalance(client.address);
      await contract.connect(client).clientClaimAfterDeadline();
      
      const finalClientBalance = await ethers.provider.getBalance(client.address);
      expect(finalClientBalance).to.be.greaterThan(initialClientBalance);
    });
  });

  describe("Onchain Activity Monitoring", function () {
    it("Should track contract balance changes", async function () {
      const { contract, funding } = await loadFixture(deployWorkContractFixture);
      
      const balance = await contract.getContractBalance();
      expect(balance).to.equal(funding);
    });

    it("Should emit events for important actions", async function () {
      const { contract, client, worker } = await loadFixture(deployWorkContractFixture);
      
      await expect(contract.connect(client).approveCompletion())
        .to.emit(contract, "Approval")
        .withArgs(client.address, true);
      
      await expect(contract.connect(worker).approveCompletion())
        .to.emit(contract, "Approval")
        .withArgs(worker.address, false);
    });

    it("Should track payment release status", async function () {
      const { contract, client, worker } = await loadFixture(deployWorkContractFixture);
      
      expect(await contract.isPaymentReleased()).to.be.false;
      
      await contract.connect(client).approveCompletion();
      await contract.connect(worker).approveCompletion();
      
      expect(await contract.isPaymentReleased()).to.be.true;
    });
  });

  describe("Security and Access Control", function () {
    it("Should prevent unauthorized access to approval functions", async function () {
      const { contract, thirdParty } = await loadFixture(deployWorkContractFixture);
      
      await expect(contract.connect(thirdParty).approveCompletion())
        .to.be.revertedWith("Only client or worker can approve");
    });

    it("Should prevent claiming before deadline", async function () {
      const { contract, worker } = await loadFixture(deployWorkContractFixture);
      
      await expect(contract.connect(worker).workerClaimAfterDeadline())
        .to.be.revertedWith("Deadline not reached");
    });
  });
}); 