#!/bin/bash
# Helper script to wrap remaining Slack API calls with rate limiting

# This script helps identify all Slack API calls that need to be wrapped
# We'll manually wrap them using the Edit tool

echo "Finding all Slack API calls in actions.ts..."
grep -n "await client\.\(views\.open\|chat\.postMessage\)" /home/user/SynergyVAHouse/server/slack/actions.ts

echo ""
echo "Finding all Slack API calls in commands.ts..."
grep -n "await client\.\(views\.open\|chat\.postMessage\)" /home/user/SynergyVAHouse/server/slack/commands.ts
