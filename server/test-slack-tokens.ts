#!/usr/bin/env tsx

/**
 * Slack Token Validation Script
 * 
 * This script helps validate Slack tokens without starting the full application.
 * Run with: npx tsx server/test-slack-tokens.ts
 */

import { WebClient } from '@slack/web-api';

async function testSlackTokens() {
  console.log('🔧 Testing Slack Token Configuration...\n');
  
  const botToken = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const appLevelToken = process.env.SLACK_APP_LEVEL_TOKEN;
  
  // Check if tokens are present
  console.log('📋 Token Status:');
  console.log(`  SLACK_BOT_TOKEN: ${botToken ? '✅ Present' : '❌ Missing'}`);
  console.log(`  SLACK_SIGNING_SECRET: ${signingSecret ? '✅ Present' : '❌ Missing'}`);
  console.log(`  SLACK_APP_LEVEL_TOKEN: ${appLevelToken ? '✅ Present' : '❌ Missing'}`);
  
  console.log('\n');
  
  if (!botToken) {
    console.log('❌ SLACK_BOT_TOKEN is required. Please add it to your environment variables.');
    return false;
  }
  
  if (!signingSecret) {
    console.log('❌ SLACK_SIGNING_SECRET is required for webhook verification.');
    console.log('   Get it from: Settings > Basic Information > App Credentials > Signing Secret');
    return false;
  }
  
  // Test bot token
  console.log('🤖 Testing Bot Token...');
  try {
    const client = new WebClient(botToken);
    const auth = await client.auth.test();
    
    console.log(`✅ Bot Token Valid!`);
    console.log(`   Bot User ID: ${auth.user_id}`);
    console.log(`   Bot Name: ${auth.user}`);
    console.log(`   Team: ${auth.team}`);
    console.log(`   Team ID: ${auth.team_id}`);
    
    return true;
  } catch (error: any) {
    console.log(`❌ Bot Token Error: ${error.message}`);
    if (error.message.includes('invalid_auth')) {
      console.log('   The bot token appears to be invalid or expired.');
      console.log('   Please check your token from: Features > OAuth & Permissions > Bot User OAuth Token');
    }
    return false;
  }
}

async function testSlackConnection() {
  console.log('\n🔗 Testing Slack Connection...');
  
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    console.log('❌ Cannot test connection without bot token');
    return false;
  }
  
  try {
    const client = new WebClient(botToken);
    
    // Test basic API call
    const users = await client.users.list({ limit: 1 });
    console.log(`✅ API Connection successful! Found ${users.members?.length || 0} user(s)`);
    
    // Test channel list access
    const channels = await client.conversations.list({ 
      types: 'public_channel,private_channel',
      limit: 5 
    });
    console.log(`✅ Channel access successful! Found ${channels.channels?.length || 0} channel(s)`);
    
    return true;
  } catch (error: any) {
    console.log(`❌ Connection Error: ${error.message}`);
    if (error.message.includes('missing_scope')) {
      console.log('   Missing required OAuth scopes. Please add the following scopes:');
      console.log('   - channels:read');
      console.log('   - users:read');
      console.log('   - users:read.email');
    }
    return false;
  }
}

async function main() {
  console.log('🚀 Slack Token Validation Tool\n');
  console.log('This tool helps diagnose Slack integration issues.\n');
  
  const tokensValid = await testSlackTokens();
  
  if (tokensValid) {
    await testSlackConnection();
  }
  
  console.log('\n📝 Next Steps:');
  
  if (!process.env.SLACK_SIGNING_SECRET) {
    console.log('1. Add SLACK_SIGNING_SECRET to your environment variables');
    console.log('2. Get it from: https://api.slack.com/apps > Your App > Basic Information > Signing Secret');
  }
  
  if (!process.env.SLACK_APP_LEVEL_TOKEN) {
    console.log('3. Add SLACK_APP_LEVEL_TOKEN if using Socket Mode');
    console.log('4. Get it from: https://api.slack.com/apps > Your App > Basic Information > App-Level Tokens');
  }
  
  console.log('5. Restart the application after adding the missing tokens');
  console.log('6. Look for "⚡️ Slack app is running!" in the startup logs');
  
  console.log('\n📖 For detailed setup instructions, see: SLACK_SETUP_GUIDE.md');
}

if (require.main === module) {
  main().catch(console.error);
}