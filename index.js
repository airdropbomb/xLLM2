#!/usr/bin/env node
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const ethers = require('ethers'); // Add ethers.js for wallet operations

// Display Banner
function displayBanner() {
  const bannerWidth = 54;
  const line = '-'.repeat(bannerWidth);
  console.log(chalk.cyan(line));
  console.log(chalk.cyan('xLMM Auto Bot - Wallet-Based Claim'));
  console.log(chalk.cyan(line));
}

// Function to format date and time (YYYY-MM-DD HH:MM:SS)
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Function to shorten wallet address for display
function shortenAddress(address) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Function to read wallets from wallets.txt
async function getWallets() {
  try {
    const walletFilePath = path.join(__dirname, 'wallets.txt');
    console.log(chalk.yellow('📖 Reading wallets from wallets.txt...'));
    const data = await fs.readFile(walletFilePath, 'utf8');

    // Parse each line in the format "accountName:privateKey"
    const lines = data.split('\n').map(line => line.trim()).filter(line => line);
    const accounts = lines.map((line, index) => {
      const [accountName, privateKey] = line.split(':');
      if (!accountName || !privateKey) {
        console.warn(chalk.yellow(`⚠️ Invalid format at line ${index + 1}: ${line}`));
        return null;
      }
      try {
        const wallet = new ethers.Wallet(privateKey);
        return {
          account: accountName,
          walletAddress: wallet.address,
          privateKey
        };
      } catch (error) {
        console.error(chalk.red(`❌ Invalid private key for ${accountName}: ${error.message}`));
        return null;
      }
    }).filter(account => account !== null);

    console.log(chalk.green(`✅ Parsed wallets: ${accounts.map(acc => `${acc.account} (${shortenAddress(acc.walletAddress)})`).join(', ')}`));
    return accounts;
  } catch (error) {
    console.error(chalk.red(`❌ Error reading wallets.txt: ${error.message}`));
    throw error;
  }
}

// Function to sign a message with the wallet
async function signMessage(wallet, message) {
  try {
    const signature = await wallet.signMessage(message);
    return signature;
  } catch (error) {
    throw new Error(`Failed to sign message: ${error.message}`);
  }
}

// Function to perform check-in with wallet
async function collectDailyPointsForWallet(account, walletAddress, privateKey) {
  try {
    console.log(chalk.blue(`🔄 Processing ${account} (Wallet: ${shortenAddress(walletAddress)})`));
    const wallet = new ethers.Wallet(privateKey);

    // Example: Assume the API requires a signed message with a timestamp
    const message = `Check-in request for ${walletAddress} at ${Date.now()}`;
    const signature = await signMessage(wallet, message);

    // Hypothetical API endpoint for wallet-based check-in
    const apiUrl = 'https://api.xllm2.com/v1/check-in-with-wallet'; // Replace with actual endpoint
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6787.75 Safari/537.36',
    };
    const payload = {
      walletAddress,
      message,
      signature
    };

    console.log(chalk.cyan(`📡 Sending check-in request for ${account}...`));
    const response = await axios.post(apiUrl, payload, { headers });

    if (response.data.error && (response.data.error.code === 'checkInAlready' || response.data.error.code === 'error.checkInAlready')) {
      console.log(chalk.red(`❌ ${account}: Check in already`));
    } else if (!response.data.data) {
      console.warn(chalk.yellow(`⚠️ ${account}: Check-in failed. Response:`, response.data));
    } else {
      console.log(chalk.green.bold(`🎉 ${account}: Points collected successfully! Streak: ${response.data.data.currentStreak}`));
    }
  } catch (error) {
    if (error.response && error.response.data.error && (error.response.data.error.code === 'checkInAlready' || error.response.data.error.code === 'error.checkInAlready')) {
      console.log(chalk.red(`❌ ${account}: Check in already`));
    } else {
      console.error(chalk.red(`❌ ${account}: Error collecting points:`, error.response ? error.response.data : error.message));
    }
  }
}

async function collectDailyPoints() {
  try {
    // Display banner at the start
    displayBanner();

    const accounts = await getWallets();
    if (accounts.length === 0) {
      console.error(chalk.red('❌ No wallets found in wallets.txt'));
      return;
    }
    for (let i = 0; i < accounts.length; i++) {
      const { account, walletAddress, privateKey } = accounts[i];
      await collectDailyPointsForWallet(account, walletAddress, privateKey);
      if (i < accounts.length - 1) {
        console.log(chalk.yellowBright(`➡️ Next account: ${accounts[i + 1].account}`));
      } else {
        console.log(chalk.green('🏁 All accounts processed.'));
      }
      console.log(chalk.gray('─'.repeat(40)));
    }
  } catch (error) {
    console.error(chalk.red(`❌ Failed to process accounts: ${error.message}`));
  }
}

// Function to start the 24-hour countdown timer
function startCountdown() {
  const durationMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const endTime = Date.now() + durationMs;
  const nextExecutionDate = new Date(endTime);

  const interval = setInterval(() => {
    const remainingMs = endTime - Date.now();
    if (remainingMs <= 0) {
      clearInterval(interval);
      console.log(chalk.green('⏰ Countdown finished! Starting next daily points collection...'));
      collectDailyPoints().then(() => startCountdown()); // Run again after completion
    } else {
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
      process.stdout.write(
        `\r${chalk.cyan('⏰ Next execution at: ')}${chalk.cyan.bold(
          formatDateTime(nextExecutionDate)
        )} ${chalk.cyan('(in ')}${chalk.cyan.bold(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        )}${chalk.cyan(')')}`
      );
    }
  }, 1000);
}

// Run the script and start the countdown
collectDailyPoints().then(() => startCountdown());
