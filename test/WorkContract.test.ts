import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture, setBalance, setStorageAt } from "@nomicfoundation/hardhat-toolbox/network-helpers";
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

      await contract.connect(client).approveCompletion();
      await expect(contract.connect(worker).approveCompletion()).to.changeEtherBalances(
        [worker, contract],
        [funding, -funding]
      );
      expect(await contract.getContractBalance()).to.equal(0);
    });

    it("Should reject a second approval from the same party", async function () {
      const { contract, client, worker } = await loadFixture(deployWorkContractFixture);

      await contract.connect(client).approveCompletion();
      await expect(contract.connect(client).approveCompletion()).to.be.revertedWith(
        "Client already approved"
      );

      await contract.connect(worker).approveCompletion();
      await expect(contract.connect(worker).approveCompletion()).to.be.revertedWith(
        "Worker already approved"
      );
    });

    it("Should refund surplus ETH to the client on mutual approval", async function () {
      const { client, worker, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const surplus = ethers.parseEther("0.03");
      const WorkContractFactory = await ethers.getContractFactory("WorkContract");
      const overfunded = await WorkContractFactory.deploy(
        worker.address,
        hourlyRate,
        hoursRequired,
        guaranteedAmount,
        60 * 60 * 24 * 7,
        60 * 60 * 24 * 14,
        { value: funding + surplus }
      );

      await overfunded.connect(client).approveCompletion();
      await expect(overfunded.connect(worker).approveCompletion()).to.changeEtherBalances(
        [worker, client, overfunded],
        [funding, surplus, -(funding + surplus)]
      );
      expect(await overfunded.getContractBalance()).to.equal(0);
    });

    it("Should reject mutual approval when the recorded deposit is below the full payment", async function () {
      const { contract, client, worker, funding } = await loadFixture(deployWorkContractFixture);
      const fundedSlot = 8n;
      expect(BigInt(await ethers.provider.getStorage(contract.target, fundedSlot))).to.equal(
        funding
      );

      await setStorageAt(await contract.getAddress(), fundedSlot, funding - 1n);
      await contract.connect(client).approveCompletion();
      await expect(contract.connect(worker).approveCompletion()).to.be.revertedWith(
        "Insufficient contract funding"
      );
    });
  });

  describe("Dispute Resolution", function () {
    it("Should allow worker to claim guaranteed amount", async function () {
      const { contract, worker, client, guaranteedAmount, funding } = await loadFixture(deployWorkContractFixture);
      const expectedRefund = funding - guaranteedAmount;

      await contract.connect(worker).approveCompletion();
      await expect(contract.connect(worker).claimGuaranteed()).to.changeEtherBalances(
        [worker, client, contract],
        [guaranteedAmount, expectedRefund, -funding]
      );
      expect(await contract.getContractBalance()).to.equal(0);
    });

    it("Should refund the exact remainder when worker claims guaranteed", async function () {
      const { contract, client, worker, funding, guaranteedAmount } = await loadFixture(deployWorkContractFixture);
      const expectedRefund = funding - guaranteedAmount;

      await contract.connect(worker).approveCompletion();
      await expect(contract.connect(worker).claimGuaranteed()).to.changeEtherBalance(
        client,
        expectedRefund
      );
      expect(await contract.getContractBalance()).to.equal(0);
    });

    it("Should reject claimGuaranteed before the worker approves", async function () {
      const { contract, worker } = await loadFixture(deployWorkContractFixture);

      await expect(contract.connect(worker).claimGuaranteed()).to.be.revertedWith(
        "Worker has not approved"
      );
    });

    it("Should reject claimGuaranteed after the client has approved", async function () {
      const { contract, client, worker } = await loadFixture(deployWorkContractFixture);

      await contract.connect(client).approveCompletion();
      await contract.connect(worker).approveCompletion();
      await expect(contract.connect(worker).claimGuaranteed()).to.be.revertedWith(
        "Client has already approved"
      );
    });

    it("Should reject a guaranteed claim when force-fed ETH covers the balance but not the deposit", async function () {
      const { contract, worker, guaranteedAmount, funding } = await loadFixture(
        deployWorkContractFixture
      );
      const forced = ethers.parseEther("1");
      await setBalance(await contract.getAddress(), funding + forced);
      await setStorageAt(
        await contract.getAddress(),
        8n,
        guaranteedAmount - 1n
      );

      await contract.connect(worker).approveCompletion();
      await expect(contract.connect(worker).claimGuaranteed()).to.be.revertedWith(
        "Insufficient contract balance for guaranteed payment"
      );
      expect(await contract.isPaymentReleased()).to.equal(false);
      expect(await contract.getContractBalance()).to.equal(funding + forced);
    });
  });

  describe("Timeout Handling", function () {
    it("Should allow worker to claim after max deadline if client doesn't approve", async function () {
      const { contract, worker, funding } = await loadFixture(deployWorkContractFixture);

      const [, maxDeadline] = await contract.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);

      await expect(contract.connect(worker).workerClaimAfterDeadline()).to.changeEtherBalances(
        [worker, contract],
        [funding, -funding]
      );
      expect(await contract.getContractBalance()).to.equal(0);
    });

    it("Should allow client to claim after max deadline if worker doesn't approve", async function () {
      const { contract, client, funding } = await loadFixture(deployWorkContractFixture);

      const [, maxDeadline] = await contract.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);

      await expect(contract.connect(client).clientClaimAfterDeadline()).to.changeEtherBalances(
        [client, contract],
        [funding, -funding]
      );
      expect(await contract.getContractBalance()).to.equal(0);
    });

    it("Should prevent the client from claiming before the deadline", async function () {
      const { contract, client } = await loadFixture(deployWorkContractFixture);

      await expect(contract.connect(client).clientClaimAfterDeadline()).to.be.revertedWith(
        "Deadline not reached"
      );
    });

    it("Should reject the worker timeout claim when the timestamp equals maxDeadline", async function () {
      const { contract, worker } = await loadFixture(deployWorkContractFixture);
      const [, maxDeadline] = await contract.getDeadlines();
      await time.setNextBlockTimestamp(maxDeadline);

      await expect(contract.connect(worker).workerClaimAfterDeadline()).to.be.revertedWith(
        "Deadline not reached"
      );
    });

    it("Should reject the client timeout claim when the timestamp equals maxDeadline", async function () {
      const { contract, client } = await loadFixture(deployWorkContractFixture);
      const [, maxDeadline] = await contract.getDeadlines();
      await time.setNextBlockTimestamp(maxDeadline);

      await expect(contract.connect(client).clientClaimAfterDeadline()).to.be.revertedWith(
        "Deadline not reached"
      );
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

    it("Should reject claimGuaranteed from anyone but the worker", async function () {
      const { contract, client, thirdParty } = await loadFixture(deployWorkContractFixture);

      await expect(contract.connect(thirdParty).claimGuaranteed()).to.be.revertedWith(
        "Only worker can claim guaranteed payment"
      );
      await expect(contract.connect(client).claimGuaranteed()).to.be.revertedWith(
        "Only worker can claim guaranteed payment"
      );
    });

    it("Should reject deadline claims from the wrong role", async function () {
      const { contract, client, worker, thirdParty } = await loadFixture(deployWorkContractFixture);
      const [, maxDeadline] = await contract.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);

      await expect(contract.connect(thirdParty).workerClaimAfterDeadline()).to.be.revertedWith(
        "Only worker can claim after deadline"
      );
      await expect(contract.connect(client).workerClaimAfterDeadline()).to.be.revertedWith(
        "Only worker can claim after deadline"
      );
      await expect(contract.connect(thirdParty).clientClaimAfterDeadline()).to.be.revertedWith(
        "Only client can claim after deadline"
      );
      await expect(contract.connect(worker).clientClaimAfterDeadline()).to.be.revertedWith(
        "Only client can claim after deadline"
      );
    });

    it("Should block the worker timeout claim after the client has approved", async function () {
      const { contract, client, worker } = await loadFixture(deployWorkContractFixture);
      await contract.connect(client).approveCompletion();
      const [, maxDeadline] = await contract.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);

      await expect(contract.connect(worker).workerClaimAfterDeadline()).to.be.revertedWith(
        "Client has already approved"
      );
    });

    it("Should block the client timeout claim after the worker has approved", async function () {
      const { contract, client, worker } = await loadFixture(deployWorkContractFixture);
      await contract.connect(worker).approveCompletion();
      const [, maxDeadline] = await contract.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);

      await expect(contract.connect(client).clientClaimAfterDeadline()).to.be.revertedWith(
        "Worker has already approved"
      );
    });

    it("Should reject further claims after payment is released", async function () {
      const { contract, client, worker } = await loadFixture(deployWorkContractFixture);
      await contract.connect(worker).approveCompletion();
      await contract.connect(worker).claimGuaranteed();
      const [, maxDeadline] = await contract.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);

      await expect(contract.connect(worker).claimGuaranteed()).to.be.revertedWith(
        "Payment already released"
      );
      await expect(contract.connect(worker).workerClaimAfterDeadline()).to.be.revertedWith(
        "Payment already released"
      );
      await expect(contract.connect(client).clientClaimAfterDeadline()).to.be.revertedWith(
        "Payment already released"
      );
    });
  });

  describe("Constructor bounds", function () {
    it("Should reject funding below the contracted amount", async function () {
      const { worker, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const WorkContractFactory = await ethers.getContractFactory("WorkContract");

      await expect(
        WorkContractFactory.deploy(
          worker.address,
          hourlyRate,
          hoursRequired,
          guaranteedAmount,
          60 * 60 * 24 * 7,
          60 * 60 * 24 * 14,
          { value: funding - 1n }
        )
      ).to.be.revertedWith("Insufficient contract funding");
    });

    it("Should reject a guaranteed amount above the full payment", async function () {
      const { worker, hourlyRate, hoursRequired, funding } = await loadFixture(deployWorkContractFixture);
      const WorkContractFactory = await ethers.getContractFactory("WorkContract");

      await expect(
        WorkContractFactory.deploy(
          worker.address,
          hourlyRate,
          hoursRequired,
          funding + 1n,
          60 * 60 * 24 * 7,
          60 * 60 * 24 * 14,
          { value: funding + 1n }
        )
      ).to.be.revertedWith("Guaranteed exceeds full payment");
    });

    it("Should reject a worker address equal to the client", async function () {
      const { client, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const WorkContractFactory = await ethers.getContractFactory("WorkContract");

      await expect(
        WorkContractFactory.deploy(
          client.address,
          hourlyRate,
          hoursRequired,
          guaranteedAmount,
          60 * 60 * 24 * 7,
          60 * 60 * 24 * 14,
          { value: funding }
        )
      ).to.be.revertedWith("Worker cannot be client");
    });
  });

  describe("Rejected ETH transfers", function () {
    it("Should credit the client when a refund transfer is rejected", async function () {
      const { worker, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const RejectingPayer = await ethers.getContractFactory("RejectingPayer");
      const payer = await RejectingPayer.deploy();
      await payer.deploy(
        worker.address,
        hourlyRate,
        hoursRequired,
        guaranteedAmount,
        60 * 60 * 24 * 7,
        60 * 60 * 24 * 14,
        { value: funding }
      );
      const escrow = await ethers.getContractAt("WorkContract", await payer.escrow());
      const expectedRefund = funding - guaranteedAmount;

      await escrow.connect(worker).approveCompletion();
      await expect(escrow.connect(worker).claimGuaranteed()).to.changeEtherBalance(
        worker,
        guaranteedAmount
      );

      expect(await escrow.pendingWithdrawals(payer.target)).to.equal(expectedRefund);
      expect(await escrow.getContractBalance()).to.equal(expectedRefund);
      expect(await escrow.isPaymentReleased()).to.equal(true);
    });

    it("Should let a credited client withdraw the pending refund", async function () {
      const { worker, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const RejectingPayer = await ethers.getContractFactory("RejectingPayer");
      const payer = await RejectingPayer.deploy();
      await payer.deploy(
        worker.address,
        hourlyRate,
        hoursRequired,
        guaranteedAmount,
        60 * 60 * 24 * 7,
        60 * 60 * 24 * 14,
        { value: funding }
      );
      const escrow = await ethers.getContractAt("WorkContract", await payer.escrow());
      const expectedRefund = funding - guaranteedAmount;

      await escrow.connect(worker).approveCompletion();
      await escrow.connect(worker).claimGuaranteed();
      expect(await escrow.pendingWithdrawals(payer.target)).to.equal(expectedRefund);

      await payer.acceptPayments();
      await expect(payer.withdraw()).to.changeEtherBalances(
        [payer, escrow],
        [expectedRefund, -expectedRefund]
      );
      expect(await escrow.pendingWithdrawals(payer.target)).to.equal(0);
      expect(await escrow.getContractBalance()).to.equal(0);
    });

    it("Should credit a rejecting client on a deadline claim instead of reverting", async function () {
      const { worker, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const RejectingPayer = await ethers.getContractFactory("RejectingPayer");
      const payer = await RejectingPayer.deploy();
      await payer.deploy(
        worker.address,
        hourlyRate,
        hoursRequired,
        guaranteedAmount,
        60 * 60 * 24 * 7,
        60 * 60 * 24 * 14,
        { value: funding }
      );
      const escrow = await ethers.getContractAt("WorkContract", await payer.escrow());
      const [, maxDeadline] = await escrow.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);

      await payer.claimAfterDeadline();

      expect(await escrow.pendingWithdrawals(payer.target)).to.equal(funding);
      expect(await escrow.reservedWithdrawals()).to.equal(funding);
      expect(await escrow.isPaymentReleased()).to.equal(true);
      expect(await escrow.getContractBalance()).to.equal(funding);

      await payer.acceptPayments();
      await expect(payer.withdraw()).to.changeEtherBalances(
        [payer, escrow],
        [funding, -funding]
      );
      expect(await escrow.pendingWithdrawals(payer.target)).to.equal(0);
      expect(await escrow.reservedWithdrawals()).to.equal(0);
      expect(await escrow.getContractBalance()).to.equal(0);
    });

    it("Should reserve a rejecting worker's guaranteed amount and allow a later withdrawal", async function () {
      const { client, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const RejectingWorker = await ethers.getContractFactory("RejectingWorker");
      const rejectingWorker = await RejectingWorker.deploy();
      const WorkContractFactory = await ethers.getContractFactory("WorkContract");
      const escrow = await WorkContractFactory.connect(client).deploy(
        rejectingWorker.target,
        hourlyRate,
        hoursRequired,
        guaranteedAmount,
        60 * 60 * 24 * 7,
        60 * 60 * 24 * 14,
        { value: funding }
      );
      const expectedRefund = funding - guaranteedAmount;

      await rejectingWorker.approve(escrow.target);
      await expect(rejectingWorker.claimGuaranteed(escrow.target)).to.changeEtherBalance(
        client,
        expectedRefund
      );

      expect(await escrow.pendingWithdrawals(rejectingWorker.target)).to.equal(guaranteedAmount);
      expect(await escrow.getContractBalance()).to.equal(guaranteedAmount);

      await rejectingWorker.acceptPayments();
      await expect(rejectingWorker.withdraw(escrow.target)).to.changeEtherBalances(
        [rejectingWorker, escrow],
        [guaranteedAmount, -guaranteedAmount]
      );
      expect(await escrow.pendingWithdrawals(rejectingWorker.target)).to.equal(0);
      expect(await escrow.getContractBalance()).to.equal(0);
    });

    it("Should credit a rejecting worker on a deadline claim instead of reverting", async function () {
      const { client, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const RejectingWorker = await ethers.getContractFactory("RejectingWorker");
      const rejectingWorker = await RejectingWorker.deploy();
      const WorkContractFactory = await ethers.getContractFactory("WorkContract");
      const escrow = await WorkContractFactory.connect(client).deploy(
        rejectingWorker.target,
        hourlyRate,
        hoursRequired,
        guaranteedAmount,
        60 * 60 * 24 * 7,
        60 * 60 * 24 * 14,
        { value: funding }
      );
      const [, maxDeadline] = await escrow.getDeadlines();
      await time.increaseTo(maxDeadline + 1n);

      await rejectingWorker.claimAfterDeadline(escrow.target);

      expect(await escrow.pendingWithdrawals(rejectingWorker.target)).to.equal(funding);
      expect(await escrow.reservedWithdrawals()).to.equal(funding);
      expect(await escrow.isPaymentReleased()).to.equal(true);
      expect(await escrow.getContractBalance()).to.equal(funding);

      await rejectingWorker.acceptPayments();
      await expect(rejectingWorker.withdraw(escrow.target)).to.changeEtherBalances(
        [rejectingWorker, escrow],
        [funding, -funding]
      );
      expect(await escrow.pendingWithdrawals(rejectingWorker.target)).to.equal(0);
      expect(await escrow.reservedWithdrawals()).to.equal(0);
      expect(await escrow.getContractBalance()).to.equal(0);
    });

    it("Should leave forced ETH undistributed when both parties approve", async function () {
      const { client, worker, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const surplus = ethers.parseEther("0.03");
      const forced = ethers.parseEther("1");
      const WorkContractFactory = await ethers.getContractFactory("WorkContract");
      const overfunded = await WorkContractFactory.connect(client).deploy(
        worker.address,
        hourlyRate,
        hoursRequired,
        guaranteedAmount,
        60 * 60 * 24 * 7,
        60 * 60 * 24 * 14,
        { value: funding + surplus }
      );
      await setBalance(await overfunded.getAddress(), funding + surplus + forced);

      await overfunded.connect(client).approveCompletion();
      await expect(overfunded.connect(worker).approveCompletion()).to.changeEtherBalances(
        [worker, client, overfunded],
        [funding, surplus, -(funding + surplus)]
      );
      expect(await overfunded.getContractBalance()).to.equal(forced);
    });

    it("Should refund only the unreserved deposit when a rejecting worker claims guaranteed", async function () {
      const { client, hourlyRate, hoursRequired, guaranteedAmount, funding } =
        await loadFixture(deployWorkContractFixture);
      const forced = ethers.parseEther("1");
      const RejectingWorker = await ethers.getContractFactory("RejectingWorker");
      const rejectingWorker = await RejectingWorker.deploy();
      const WorkContractFactory = await ethers.getContractFactory("WorkContract");
      const escrow = await WorkContractFactory.connect(client).deploy(
        rejectingWorker.target,
        hourlyRate,
        hoursRequired,
        guaranteedAmount,
        60 * 60 * 24 * 7,
        60 * 60 * 24 * 14,
        { value: funding }
      );
      await setBalance(await escrow.getAddress(), funding + forced);
      const expectedRefund = funding - guaranteedAmount;

      await rejectingWorker.approve(escrow.target);
      await expect(rejectingWorker.claimGuaranteed(escrow.target)).to.changeEtherBalance(
        client,
        expectedRefund
      );

      expect(await escrow.pendingWithdrawals(rejectingWorker.target)).to.equal(guaranteedAmount);
      expect(await escrow.reservedWithdrawals()).to.equal(guaranteedAmount);
      expect(await escrow.getContractBalance()).to.equal(guaranteedAmount + forced);

      await rejectingWorker.acceptPayments();
      await expect(rejectingWorker.withdraw(escrow.target)).to.changeEtherBalance(
        rejectingWorker,
        guaranteedAmount
      );
      expect(await escrow.pendingWithdrawals(rejectingWorker.target)).to.equal(0);
      expect(await escrow.reservedWithdrawals()).to.equal(0);
      expect(await escrow.getContractBalance()).to.equal(forced);
    });
  });
}); 