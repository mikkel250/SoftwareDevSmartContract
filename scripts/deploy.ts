import { ethers } from "hardhat";
import { parseUnits } from "ethers";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Example parameters (replace with your actual values)
  const worker = "0x3cf8EA9C90559982824de436D25EB98f55d646A4"; // the person performing the work's wallet address
  const hourlyRate = parseUnits("0.001", "ether");
  const hoursRequired = 2;
  const guaranteedAmount = parseUnits("0.001", "ether");
  const idealDuration = 3600; // 1 hour in seconds
  const maxDuration = 7200;   // 2 hours in seconds

  const WorkContract = await ethers.getContractFactory("WorkContract");
  const contract = await WorkContract.deploy(
    worker,
    hourlyRate,
    hoursRequired,
    guaranteedAmount,
    idealDuration,
    maxDuration,
    { value: hourlyRate * BigInt(hoursRequired) } // initial funding
  );

  console.log("WorkContract deployed to:", contract.target);
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});