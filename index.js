#!/usr/bin/env node
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Function to decode the JWT payload (without verifying the signature)
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error decoding token:', error.message);
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
    console.log('📖 Reading tokens from token.txt...');
    const data = await fs.readFile(tokenFilePath, 'utf8');
    
    // Parse each line in the format "accountName:token"
    const lines = data.split('\n').map(line => line.trim()).filter(line => line);
    const accounts = lines.map((line, index) => {
      const [accountName, token] = line.split(':');
      if (!accountName || !token) {
        console.warn(`⚠️ Invalid format at line ${index + 1}: ${shortenToken(line)}`);
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
    
    console.log('✅ Parsed accounts:', accounts.map(acc => acc.account).join(', '));
    return accounts;
  } catch (error) {
    console.error('❌ Error reading token.txt:', error.message);
    throw error;
  }
}

async function collectDailyPointsForAccount(account, token) {
  try {
    console.log(`🔄 Processing ${account} (Token: ${shortenToken(token)})`);
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

    console.log(`📡 Sending check-in request for ${account}...`);
    const response = await axios.post(apiUrl, {}, { headers });

    if (response.data.error && (response.data.error.code === 'checkInAlready' || response.data.error.code === 'error.checkInAlready')) {
      console.log(`❌ ${account}: Check in already`);
    } else if (!response.data.data) {
      console.warn(`⚠️ ${account}: Check-in failed. Response:`, response.data);
    } else {
      console.log(`🎉 ${account}: Points collected successfully! Streak: ${response.data.data.currentStreak}`);
    }
  } catch (error) {
    if (error.response && error.response.data.error && (error.response.data.error.code === 'checkInAlready' || error.response.data.error.code === 'error.checkInAlready')) {
      console.log(`❌ ${account}: Check in already`);
    } else {
      console.error(`❌ ${account}: Error collecting points:`, error.response ? error.response.data : error.message);
    }
  }
}

async function collectDailyPoints() {
  try {
    const accounts = await getTokens();
    if (accounts.length === 0) {
      console.error('❌ No tokens found in token.txt');
      return;
    }
    for (let i = 0; i < accounts.length; i++) {
      const { account, token } = accounts[i];
      await collectDailyPointsForAccount(account, token);
      if (i < accounts.length - 1) {
        console.log(`➡️ Next account: ${accounts[i + 1].account}`);
      } else {
        console.log('🏁 All accounts processed.');
      }
      console.log('─'.repeat(40));
    }
  } catch (error) {
    console.error('❌ Failed to process accounts:', error.message);
  }
}

// Run the script
collectDailyPoints();