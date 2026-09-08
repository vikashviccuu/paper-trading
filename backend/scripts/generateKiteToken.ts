import fs from "fs";
import path from "path";
import readline from "readline";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { KiteConnect } = require("kiteconnect");
import { env } from "../src/config/env";

const KITE_API_KEY = process.env.KITE_API_KEY || env.KITE_API_KEY || "jfwd2gvwal8pq0rp";
const KITE_API_SECRET = process.env.KITE_API_SECRET || env.KITE_API_SECRET || "a5j4kdo7zr2u57zfpjan8plmctdjun4t";

async function main() {
  console.log("==================================================");
  console.log("      Zerodha Kite Access Token Generator         ");
  console.log("==================================================");
  console.log(`API Key   : ${KITE_API_KEY}`);
  console.log(`API Secret: ${KITE_API_SECRET.slice(0, 4)}...${KITE_API_SECRET.slice(-4)}`);
  console.log("--------------------------------------------------");

  let requestToken = process.argv[2];

  if (requestToken === "--help" || requestToken === "-h") {
    console.log("\nUsage:");
    console.log("  npm run generate-kite-token                      (interactive prompt)");
    console.log("  npm run generate-kite-token -- <request_token>   (pass token directly)");
    console.log(`\nLogin URL:\n  https://kite.zerodha.com/connect/login?api_key=${KITE_API_KEY}&v=3\n`);
    process.exit(0);
  }

  if (!requestToken) {
    const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${KITE_API_KEY}&v=3`;
    console.log("\nStep 1: Open the following Login URL in your browser:\n");
    console.log(`  ${loginUrl}\n`);
    console.log("Step 2: Log in to Zerodha and authorize the app.");
    console.log("Step 3: Copy the 'request_token' parameter from the redirected URL.");
    console.log("        (e.g. http://localhost:5174/?request_token=YOUR_REQUEST_TOKEN...)\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    requestToken = await new Promise<string>((resolve) => {
      rl.question("Enter the request_token: ", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  if (!requestToken) {
    console.error("Error: No request_token provided.");
    process.exit(1);
  }

  console.log(`\nExchanging request_token (${requestToken.slice(0, 8)}...) for access_token...`);

  try {
    const kc = new KiteConnect({ api_key: KITE_API_KEY });
    const session = await kc.generateSession(requestToken, KITE_API_SECRET);
    const accessToken = session.access_token;

    console.log("\nSuccess! Access Token generated:");
    console.log(`KITE_ACCESS_TOKEN=${accessToken}\n`);

    // Update process.env
    process.env.KITE_ACCESS_TOKEN = accessToken;
    process.env.KITE_API_KEY = KITE_API_KEY;
    process.env.KITE_API_SECRET = KITE_API_SECRET;

    // Update .env file in backend directory
    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

    const updateOrAppend = (content: string, key: string, value: string): string => {
      const regex = new RegExp(`^${key}=.*`, "m");
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${value}`);
      } else {
        return content + (content.endsWith("\n") || content === "" ? "" : "\n") + `${key}=${value}\n`;
      }
    };

    envContent = updateOrAppend(envContent, "KITE_API_KEY", KITE_API_KEY);
    envContent = updateOrAppend(envContent, "KITE_API_SECRET", KITE_API_SECRET);
    envContent = updateOrAppend(envContent, "KITE_ACCESS_TOKEN", accessToken);

    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("Updated backend/.env with KITE_ACCESS_TOKEN.");

    // Test token validity with Zerodha API
    kc.setAccessToken(accessToken);
    try {
      const profile = await kc.getProfile();
      console.log(`Verified with Zerodha! User ID: ${profile.user_id}, Name: ${profile.user_name}`);
    } catch (testErr: any) {
      console.log(`Token saved, but profile test warning: ${testErr.message}`);
    }
  } catch (err: any) {
    console.error("Failed to generate access token:", err.message || err);
    process.exit(1);
  }
}

main();
