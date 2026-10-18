/**
 * Smoke Read Script for ReserveCovenant on GenLayer Studio Devnet.
 *
 * Reads public views from the deployed contract.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { Address } from "viem";

async function main(): Promise<void> {
  console.log("=== ReserveCovenant Smoke Read ===");

  const receiptPath = path.resolve(process.cwd(), "deploy/deployment_receipt.json");
  if (!fs.existsSync(receiptPath)) {
    throw new Error(`Receipt not found at ${receiptPath}`);
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf-8"));
  const contractAddress = receipt.contractAddress as Address;
  console.log(`Contract address: ${contractAddress}`);

  const client = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
  });

  const config = await client.readContract({
    address: contractAddress,
    functionName: "get_config",
    args: [],
  });
  console.log("get_config():", JSON.stringify(config, null, 2));

  const status = await client.readContract({
    address: contractAddress,
    functionName: "get_current_status",
    args: [],
  });
  console.log("get_current_status():", status);

  const accounting = await client.readContract({
    address: contractAddress,
    functionName: "get_accounting",
    args: [],
  });
  console.log("get_accounting():", JSON.stringify(accounting, null, 2));

  console.log("=== Smoke Read Complete: SUCCESS ===");
}

main().catch((err) => {
  console.error("Smoke read failed:", err);
  process.exit(1);
});
