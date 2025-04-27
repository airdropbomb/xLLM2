#!/usr/bin/env node
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

// Display Banner
function displayBanner() {
  const bannerWidth = 54;
  const line = '-'.repeat(bannerWidth);
  console.log(chalk.cyan(line));
  console.log(chalk.cyan('xLMM Auto Bot - ADB NODE'));
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

// Function to decode the JWT payload (without verifying the signature)
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error(chalk.red(`Error decoding token: ${error.message}`));
    return {};
  }
}

// Function to shorten token for display
function shortenToken(token) {
  if (token.length <= 20) return token;
  return `${token.slice(0, 10)}...${token.slice(-10)}`;
}

async function getTokens() {
  try {
    const tokenFilePath = path.join(__dirname, 'token.txt');
    console.log(chalk.yellow('📖 Reading tokens from token.txt...'));
    const data = await fs.readFile(tokenFilePath, 'utf8');
    
    // Parse each line in the format "accountName:token"
    const lines = data.split('\n').map(line => line.trim()).filter(line => line);
    const accounts = lines.map((line, index) => {
      const [accountName, token] = line.split(':');
      if (!accountName || !token) {
        console.warn(chalk.yellow(`⚠️ Invalid format at line ${index + 1}: ${shortenToken(line)}`));
        return {
          account: `Account ${index + 1}`,
          token: line
        };
      }
      const decoded = decodeToken(token);
      return {
        account: `${accountName} (userId: ${decoded.userId || 'unknown'})`,
        token
      };
    });
    
    console.log(chalk.green(`✅ Parsed accounts: ${accounts.map(acc => acc.account).join(', ')}`));
    return accounts;
  } catch (error) {
    console.error(chalk.red(`❌ Error reading token.txt: ${error.message}`));
    throw error;
  }
}

async function collectDailyPointsForAccount(account, token) {
  try {
    console.log(chalk.blue(`🔄 Processing ${account} (Token: ${shortenToken(token)})`));
    const cleanedToken = token.replace(/[^A-Za-z0-9-._~+/=]/g, '');
    if (!cleanedToken) {
      throw new Error(`Token for ${account} is empty after cleaning`);
    }

    const apiUrl = 'https://api.xllm2.com/v1/check-in';
    const headers = {
      'Authorization': `Bearer ${cleanedToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6787.75 Safari/537.36',
    };

    console.log(chalk.cyan(`📡 Sending check-in request for ${account}...`));
    const response = await axios.post(apiUrl, {}, { headers });

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
    
    const accounts = await getTokens();
    if (accounts.length === 0) {
      console.error(chalk.red('❌ No tokens found in token.txt'));
      return;
    }
    for (let i = 0; i < accounts.length; i++) {
      const { account, token } = accounts[i];
      await collectDailyPointsForAccount(account, token);
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
