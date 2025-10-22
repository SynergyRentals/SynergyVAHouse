#!/usr/bin/env tsx
/**
 * Script to generate OpenAPI spec file
 * Run with: npm run generate-openapi
 */

import { generateOpenApiSpec } from '../server/swagger';

console.log('🔨 Generating OpenAPI specification...');

try {
  generateOpenApiSpec();
  console.log('✅ OpenAPI spec generated successfully!');
  process.exit(0);
} catch (error) {
  console.error('❌ Failed to generate OpenAPI spec:', error);
  process.exit(1);
}
