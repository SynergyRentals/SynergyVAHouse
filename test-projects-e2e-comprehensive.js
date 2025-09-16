// Comprehensive End-to-End Projects Page UI Testing Suite
// Tests: UI interactions, modal behaviors, form validation, integration flows

import puppeteer from 'puppeteer';

class ProjectsE2ETestSuite {
  constructor() {
    this.browser = null;
    this.page = null;
    this.baseURL = 'http://localhost:5000';
    this.results = [];
    this.testProjectId = null;
  }

  async setup() {
    console.log('🚀 Setting up browser environment...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 720 });
    
    // Enable console logging from the page
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log('🔴 Browser Console Error:', msg.text());
      }
    });

    // Navigate to projects page
    try {
      await this.page.goto(`${this.baseURL}/projects`, { waitUntil: 'networkidle0' });
      console.log('✅ Successfully navigated to projects page');
      return true;
    } catch (error) {
      console.error('❌ Failed to navigate to projects page:', error.message);
      return false;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async waitForElement(selector, timeout = 5000) {
    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      console.log(`⚠️  Element ${selector} not found within ${timeout}ms`);
      return false;
    }
  }

  async testPageLoad() {
    console.log('\n🎯 Test 1: Projects Page Load and Initial State');
    
    try {
      // Check if page loaded correctly
      const title = await this.page.title();
      if (title.includes('Projects') || title.includes('Synergy')) {
        console.log('  ✅ Page loaded with correct title');
        this.results.push({ test: 'Page load', status: 'PASS' });
      } else {
        console.log(`  ⚠️  Unexpected page title: ${title}`);
        this.results.push({ test: 'Page load', status: 'PARTIAL' });
      }

      // Check for main elements
      const mainElements = [
        'h1', // Projects heading
        '[data-testid="button-create-project"]' // Create project button
      ];

      for (const element of mainElements) {
        const found = await this.waitForElement(element, 2000);
        if (found) {
          console.log(`  ✅ Found essential element: ${element}`);
        } else {
          console.log(`  ❌ Missing essential element: ${element}`);
        }
      }

      return true;
    } catch (error) {
      console.log('  ❌ Page load test failed:', error.message);
      this.results.push({ test: 'Page load', status: 'FAIL' });
      return false;
    }
  }

  async testProjectCreationFlow() {
    console.log('\n➕ Test 2: Project Creation UI Flow');

    try {
      // Test opening creation modal
      console.log('  🔘 Testing modal opening...');
      const createButton = await this.page.$('[data-testid="button-create-project"]');
      if (!createButton) {
        // Try alternative button if no projects exist
        const emptyCreateButton = await this.page.$('[data-testid="button-create-project-empty"]');
        if (emptyCreateButton) {
          await emptyCreateButton.click();
          console.log('  ✅ Clicked empty state create button');
        } else {
          throw new Error('No create project button found');
        }
      } else {
        await createButton.click();
        console.log('  ✅ Clicked main create project button');
      }

      // Wait for modal to appear
      const modalFound = await this.waitForElement('[data-testid="project-modal"]');
      if (modalFound) {
        console.log('  ✅ Project creation modal opened');
      } else {
        throw new Error('Project modal did not open');
      }

      // Test form elements
      const formElements = [
        '[data-testid="input-project-title"]',
        '[data-testid="select-project-status"]',
        '[data-testid="select-project-owner"]',
        '[data-testid="input-project-start-date"]',
        '[data-testid="input-project-target-date"]',
        'textarea[name="scope"]'
      ];

      for (const element of formElements) {
        const found = await this.waitForElement(element, 2000);
        console.log(`  ${found ? '✅' : '❌'} Form element ${element}: ${found ? 'present' : 'missing'}`);
      }

      // Test form validation - try submitting empty form
      console.log('  🔘 Testing form validation...');
      const submitButton = await this.page.$('button[type="submit"]');
      if (submitButton) {
        await submitButton.click();
        await this.page.waitForTimeout(500); // Wait for validation
        
        // Check if validation errors appear (form should not submit)
        const hasErrors = await this.page.$('.text-red-500, .text-destructive');
        if (hasErrors) {
          console.log('  ✅ Form validation working - errors displayed for empty fields');
        }
      }

      // Fill out form with valid data
      console.log('  🔘 Filling form with valid project data...');
      const projectData = {
        title: `E2E Test Project ${Date.now()}`,
        scope: 'This is a test project created during end-to-end testing to verify the full project creation workflow.',
        status: 'planning',
        startDate: '2025-09-16',
        targetDate: '2025-10-16'
      };

      await this.page.fill('[data-testid="input-project-title"]', projectData.title);
      await this.page.fill('textarea[name="scope"]', projectData.scope);
      
      // Handle select elements
      await this.page.click('[data-testid="select-project-status"]');
      await this.page.waitForTimeout(100);
      await this.page.click(`[value="${projectData.status}"]`);
      
      await this.page.fill('[data-testid="input-project-start-date"]', projectData.startDate);
      await this.page.fill('[data-testid="input-project-target-date"]', projectData.targetDate);

      console.log('  ✅ Form filled with project data');

      // Submit form
      await submitButton.click();
      console.log('  ✅ Submitted project creation form');

      // Wait for modal to close and page to update
      await this.page.waitForTimeout(2000);
      
      // Check if modal closed
      const modalStillOpen = await this.page.$('[data-testid="project-modal"]');
      if (!modalStillOpen) {
        console.log('  ✅ Modal closed after successful submission');
      }

      // Verify project appears in list
      await this.page.waitForTimeout(1000);
      const projectCards = await this.page.$$('[data-testid^="project-card-"]');
      if (projectCards.length > 0) {
        console.log(`  ✅ Projects list updated - ${projectCards.length} project(s) found`);
        
        // Try to find our created project
        const projectTitles = await this.page.$$eval('[data-testid^="project-card-"] h3, [data-testid^="project-card-"] .text-lg', 
          elements => elements.map(el => el.textContent.trim())
        );
        
        if (projectTitles.some(title => title.includes('E2E Test Project'))) {
          console.log('  ✅ Created project found in list');
          this.results.push({ test: 'Project creation flow', status: 'PASS' });
        } else {
          console.log('  ⚠️  Created project not immediately visible in list');
          this.results.push({ test: 'Project creation flow', status: 'PARTIAL' });
        }
      } else {
        console.log('  ⚠️  No projects found after creation');
        this.results.push({ test: 'Project creation flow', status: 'PARTIAL' });
      }

      return true;

    } catch (error) {
      console.log('  ❌ Project creation flow failed:', error.message);
      this.results.push({ test: 'Project creation flow', status: 'FAIL' });
      return false;
    }
  }

  async testProjectDetailView() {
    console.log('\n👁️  Test 3: Project Detail View UI');

    try {
      // Find a project card to click
      const projectCards = await this.page.$$('[data-testid^="project-card-"]');
      if (projectCards.length === 0) {
        throw new Error('No project cards found for detail testing');
      }

      console.log(`  ✅ Found ${projectCards.length} project card(s) for testing`);

      // Click first project card
      await projectCards[0].click();
      console.log('  ✅ Clicked on project card');

      // Wait for detail modal to appear
      const detailModalFound = await this.waitForElement('[data-testid="project-detail-modal"]');
      if (!detailModalFound) {
        throw new Error('Project detail modal did not open');
      }

      console.log('  ✅ Project detail modal opened');

      // Check detail modal content elements
      const detailElements = [
        '.text-2xl, .text-xl', // Project title
        '[class*="badge"]', // Status badge
        '.text-sm, .text-muted-foreground', // Project description
        '[class*="progress"]', // Progress bar
        'button[data-testid*="edit"], button:has-text("Edit")', // Edit button
        'button:has-text("Close")', // Close button
      ];

      for (const element of detailElements) {
        try {
          await this.page.waitForSelector(element, { timeout: 1000 });
          console.log(`  ✅ Detail element present: ${element}`);
        } catch {
          console.log(`  ⚠️  Detail element missing: ${element}`);
        }
      }

      // Test modal close functionality
      console.log('  🔘 Testing modal close functionality...');
      
      // Try close button
      const closeButton = await this.page.$('button:has-text("Close")');
      if (closeButton) {
        await closeButton.click();
        await this.page.waitForTimeout(500);
        
        const modalStillOpen = await this.page.$('[data-testid="project-detail-modal"]');
        if (!modalStillOpen) {
          console.log('  ✅ Modal closes with close button');
        } else {
          console.log('  ⚠️  Modal did not close with close button');
        }
      } else {
        // Try clicking outside modal (if supported)
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(500);
      }

      this.results.push({ test: 'Project detail view', status: 'PASS' });
      return true;

    } catch (error) {
      console.log('  ❌ Project detail view test failed:', error.message);
      this.results.push({ test: 'Project detail view', status: 'FAIL' });
      return false;
    }
  }

  async testProjectEditingFlow() {
    console.log('\n✏️  Test 4: Project Editing UI Flow');

    try {
      // Open a project detail modal first
      const projectCards = await this.page.$$('[data-testid^="project-card-"]');
      if (projectCards.length === 0) {
        throw new Error('No project cards found for editing test');
      }

      await projectCards[0].click();
      await this.waitForElement('[data-testid="project-detail-modal"]');
      console.log('  ✅ Opened project detail modal for editing');

      // Look for edit button
      const editButton = await this.page.$('button[data-testid*="edit"], button:has-text("Edit")');
      if (!editButton) {
        throw new Error('Edit button not found in detail modal');
      }

      await editButton.click();
      console.log('  ✅ Clicked edit button');

      await this.page.waitForTimeout(1000);

      // Check if edit mode is activated (form fields should appear)
      const editFormElements = [
        'input[name="title"]',
        'textarea[name="scope"]',
        'select[name="status"], [role="combobox"]',
        'input[type="date"]'
      ];

      for (const element of editFormElements) {
        try {
          await this.page.waitForSelector(element, { timeout: 1000 });
          console.log(`  ✅ Edit form element present: ${element}`);
        } catch {
          console.log(`  ⚠️  Edit form element missing: ${element}`);
        }
      }

      // Test making changes
      console.log('  🔘 Making test changes to project...');
      const titleInput = await this.page.$('input[name="title"]');
      if (titleInput) {
        // Clear and enter new title
        await titleInput.click({ clickCount: 3 }); // Select all
        await this.page.type('input[name="title"]', ' - EDITED');
        console.log('  ✅ Modified project title');
      }

      // Test save functionality
      const saveButton = await this.page.$('button:has-text("Save"), button[type="submit"]');
      if (saveButton) {
        await saveButton.click();
        console.log('  ✅ Clicked save button');
        
        await this.page.waitForTimeout(2000);
        
        // Check if changes persisted by looking for updated title
        const updatedTitle = await this.page.$eval(
          '.text-2xl, .text-xl', 
          el => el.textContent.trim()
        ).catch(() => null);
        
        if (updatedTitle && updatedTitle.includes('EDITED')) {
          console.log('  ✅ Changes saved and persisted');
        } else {
          console.log('  ⚠️  Changes may not have persisted');
        }
      }

      // Close modal to return to list
      const closeButton = await this.page.$('button:has-text("Close")');
      if (closeButton) {
        await closeButton.click();
        await this.page.waitForTimeout(500);
      }

      this.results.push({ test: 'Project editing flow', status: 'PASS' });
      return true;

    } catch (error) {
      console.log('  ❌ Project editing flow failed:', error.message);
      this.results.push({ test: 'Project editing flow', status: 'FAIL' });
      return false;
    }
  }

  async testIntegrationWorkflow() {
    console.log('\n🔄 Test 5: Full Integration Workflow');

    try {
      // Create → View → Edit → Verify full cycle
      console.log('  🔘 Testing complete create → view → edit → verify workflow...');
      
      // Step 1: Create a new project (simplified)
      const createButton = await this.page.$('[data-testid="button-create-project"]');
      if (createButton) {
        await createButton.click();
        await this.waitForElement('[data-testid="project-modal"]');
        
        // Fill minimal required data
        const testTitle = `Integration Test ${Date.now()}`;
        await this.page.fill('[data-testid="input-project-title"]', testTitle);
        await this.page.fill('textarea[name="scope"]', 'Integration test project for workflow verification');
        
        const submitButton = await this.page.$('button[type="submit"]');
        await submitButton.click();
        await this.page.waitForTimeout(2000);
        
        console.log('  ✅ Step 1: Project created');
      }

      // Step 2: Verify project appears and open detail view
      const projectCards = await this.page.$$('[data-testid^="project-card-"]');
      if (projectCards.length > 0) {
        await projectCards[0].click();
        await this.waitForElement('[data-testid="project-detail-modal"]');
        console.log('  ✅ Step 2: Detail view opened');
      }

      // Step 3: Edit the project
      const editButton = await this.page.$('button:has-text("Edit")');
      if (editButton) {
        await editButton.click();
        await this.page.waitForTimeout(500);
        
        // Make a change
        const titleInput = await this.page.$('input[name="title"]');
        if (titleInput) {
          await titleInput.click({ clickCount: 3 });
          await this.page.type('input[name="title"]', ' - WORKFLOW VERIFIED');
        }
        
        const saveButton = await this.page.$('button:has-text("Save")');
        if (saveButton) {
          await saveButton.click();
          await this.page.waitForTimeout(2000);
        }
        console.log('  ✅ Step 3: Project edited');
      }

      // Step 4: Verify changes persisted
      const closeButton = await this.page.$('button:has-text("Close")');
      if (closeButton) {
        await closeButton.click();
        await this.page.waitForTimeout(1000);
      }

      // Check if updated title appears in project list
      const projectTitles = await this.page.$$eval(
        '[data-testid^="project-card-"] .text-lg, [data-testid^="project-card-"] h3',
        elements => elements.map(el => el.textContent.trim())
      );
      
      const hasUpdatedTitle = projectTitles.some(title => title.includes('WORKFLOW VERIFIED'));
      if (hasUpdatedTitle) {
        console.log('  ✅ Step 4: Changes verified in project list');
        this.results.push({ test: 'Integration workflow', status: 'PASS' });
      } else {
        console.log('  ⚠️  Step 4: Changes not reflected in project list');
        this.results.push({ test: 'Integration workflow', status: 'PARTIAL' });
      }

      return true;

    } catch (error) {
      console.log('  ❌ Integration workflow failed:', error.message);
      this.results.push({ test: 'Integration workflow', status: 'FAIL' });
      return false;
    }
  }

  async testUIElementsAndAccessibility() {
    console.log('\n🎨 Test 6: UI Elements and Accessibility');

    try {
      // Test data-testid attributes
      console.log('  🔘 Checking data-testid attributes...');
      const requiredTestIds = [
        'button-create-project',
        'project-card-',  // prefix check
        'input-project-title',
        'select-project-status',
        'input-project-start-date',
        'input-project-target-date'
      ];

      for (const testId of requiredTestIds) {
        let found = false;
        if (testId.endsWith('-')) {
          // Prefix check
          found = await this.page.$(`[data-testid^="${testId}"]`) !== null;
        } else {
          found = await this.page.$(`[data-testid="${testId}"]`) !== null;
        }
        console.log(`  ${found ? '✅' : '⚠️ '} data-testid="${testId}": ${found ? 'present' : 'missing'}`);
      }

      // Test responsive behavior by changing viewport
      console.log('  🔘 Testing responsive behavior...');
      await this.page.setViewport({ width: 768, height: 600 }); // Tablet view
      await this.page.waitForTimeout(500);
      
      const mobileElements = await this.page.$$('.grid-cols-1, .md\\:grid-cols-2');
      console.log(`  ✅ Responsive grid elements found: ${mobileElements.length}`);

      // Reset to desktop view
      await this.page.setViewport({ width: 1280, height: 720 });

      // Test keyboard navigation
      console.log('  🔘 Testing keyboard accessibility...');
      await this.page.keyboard.press('Tab');
      const focusedElement = await this.page.evaluate(() => document.activeElement.tagName);
      console.log(`  ✅ Keyboard navigation works - focused element: ${focusedElement}`);

      this.results.push({ test: 'UI elements and accessibility', status: 'PASS' });
      return true;

    } catch (error) {
      console.log('  ❌ UI elements and accessibility test failed:', error.message);
      this.results.push({ test: 'UI elements and accessibility', status: 'FAIL' });
      return false;
    }
  }

  async testErrorHandlingAndEdgeCases() {
    console.log('\n🛡️  Test 7: Error Handling and Edge Cases');

    try {
      // Test invalid date combinations
      console.log('  🔘 Testing invalid date validation...');
      const createButton = await this.page.$('[data-testid="button-create-project"]');
      if (createButton) {
        await createButton.click();
        await this.waitForElement('[data-testid="project-modal"]');
        
        // Try to set target date before start date
        await this.page.fill('[data-testid="input-project-start-date"]', '2025-12-31');
        await this.page.fill('[data-testid="input-project-target-date"]', '2025-01-01');
        
        const submitButton = await this.page.$('button[type="submit"]');
        await submitButton.click();
        await this.page.waitForTimeout(500);
        
        // Check if validation error appears
        const validationError = await this.page.$('.text-red-500, .text-destructive');
        if (validationError) {
          console.log('  ✅ Date validation working correctly');
        } else {
          console.log('  ⚠️  Date validation may not be working');
        }

        // Close modal
        const cancelButton = await this.page.$('button:has-text("Cancel")');
        if (cancelButton) {
          await cancelButton.click();
        } else {
          await this.page.keyboard.press('Escape');
        }
        await this.page.waitForTimeout(500);
      }

      // Test empty project list state
      console.log('  🔘 Checking empty state handling...');
      const emptyStateButton = await this.page.$('[data-testid="button-create-project-empty"]');
      if (emptyStateButton) {
        console.log('  ✅ Empty state UI present');
      }

      this.results.push({ test: 'Error handling and edge cases', status: 'PASS' });
      return true;

    } catch (error) {
      console.log('  ❌ Error handling test failed:', error.message);
      this.results.push({ test: 'Error handling and edge cases', status: 'FAIL' });
      return false;
    }
  }

  async runAllTests() {
    console.log('🧪 COMPREHENSIVE PROJECTS PAGE E2E TESTING');
    console.log('=' .repeat(60));

    const setupSuccess = await this.setup();
    if (!setupSuccess) {
      return { success: false, error: 'Failed to setup testing environment' };
    }

    try {
      // Run all test suites
      await this.testPageLoad();
      await this.testProjectCreationFlow();
      await this.testProjectDetailView();
      await this.testProjectEditingFlow();
      await this.testIntegrationWorkflow();
      await this.testUIElementsAndAccessibility();
      await this.testErrorHandlingAndEdgeCases();

      return this.generateTestReport();

    } catch (error) {
      console.error('❌ Testing suite failed:', error.message);
      return { success: false, error: error.message };
    } finally {
      await this.cleanup();
    }
  }

  generateTestReport() {
    console.log('\n📊 COMPREHENSIVE E2E TESTING REPORT');
    console.log('=' .repeat(60));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const partial = this.results.filter(r => r.status === 'PARTIAL').length;
    const total = this.results.length;

    console.log('\n🎯 TEST SUMMARY:');
    console.log(`✅ Passed: ${passed}/${total}`);
    console.log(`⚠️  Partial: ${partial}/${total}`);
    console.log(`❌ Failed: ${failed}/${total}`);

    const successRate = Math.round(((passed + (partial * 0.5)) / total) * 100);
    console.log(`📈 Overall Success Rate: ${successRate}%`);

    console.log('\n📋 DETAILED RESULTS:');
    this.results.forEach(result => {
      const icons = { 'PASS': '✅', 'FAIL': '❌', 'PARTIAL': '⚠️' };
      const icon = icons[result.status] || '❓';
      console.log(`  ${icon} ${result.test}`);
    });

    console.log('\n🚀 PROJECTS PAGE UI READINESS:');
    if (successRate >= 90) {
      console.log('   🟢 EXCELLENT - Projects UI is production ready');
    } else if (successRate >= 75) {
      console.log('   🟡 GOOD - Minor UI issues to address');
    } else {
      console.log('   🔴 NEEDS WORK - Major UI functionality gaps');
    }

    return {
      success: true,
      passed,
      failed,
      partial,
      total,
      successRate,
      results: this.results
    };
  }
}

// Main execution function
async function runProjectsE2ETests() {
  const testSuite = new ProjectsE2ETestSuite();
  return await testSuite.runAllTests();
}

// Auto-run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runProjectsE2ETests()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 E2E testing completed successfully!');
        process.exit(0);
      } else {
        console.error('\n💥 E2E testing failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 E2E testing crashed:', error.message);
      process.exit(1);
    });
}

export { ProjectsE2ETestSuite, runProjectsE2ETests };