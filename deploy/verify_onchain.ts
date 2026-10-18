/**
 * ReserveCovenant On-Chain Verification Script.
 *
 * Fetches the deployed contract code from GenLayer Studio Devnet and proves
 * byte-for-byte equality with local contracts/reservecovenant.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { Address } from "viem";

async function verifyOnChain(): Promise<void> {
  console.log("=== ReserveCovenant On-Chain Contract Verification ===");

  // 1. Read local contract source
  const localContractPath = path.resolve(process.cwd(), "contracts/reservecovenant.py");
  if (!fs.existsSync(localContractPath)) {
    throw new Error(`Local contract not found at ${localContractPath}`);
  }
  const localSource = fs.readFileSync(localContractPath, "utf-8");
  const localSha256 = crypto.createHash("sha256").update(localSource).digest("hex");
  console.log(`[1] Local contract source path: ${localContractPath}`);
  console.log(`    Local source SHA-256:       ${localSha256}`);
  console.log(`    Local character count:      ${localSource.length}`);

  // 2. Resolve target contract address
  let targetAddress = process.env.CONTRACT_ADDRESS;
  if (!targetAddress) {
    const receiptPath = path.resolve(process.cwd(), "deploy/deployment_receipt.json");
    if (fs.existsSync(receiptPath)) {
      const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf-8"));
      targetAddress = receipt.contractAddress;
      console.log(`[2] Read contract address from ${receiptPath}: ${targetAddress}`);
    }
  }

  if (!targetAddress) {
    console.error("ERROR: No contract address provided.");
    console.error("Set CONTRACT_ADDRESS env variable or ensure deploy/deployment_receipt.json exists.");
    process.exit(1);
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(targetAddress) || targetAddress === "0x" + "0".repeat(40)) {
    console.error(`ERROR: Invalid or placeholder contract address: ${targetAddress}`);
    process.exit(1);
  }

  console.log(`[3] Target contract address: ${targetAddress}`);
  console.log(`    Target network:          ${studioDevnet.name} (Chain ID: ${studioDevnet.id})`);
  console.log(`    RPC Endpoint:            ${studioDevnet.rpcUrls.default.http[0]}`);

  // 3. Connect to GenLayer Studio Devnet
  const client = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
  });

  // 4. Fetch deployed contract code from blockchain
  console.log(`[4] Fetching on-chain contract code via gen_getContractCode...`);
  let onChainSource: string;
  try {
    onChainSource = await client.getContractCode(targetAddress as Address);
  } catch (err: any) {
    console.error(`Failed to fetch on-chain code for address ${targetAddress}:`, err.message || err);
    throw err;
  }

  if (!onChainSource || onChainSource.length === 0) {
    throw new Error(`No contract code returned for address ${targetAddress}`);
  }

  const onChainSha256 = crypto.createHash("sha256").update(onChainSource).digest("hex");
  console.log(`[5] On-chain source SHA-256:      ${onChainSha256}`);
  console.log(`    On-chain character count:     ${onChainSource.length}`);

  // 5. Byte-for-byte equality proof
  const localBuffer = Buffer.from(localSource, "utf-8");
  const onChainBuffer = Buffer.from(onChainSource, "utf-8");
  const isByteEqual = localBuffer.equals(onChainBuffer);

  console.log("----------------------------------------------------------------");
  if (isByteEqual && localSha256 === onChainSha256) {
    console.log(">>> VERIFICATION RESULT: PASS <<<");
    console.log("Byte-for-byte exact match verified between local file and on-chain contract code.");
    console.log(`Matching SHA-256: ${localSha256}`);
  } else {
    console.error(">>> VERIFICATION RESULT: FAILED (SOURCE MISMATCH) <<<");
    console.error(`Local SHA-256:    ${localSha256}`);
    console.error(`On-Chain SHA-256: ${onChainSha256}`);
    if (targetAddress.toLowerCase() === "0x8c34faa54238b777cde7e4373b267b0a6d0e4913") {
      console.warn("\n[HISTORICAL RECORD]");
      console.warn("Target address 0x8C34faA54238b777cDe7e4373B267b0A6d0E4913 is the known SUPERSEDED / NONCANONICAL deployment.");
      console.warn("It contains pre-repair source code (SHA-256: b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29).");
      console.warn("Local contracts/reservecovenant.py has been repaired (SHA-256: " + localSha256 + ").");
      console.warn("Redeployment is currently BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION.\n");
    }
    throw new Error("On-chain code does not match local contracts/reservecovenant.py");
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  verifyOnChain().catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
}

export { verifyOnChain };
