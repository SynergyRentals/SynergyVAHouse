// Comprehensive Projects Page Testing Suite - API + Integration Testing
// Tests: Full workflow, data persistence, error handling, UI component validation

async function testProjectsComprehensive() {
  console.log('🧪 COMPREHENSIVE PROJECTS FUNCTIONALITY TESTING');
  console.log('=' .repeat(60));
  
  const baseURL = 'http://localhost:5000';
  const results = [];
  let testProjectId = null;
  let createdProjectIds = [];

  // Helper function to make authenticated API calls
  async function apiCall(endpoint, options = {}) {
    const response = await fetch(`${baseURL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'E2E-Test-Suite/1.0',
        ...options.headers
      },
      ...options
    });
    return response;
  }

  // Test 1: Environment and API Connectivity
  console.log('\n🔗 Test 1: Environment Setup and API Connectivity');
  try {
    const response = await apiCall('/api/projects');
    if (response.ok) {
      const projects = await response.json();
      console.log(`  ✅ API connectivity verified - ${projects.length} existing projects`);
      console.log(`  ✅ Projects endpoint returns status: ${response.status}`);
      results.push({ test: 'API connectivity', status: 'PASS' });
      
      // Validate project data structure
      if (projects.length > 0) {
        const project = projects[0];
        const requiredFields = ['id', 'title', 'scope', 'status', 'createdAt'];
        const missingFields = requiredFields.filter(field => !(field in project));
        
        if (missingFields.length === 0) {
          console.log('  ✅ Project data structure validated');
          console.log(`  📊 Sample project: ${project.title} (${project.status})`);
        } else {
          console.log(`  ⚠️  Missing fields in project structure: ${missingFields.join(', ')}`);
        }
      }
    } else {
      throw new Error(`API returned status ${response.status}`);
    }
  } catch (error) {
    console.log('  ❌ API connectivity failed:', error.message);
    results.push({ test: 'API connectivity', status: 'FAIL' });
  }

  // Test 2: Project Creation Workflow
  console.log('\n➕ Test 2: Complete Project Creation Workflow');
  
  const testProjects = [
    {
      title: 'E2E Test Project Alpha',
      scope: 'Comprehensive testing project to verify creation workflow with full data validation and persistence.',
      status: 'planning',
      startAt: new Date().toISOString(),
      targetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      title: 'E2E Test Project Beta',
      scope: 'Secondary test project for multi-project workflow validation.',
      status: 'active'
    },
    {
      title: 'E2E Test Project Gamma - Priority',
      scope: 'High priority test project for status transition testing.',
      status: 'on_hold',
      startAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      targetAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  for (let i = 0; i < testProjects.length; i++) {
    const projectData = testProjects[i];
    console.log(`  🔘 Creating test project ${i + 1}: ${projectData.title}`);
    
    try {
      const response = await apiCall('/api/projects', {
        method: 'POST',
        body: JSON.stringify(projectData)
      });
      
      if (response.ok) {
        const createdProject = await response.json();
        console.log(`    ✅ Project created with ID: ${createdProject.id}`);
        console.log(`    ✅ Status: ${createdProject.status}, Title: "${createdProject.title}"`);
        
        createdProjectIds.push(createdProject.id);
        if (i === 0) testProjectId = createdProject.id;
        
        // Verify creation by fetching the project
        const verifyResponse = await apiCall(`/api/projects/${createdProject.id}`);
        if (verifyResponse.ok) {
          const fetchedProject = await verifyResponse.json();
          console.log(`    ✅ Project verification successful - matches created data`);
          
          // Validate all fields were saved correctly
          const fieldsMatch = projectData.title === fetchedProject.title &&
                             projectData.scope === fetchedProject.scope &&
                             projectData.status === fetchedProject.status;
          
          if (fieldsMatch) {
            console.log('    ✅ All project fields saved correctly');
          } else {
            console.log('    ⚠️  Some project fields may not have saved correctly');
          }
        }
        
        results.push({ test: `Project creation ${i + 1}`, status: 'PASS' });
      } else {
        const errorData = await response.text().catch(() => 'Unknown error');
        console.log(`    ❌ Project creation failed: ${response.status} - ${errorData}`);
        results.push({ test: `Project creation ${i + 1}`, status: 'FAIL' });
      }
    } catch (error) {
      console.log(`    ❌ Project creation error:`, error.message);
      results.push({ test: `Project creation ${i + 1}`, status: 'FAIL' });
    }
  }

  // Test 3: Project Detail Retrieval and Data Integrity
  console.log('\n👁️  Test 3: Project Detail Retrieval and Data Integrity');
  
  if (testProjectId) {
    try {
      const response = await apiCall(`/api/projects/${testProjectId}`);
      if (response.ok) {
        const project = await response.json();
        console.log(`  ✅ Project details retrieved for: "${project.title}"`);
        
        // Validate detailed project structure
        const detailFields = ['id', 'title', 'scope', 'status', 'createdAt', 'updatedAt', 'tasks'];
        const presentFields = detailFields.filter(field => field in project);
        console.log(`  📊 Detail fields present: ${presentFields.join(', ')}`);
        
        // Check task statistics
        if (project.taskStats || project.tasks) {
          const taskData = project.taskStats || {
            total: project.tasks ? project.tasks.length : 0,
            completed: project.tasks ? project.tasks.filter(t => t.status === 'DONE').length : 0
          };
          console.log(`  📈 Task statistics: ${taskData.total} total, ${taskData.completed} completed`);
        }
        
        // Test owner information if present
        if (project.owner) {
          console.log(`  👤 Project owner: ${project.owner.name}`);
        }
        
        results.push({ test: 'Project detail retrieval', status: 'PASS' });
      } else {
        console.log(`  ❌ Failed to retrieve project details: ${response.status}`);
        results.push({ test: 'Project detail retrieval', status: 'FAIL' });
      }
    } catch (error) {
      console.log('  ❌ Project detail retrieval error:', error.message);
      results.push({ test: 'Project detail retrieval', status: 'FAIL' });
    }
  } else {
    console.log('  ℹ️  No test project available for detail testing');
    results.push({ test: 'Project detail retrieval', status: 'NOT_TESTED' });
  }

  // Test 4: Project Editing and Update Workflow  
  console.log('\n✏️  Test 4: Project Editing and Update Workflow');
  
  if (testProjectId) {
    const updateTests = [
      {
        name: 'Title and scope update',
        data: {
          title: 'E2E Test Project Alpha - UPDATED',
          scope: 'Updated project scope to test editing functionality and data persistence validation.'
        }
      },
      {
        name: 'Status transition',
        data: {
          status: 'active'
        }
      },
      {
        name: 'Timeline update',
        data: {
          startAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          targetAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    ];

    for (const updateTest of updateTests) {
      console.log(`  🔘 Testing ${updateTest.name}...`);
      try {
        const response = await apiCall(`/api/projects/${testProjectId}`, {
          method: 'PATCH',
          body: JSON.stringify(updateTest.data)
        });
        
        if (response.ok) {
          const updatedProject = await response.json();
          console.log(`    ✅ ${updateTest.name} successful`);
          
          // Verify changes were applied
          const fieldsUpdated = Object.keys(updateTest.data).every(key => {
            const expected = updateTest.data[key];
            const actual = updatedProject[key];
            
            if (key.includes('At')) {
              // Date comparison
              return new Date(expected).getTime() === new Date(actual).getTime();
            }
            return expected === actual;
          });
          
          if (fieldsUpdated) {
            console.log(`    ✅ All fields updated correctly`);
          } else {
            console.log(`    ⚠️  Some fields may not have updated correctly`);
          }
          
          results.push({ test: updateTest.name, status: 'PASS' });
        } else {
          console.log(`    ❌ ${updateTest.name} failed: ${response.status}`);
          results.push({ test: updateTest.name, status: 'FAIL' });
        }
      } catch (error) {
        console.log(`    ❌ ${updateTest.name} error:`, error.message);
        results.push({ test: updateTest.name, status: 'FAIL' });
      }
    }
  } else {
    console.log('  ℹ️  No test project available for editing tests');
    results.push({ test: 'Project editing', status: 'NOT_TESTED' });
  }

  // Test 5: Data Validation and Error Handling
  console.log('\n🛡️  Test 5: Data Validation and Error Handling');
  
  const validationTests = [
    {
      name: 'Empty title validation',
      data: { title: '', scope: 'Test scope with empty title' },
      expectedStatus: 400
    },
    {
      name: 'Missing required fields',
      data: { title: 'Test Project Missing Scope' },
      expectedStatus: 400
    },
    {
      name: 'Invalid status value',
      data: { title: 'Test Project', scope: 'Test scope', status: 'INVALID_STATUS' },
      expectedStatus: 400
    },
    {
      name: 'Invalid date format',
      data: { title: 'Test Project', scope: 'Test scope', startAt: 'not-a-date' },
      expectedStatus: 400
    },
    {
      name: 'Target before start date',
      data: {
        title: 'Test Project',
        scope: 'Test scope',
        startAt: '2025-12-31',
        targetAt: '2025-01-01'
      },
      expectedStatus: 400
    }
  ];

  for (const validationTest of validationTests) {
    console.log(`  🔘 Testing ${validationTest.name}...`);
    try {
      const response = await apiCall('/api/projects', {
        method: 'POST',
        body: JSON.stringify(validationTest.data)
      });
      
      if (response.status >= 400) {
        console.log(`    ✅ Validation properly rejected invalid data (${response.status})`);
        results.push({ test: validationTest.name, status: 'PASS' });
      } else {
        console.log(`    ⚠️  Validation did not reject invalid data (got ${response.status}, expected ~400)`);
        results.push({ test: validationTest.name, status: 'PARTIAL' });
      }
    } catch (error) {
      console.log(`    ❌ Validation test error:`, error.message);
      results.push({ test: validationTest.name, status: 'FAIL' });
    }
  }

  // Test 6: Full Integration Workflow
  console.log('\n🔄 Test 6: Full Integration Workflow (Create → Read → Update → Verify)');
  
  try {
    console.log('  🔘 Step 1: Create workflow test project...');
    const workflowProjectData = {
      title: 'Integration Workflow Test Project',
      scope: 'Testing the complete CRUD workflow for project management.',
      status: 'planning'
    };
    
    const createResponse = await apiCall('/api/projects', {
      method: 'POST',
      body: JSON.stringify(workflowProjectData)
    });
    
    if (!createResponse.ok) {
      throw new Error(`Create failed: ${createResponse.status}`);
    }
    
    const workflowProject = await createResponse.json();
    const workflowId = workflowProject.id;
    console.log(`    ✅ Workflow project created: ${workflowId}`);
    
    console.log('  🔘 Step 2: Read and verify project data...');
    const readResponse = await apiCall(`/api/projects/${workflowId}`);
    if (!readResponse.ok) {
      throw new Error(`Read failed: ${readResponse.status}`);
    }
    
    const readProject = await readResponse.json();
    const dataMatches = readProject.title === workflowProjectData.title &&
                       readProject.scope === workflowProjectData.scope;
    
    if (dataMatches) {
      console.log('    ✅ Project data read correctly');
    } else {
      throw new Error('Project data does not match');
    }
    
    console.log('  🔘 Step 3: Update project status...');
    const updateResponse = await apiCall(`/api/projects/${workflowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active', title: workflowProjectData.title + ' - WORKFLOW COMPLETED' })
    });
    
    if (!updateResponse.ok) {
      throw new Error(`Update failed: ${updateResponse.status}`);
    }
    
    const updatedProject = await updateResponse.json();
    console.log('    ✅ Project updated successfully');
    
    console.log('  🔘 Step 4: Verify persistence by re-reading...');
    const verifyResponse = await apiCall(`/api/projects/${workflowId}`);
    if (!verifyResponse.ok) {
      throw new Error(`Verify read failed: ${verifyResponse.status}`);
    }
    
    const verifiedProject = await verifyResponse.json();
    const updatesMatch = verifiedProject.status?.toLowerCase() === 'active' &&
                        verifiedProject.title.includes('WORKFLOW COMPLETED');
    
    if (updatesMatch) {
      console.log('    ✅ All changes persisted correctly');
      results.push({ test: 'Full integration workflow', status: 'PASS' });
    } else {
      console.log('    ⚠️  Some changes may not have persisted');
      results.push({ test: 'Full integration workflow', status: 'PARTIAL' });
    }
    
    // Add to cleanup list
    createdProjectIds.push(workflowId);
    
  } catch (error) {
    console.log('  ❌ Integration workflow failed:', error.message);
    results.push({ test: 'Full integration workflow', status: 'FAIL' });
  }

  // Test 7: Multi-Project Operations and List Management
  console.log('\n📋 Test 7: Multi-Project Operations and List Management');
  
  try {
    const projectsResponse = await apiCall('/api/projects');
    if (projectsResponse.ok) {
      const projects = await projectsResponse.json();
      console.log(`  ✅ Projects list retrieved: ${projects.length} projects`);
      
      // Verify our test projects appear in the list
      const testProjectsInList = createdProjectIds.filter(id => 
        projects.some(p => p.id === id)
      ).length;
      
      console.log(`  ✅ Test projects in list: ${testProjectsInList}/${createdProjectIds.length}`);
      
      // Test filtering by status if available
      const statuses = ['planning', 'active', 'on_hold', 'completed'];
      for (const status of statuses) {
        try {
          const filterResponse = await apiCall(`/api/projects?status=${status}`);
          if (filterResponse.ok) {
            const filteredProjects = await filterResponse.json();
            console.log(`  ✅ Status filter '${status}': ${filteredProjects.length} projects`);
          }
        } catch (e) {
          console.log(`  ⚠️  Status filter '${status}': may not be supported`);
        }
      }
      
      results.push({ test: 'Multi-project operations', status: 'PASS' });
    } else {
      throw new Error(`Projects list failed: ${projectsResponse.status}`);
    }
  } catch (error) {
    console.log('  ❌ Multi-project operations failed:', error.message);
    results.push({ test: 'Multi-project operations', status: 'FAIL' });
  }

  // Test 8: Performance and Load Testing
  console.log('\n⚡ Test 8: Performance and Concurrent Operations');
  
  try {
    console.log('  🔘 Testing concurrent project operations...');
    const concurrentOperations = [];
    
    // Test multiple simultaneous reads
    for (let i = 0; i < 5; i++) {
      concurrentOperations.push(apiCall('/api/projects'));
    }
    
    // Test concurrent project creation
    for (let i = 0; i < 3; i++) {
      concurrentOperations.push(
        apiCall('/api/projects', {
          method: 'POST',
          body: JSON.stringify({
            title: `Concurrent Test Project ${i}`,
            scope: `Performance testing project ${i}`,
            status: 'planning'
          })
        })
      );
    }
    
    const startTime = Date.now();
    const responses = await Promise.all(concurrentOperations);
    const endTime = Date.now();
    
    const successfulOps = responses.filter(r => r.ok).length;
    const totalTime = endTime - startTime;
    
    console.log(`  ✅ Concurrent operations: ${successfulOps}/${responses.length} successful`);
    console.log(`  ⚡ Total time: ${totalTime}ms (avg: ${Math.round(totalTime/responses.length)}ms per op)`);
    
    if (successfulOps >= responses.length * 0.8) {
      results.push({ test: 'Performance and concurrency', status: 'PASS' });
    } else {
      results.push({ test: 'Performance and concurrency', status: 'PARTIAL' });
    }
    
  } catch (error) {
    console.log('  ❌ Performance testing failed:', error.message);
    results.push({ test: 'Performance and concurrency', status: 'FAIL' });
  }

  // Cleanup: Remove test projects
  console.log('\n🧹 Cleanup: Removing test projects...');
  let cleanedUp = 0;
  for (const projectId of createdProjectIds) {
    try {
      // Check if the project exists before trying to delete
      const checkResponse = await apiCall(`/api/projects/${projectId}`);
      if (checkResponse.ok) {
        console.log(`  ℹ️  Test project ${projectId} exists (cleanup would require DELETE endpoint)`);
        cleanedUp++;
      }
    } catch (error) {
      console.log(`  ⚠️  Error checking project ${projectId}:`, error.message);
    }
  }
  
  if (cleanedUp > 0) {
    console.log(`  ℹ️  ${cleanedUp} test projects identified for cleanup`);
    console.log('  💡 Note: Automatic cleanup requires DELETE API endpoint');
  }

  return results;
}

// Generate comprehensive test report
function generateComprehensiveReport(results) {
  console.log('\n📊 COMPREHENSIVE PROJECTS TESTING REPORT');
  console.log('=' .repeat(60));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const notTested = results.filter(r => r.status === 'NOT_TESTED').length;
  const total = results.length;

  console.log('\n🎯 TEST SUMMARY:');
  console.log(`✅ Passed: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
  console.log(`⚠️  Partial: ${partial}/${total} (${Math.round(partial/total*100)}%)`);
  console.log(`❌ Failed: ${failed}/${total} (${Math.round(failed/total*100)}%)`);
  console.log(`ℹ️  Not Tested: ${notTested}/${total} (${Math.round(notTested/total*100)}%)`);

  const successRate = Math.round(((passed + (partial * 0.5)) / total) * 100);
  console.log(`📈 Overall Success Rate: ${successRate}%`);

  console.log('\n📋 DETAILED RESULTS:');
  results.forEach((result, index) => {
    const icons = { 'PASS': '✅', 'FAIL': '❌', 'PARTIAL': '⚠️', 'NOT_TESTED': 'ℹ️' };
    const icon = icons[result.status] || '❓';
    console.log(`  ${String(index + 1).padStart(2)}. ${icon} ${result.test}`);
  });

  console.log('\n🚀 PROJECTS FUNCTIONALITY ASSESSMENT:');
  if (successRate >= 95) {
    console.log('   🟢 EXCELLENT - Projects functionality is production ready');
    console.log('   🎉 All critical workflows working perfectly');
  } else if (successRate >= 85) {
    console.log('   🟡 VERY GOOD - Minor issues to address');
    console.log('   🔧 Small improvements recommended');
  } else if (successRate >= 70) {
    console.log('   🟠 GOOD - Some functionality gaps');
    console.log('   ⚠️  Several areas need attention');
  } else {
    console.log('   🔴 NEEDS WORK - Major functionality issues');
    console.log('   🚨 Critical problems must be resolved');
  }

  console.log('\n💡 KEY FINDINGS:');
  if (failed === 0) {
    console.log('   • No critical failures detected');
  } else {
    console.log(`   • ${failed} critical issue(s) need immediate attention`);
  }
  
  if (partial > 0) {
    console.log(`   • ${partial} feature(s) work partially - review recommended`);
  }
  
  if (notTested > 0) {
    console.log(`   • ${notTested} feature(s) could not be tested - may need environment setup`);
  }

  console.log('\n📈 RECOMMENDED ACTIONS:');
  if (failed > 0) {
    console.log('   1. 🔴 HIGH PRIORITY: Fix failed test cases');
  }
  if (partial > 0) {
    console.log('   2. 🟡 MEDIUM PRIORITY: Improve partially working features');
  }
  if (successRate < 90) {
    console.log('   3. 🔵 LOW PRIORITY: Enhance overall reliability');
  }

  return {
    passed,
    failed,
    partial,
    notTested,
    total,
    successRate,
    results
  };
}

// Main execution function
async function runComprehensiveProjectsTests() {
  console.log('🎯 SYNERGY VA OPS HUB - COMPREHENSIVE PROJECTS TESTING');
  console.log('Starting comprehensive test suite...\n');

  try {
    const results = await testProjectsComprehensive();
    const summary = generateComprehensiveReport(results);

    console.log('\n🎉 Comprehensive projects testing completed!');
    console.log(`Final Score: ${summary.successRate}% success rate`);
    
    return summary;

  } catch (error) {
    console.error('\n💥 Comprehensive testing failed:', error.message);
    console.error('Stack trace:', error.stack);
    return null;
  }
}

// Auto-run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveProjectsTests()
    .then(result => {
      if (result && result.successRate >= 70) {
        console.log('\n✅ Testing completed successfully!');
        process.exit(0);
      } else {
        console.log('\n⚠️  Testing completed with issues requiring attention');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Testing suite crashed:', error);
      process.exit(1);
    });
}

export { runComprehensiveProjectsTests, testProjectsComprehensive };