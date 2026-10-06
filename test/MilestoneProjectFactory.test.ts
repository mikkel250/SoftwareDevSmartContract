import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const DAY = 24n * 60n * 60n;

describe("MilestoneProjectFactory", function () {
  async function factoryFixture() {
    const [developer, client, otherClient, thirdParty] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const MockNoReturnERC20 = await ethers.getContractFactory("MockNoReturnERC20");
    const wbtc = await MockERC20.deploy("Mock WBTC", "WBTC", 8);
    const usdt = await MockNoReturnERC20.deploy("Mock USDT", "USDT", 6);
    const usdc = await MockERC20.deploy("Mock USDC", "USDC", 6);
    const usds = await MockERC20.deploy("Mock USDS", "USDS", 18);
    const tokens = [wbtc, usdt, usdc, usds];
    const tokenAddresses = await Promise.all(tokens.map((t) => t.getAddress()));

    const Factory = await ethers.getContractFactory("MilestoneProjectFactory");
    const factory = await Factory.deploy(tokenAddresses[0], tokenAddresses[1], tokenAddresses[2], tokenAddresses[3]);
    const projectErrors = await ethers.getContractFactory("MilestoneProject");

    return { factory, projectErrors, developer, client, otherClient, thirdParty, tokenAddresses };
  }

  async function create(
    factory: Awaited<ReturnType<typeof factoryFixture>>["factory"],
    signer: Awaited<ReturnType<typeof ethers.getSigners>>[number],
    client: string,
    asset = ethers.ZeroAddress
  ) {
    const tx = await factory
      .connect(signer)
      .createProject(client, asset, 100n, [1_000n, 2_000n], [DAY, 2n * DAY]);
    const receipt = await tx.wait();
    const log = receipt!.logs
      .map((l) => factory.interface.parseLog(l))
      .find((l) => l?.name === "ProjectCreated");
    return log!.args.project as string;
  }

  describe("Allowlist", function () {
    it("creates a project in each of the five assets, and the project reports that asset", async function () {
      const { factory, developer, client, tokenAddresses } = await loadFixture(factoryFixture);
      for (const asset of [ethers.ZeroAddress, ...tokenAddresses]) {
        const projectAddress = await create(factory, developer, client.address, asset);
        const project = await ethers.getContractAt("MilestoneProject", projectAddress);
        expect(await project.asset()).to.equal(asset);
        expect(await project.developer()).to.equal(developer.address);
        expect(await project.client()).to.equal(client.address);
        expect(await project.factory()).to.equal(await factory.getAddress());
      }
      expect(await factory.allowedAssets()).to.deep.equal([ethers.ZeroAddress, ...tokenAddresses]);
    });

    it("rejects an unlisted token", async function () {
      const { factory, developer, client } = await loadFixture(factoryFixture);
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const other = await MockERC20.deploy("Other", "OTH", 18);
      await expect(
        factory.connect(developer).createProject(client.address, await other.getAddress(), 100n, [1n], [DAY])
      ).to.be.revertedWithCustomError(factory, "AssetNotAllowed");
    });

    it("rejects a zero or duplicate token address at deployment", async function () {
      const { tokenAddresses } = await loadFixture(factoryFixture);
      const Factory = await ethers.getContractFactory("MilestoneProjectFactory");
      const [a, b, c, d] = tokenAddresses;

      await expect(Factory.deploy(ethers.ZeroAddress, b, c, d)).to.be.revertedWithCustomError(Factory, "InvalidToken");
      await expect(Factory.deploy(a, b, c, ethers.ZeroAddress)).to.be.revertedWithCustomError(Factory, "InvalidToken");
      await expect(Factory.deploy(a, a, c, d)).to.be.revertedWithCustomError(Factory, "InvalidToken");
      await expect(Factory.deploy(a, b, c, b)).to.be.revertedWithCustomError(Factory, "InvalidToken");
      await expect(Factory.deploy(a, b, d, d)).to.be.revertedWithCustomError(Factory, "InvalidToken");
    });
  });

  describe("Creation bounds", function () {
    it("rejects a client equal to the caller or the zero address", async function () {
      const { factory, projectErrors, developer } = await loadFixture(factoryFixture);
      await expect(
        factory.connect(developer).createProject(developer.address, ethers.ZeroAddress, 100n, [1n], [DAY])
      ).to.be.revertedWithCustomError(projectErrors, "InvalidClient");
      await expect(
        factory.connect(developer).createProject(ethers.ZeroAddress, ethers.ZeroAddress, 100n, [1n], [DAY])
      ).to.be.revertedWithCustomError(projectErrors, "InvalidClient");
    });

    it("rejects bad milestone lists", async function () {
      const { factory, projectErrors, developer, client } = await loadFixture(factoryFixture);
      const c = factory.connect(developer);
      const eth = ethers.ZeroAddress;
      const many = Array.from({ length: 51 }, () => 1n);

      await expect(c.createProject(client.address, eth, 100n, [], [])).to.be.revertedWithCustomError(
        projectErrors,
        "InvalidMilestoneCount"
      );
      await expect(
        c.createProject(client.address, eth, 100n, many, many.map(() => DAY))
      ).to.be.revertedWithCustomError(projectErrors, "InvalidMilestoneCount");
      await expect(c.createProject(client.address, eth, 100n, [1n, 2n], [DAY])).to.be.revertedWithCustomError(
        projectErrors,
        "LengthMismatch"
      );
      await expect(c.createProject(client.address, eth, 100n, [1n, 0n], [DAY, DAY])).to.be.revertedWithCustomError(
        projectErrors,
        "InvalidAmount"
      );
      await expect(c.createProject(client.address, eth, 100n, [1n], [0n])).to.be.revertedWithCustomError(
        projectErrors,
        "InvalidWindow"
      );
      await expect(c.createProject(client.address, eth, 100n, [1n], [366n * DAY])).to.be.revertedWithCustomError(
        projectErrors,
        "InvalidWindow"
      );
    });

    it("accepts the 50-milestone and 365-day limits", async function () {
      const { factory, developer, client } = await loadFixture(factoryFixture);
      const fifty = Array.from({ length: 50 }, () => 1n);
      await expect(
        factory
          .connect(developer)
          .createProject(client.address, ethers.ZeroAddress, 100n, fifty, fifty.map(() => 365n * DAY))
      ).to.emit(factory, "ProjectCreated");
    });

    it("rejects a zero deposit", async function () {
      const { factory, projectErrors, developer, client } = await loadFixture(factoryFixture);
      await expect(
        factory.connect(developer).createProject(client.address, ethers.ZeroAddress, 0n, [1n], [DAY])
      ).to.be.revertedWithCustomError(projectErrors, "InvalidAmount");
    });
  });

  describe("Registry", function () {
    it("emits the project, developer, client, and asset on creation", async function () {
      const { factory, developer, client, tokenAddresses } = await loadFixture(factoryFixture);
      const tx = factory
        .connect(developer)
        .createProject(client.address, tokenAddresses[2], 100n, [1n], [DAY]);
      await expect(tx)
        .to.emit(factory, "ProjectCreated")
        .withArgs((p: string) => ethers.isAddress(p), developer.address, client.address, tokenAddresses[2]);
    });

    it("lists each project for both the developer and the client, in creation order", async function () {
      const { factory, developer, client, otherClient } = await loadFixture(factoryFixture);
      const first = await create(factory, developer, client.address);
      const second = await create(factory, developer, otherClient.address);
      const third = await create(factory, otherClient, client.address);

      expect(await factory.projectCount(developer.address)).to.equal(2n);
      expect(await factory.projectsOf(developer.address, 0, 10)).to.deep.equal([first, second]);
      expect(await factory.projectsOf(client.address, 0, 10)).to.deep.equal([first, third]);
      expect(await factory.projectsOf(otherClient.address, 0, 10)).to.deep.equal([second, third]);
    });

    it("pages a client's list by offset and limit", async function () {
      const { factory, developer, client } = await loadFixture(factoryFixture);
      const created: string[] = [];
      for (let i = 0; i < 5; i++) {
        created.push(await create(factory, developer, client.address));
      }

      expect(await factory.projectCount(client.address)).to.equal(5n);
      expect(await factory.projectsOf(client.address, 2, 2)).to.deep.equal([created[2], created[3]]);
      expect(await factory.projectsOf(client.address, 4, 10)).to.deep.equal([created[4]]);
      expect(await factory.projectsOf(client.address, 5, 2)).to.deep.equal([]);
      expect(await factory.projectsOf(client.address, 99, 2)).to.deep.equal([]);
      expect(await factory.projectsOf(client.address, 0, 0)).to.deep.equal([]);
      expect(await factory.projectsOf(client.address, 3, ethers.MaxUint256)).to.deep.equal([created[3], created[4]]);
    });

    it("reports isProject only for factory-created projects", async function () {
      const { factory, developer, client } = await loadFixture(factoryFixture);
      const created = await create(factory, developer, client.address);
      const MilestoneProject = await ethers.getContractFactory("MilestoneProject");
      const direct = await MilestoneProject.deploy(
        developer.address,
        client.address,
        ethers.ZeroAddress,
        100n,
        [1n],
        [DAY]
      );

      expect(await factory.isProject(created)).to.equal(true);
      expect(await factory.isProject(await direct.getAddress())).to.equal(false);
      expect(await factory.isProject(developer.address)).to.equal(false);
    });

    it("lets a factory-created project run through the start lock", async function () {
      const { factory, developer, client } = await loadFixture(factoryFixture);
      const project = await ethers.getContractAt("MilestoneProject", await create(factory, developer, client.address));
      await expect(
        project.connect(client).startLock(100n, 1_000n, DAY, { value: 1_100n })
      ).to.changeEtherBalance(developer, 100n);
    });
  });
});
