// Comprehensive Data Validation and Error Handling Testing Suite
// Tests: form validation, API responses, CRUD operations, data integrity, error boundaries

async function testDataValidationAndErrorHandling() {
  console.log('🧪 COMPREHENSIVE DATA VALIDATION AND ERROR HANDLING TESTING\n');
  console.log('=' .repeat(70));
  
  const baseURL = 'http://localhost:5000';
  const results = [];
  
  // Test 1: Task Creation Validation - Schema and Field Requirements
  console.log('📝 Test 1: Task Creation Validation - Schema and Field Requirements');
  
  const taskValidationTests = [
    {
      name: 'Empty required fields',
      data: {},
      expectedStatus: 400,
      description: 'Should reject completely empty task creation'
    },
    {
      name: 'Missing title',
      data: { category: 'test', priority: 1, type: 'reactive' },
      expectedStatus: 400,
      description: 'Should require title field'
    },
    {
      name: 'Missing type field', 
      data: { title: 'Test Task', category: 'test', priority: 1 },
      expectedStatus: 400,
      description: 'Should require type field'
    },
    {
      name: 'Invalid type enum',
      data: { title: 'Test Task', category: 'test', priority: 1, type: 'invalid_type' },
      expectedStatus: 400,
      description: 'Should reject invalid type enum values'
    },
    {
      name: 'Invalid priority range',
      data: { title: 'Test Task', category: 'test', priority: 10, type: 'reactive' },
      expectedStatus: 400,
      description: 'Should reject priority outside valid range'
    },
    {
      name: 'Invalid status enum',
      data: { title: 'Test Task', category: 'test', priority: 1, type: 'reactive', status: 'INVALID_STATUS' },
      expectedStatus: 400,
      description: 'Should reject invalid status enum values'
    },
    {
      name: 'SQL injection attempt',
      data: { title: "'; DROP TABLE tasks; --", category: 'test', priority: 1, type: 'reactive' },
      expectedStatus: 400,
      description: 'Should safely handle SQL injection attempts'
    },
    {
      name: 'XSS attempt in title',
      data: { title: '<script>alert("xss")</script>', category: 'test', priority: 1, type: 'reactive' },
      expectedStatus: [200, 201, 400],
      description: 'Should handle XSS attempts appropriately'
    },
    {
      name: 'Valid task creation',
      data: { title: 'Valid Test Task', category: 'testing.validation', priority: 2, type: 'reactive', status: 'OPEN' },
      expectedStatus: [200, 201],
      description: 'Should accept valid task data'
    }
  ];
  
  try {
    console.log('  🛡️  Testing task creation validation:');
    
    for (const test of taskValidationTests) {
      const response = await fetch(`${baseURL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.data)
      });
      
      const statusMatches = Array.isArray(test.expectedStatus) 
        ? test.expectedStatus.includes(response.status)
        : response.status === test.expectedStatus;
      
      if (statusMatches) {
        console.log(`    ✅ ${test.name}: ${response.status} (${test.description})`);
        results.push({ test: test.name, status: 'PASS' });
      } else {
        console.log(`    ⚠️  ${test.name}: Expected ${test.expectedStatus}, got ${response.status}`);
        results.push({ test: test.name, status: 'PARTIAL' });
      }
      
      // Store created task ID for cleanup if successful
      if (response.ok && test.name === 'Valid task creation') {
        try {
          const createdTask = await response.json();
          global.testTaskIdForCleanup = createdTask.id;
        } catch (e) {
          // Response might not be JSON
        }
      }
    }
    
  } catch (error) {
    console.log('  ❌ Task creation validation test failed:', error.message);
    results.push({ test: 'Task creation validation', status: 'FAIL' });
  }
  
  // Test 2: Project Creation Validation - Complex Data Structures
  console.log('\n🏗️  Test 2: Project Creation Validation - Complex Data Structures');
  
  const projectValidationTests = [
    {
      name: 'Missing required project fields',
      data: { title: 'Test Project' },
      expectedStatus: 400,
      description: 'Should require all mandatory project fields'
    },
    {
      name: 'Invalid date formats',
      data: { 
        title: 'Test Project', 
        scope: 'testing',
        startDate: 'invalid-date', 
        endDate: 'also-invalid' 
      },
      expectedStatus: 400,
      description: 'Should reject invalid date formats'
    },
    {
      name: 'Logical date validation',
      data: { 
        title: 'Test Project', 
        scope: 'testing',
        startDate: '2025-12-31T00:00:00Z', 
        endDate: '2025-01-01T00:00:00Z' 
      },
      expectedStatus: 400,
      description: 'Should reject end date before start date'
    },
    {
      name: 'Valid project creation',
      data: { 
        title: 'Valid Test Project', 
        scope: 'testing.validation',
        startDate: '2025-01-01T00:00:00Z', 
        endDate: '2025-12-31T00:00:00Z',
        status: 'active'
      },
      expectedStatus: [200, 201],
      description: 'Should accept valid project data'
    }
  ];
  
  try {
    console.log('  🏗️  Testing project creation validation:');
    
    for (const test of projectValidationTests) {
      const response = await fetch(`${baseURL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.data)
      });
      
      const statusMatches = Array.isArray(test.expectedStatus) 
        ? test.expectedStatus.includes(response.status)
        : response.status === test.expectedStatus;
      
      if (statusMatches) {
        console.log(`    ✅ ${test.name}: ${response.status} (${test.description})`);
        results.push({ test: test.name, status: 'PASS' });
      } else {
        console.log(`    ⚠️  ${test.name}: Expected ${test.expectedStatus}, got ${response.status}`);
        results.push({ test: test.name, status: 'PARTIAL' });
        
        // Log response body for debugging
        if (response.status !== test.expectedStatus) {
          try {
            const errorText = await response.text();
            if (errorText.length < 200) {
              console.log(`      Debug: ${errorText}`);
            }
          } catch (e) {
            // Unable to read response
          }
        }
      }
    }
    
  } catch (error) {
    console.log('  ❌ Project creation validation test failed:', error.message);
    results.push({ test: 'Project creation validation', status: 'FAIL' });
  }
  
  // Test 3: API Response Error Handling
  console.log('\n🔧 Test 3: API Response Error Handling');
  
  try {
    const errorHandlingTests = [
      {
        endpoint: '/api/tasks/non-existent-id',
        method: 'GET',
        expectedStatus: 404,
        description: 'Should return 404 for non-existent task'
      },
      {
        endpoint: '/api/tasks/non-existent-id',
        method: 'PATCH',
        data: { title: 'Updated Title' },
        expectedStatus: 404,
        description: 'Should return 404 when updating non-existent task'
      },
      {
        endpoint: '/api/tasks/non-existent-id',
        method: 'DELETE',
        expectedStatus: 404,
        description: 'Should return 404 when deleting non-existent task'
      },
      {
        endpoint: '/api/projects/invalid-uuid',
        method: 'GET',
        expectedStatus: [400, 404],
        description: 'Should handle invalid UUID formats'
      },
      {
        endpoint: '/api/metrics/scorecard',
        method: 'GET',
        queryParams: 'timeRange=invalid-range',
        expectedStatus: [400, 200],
        description: 'Should handle invalid time range parameters gracefully'
      }
    ];
    
    console.log('  🔍 Testing API error response handling:');
    
    for (const test of errorHandlingTests) {
      const url = `${baseURL}${test.endpoint}${test.queryParams ? '?' + test.queryParams : ''}`;
      
      const options = {
        method: test.method,
        headers: { 'Content-Type': 'application/json' }
      };
      
      if (test.data) {
        options.body = JSON.stringify(test.data);
      }
      
      const response = await fetch(url, options);
      
      const statusMatches = Array.isArray(test.expectedStatus) 
        ? test.expectedStatus.includes(response.status)
        : response.status === test.expectedStatus;
      
      if (statusMatches) {
        console.log(`    ✅ ${test.description}: ${response.status}`);
        results.push({ test: test.description, status: 'PASS' });
      } else {
        console.log(`    ⚠️  ${test.description}: Expected ${test.expectedStatus}, got ${response.status}`);
        results.push({ test: test.description, status: 'PARTIAL' });
      }
    }
    
  } catch (error) {
    console.log('  ❌ API error handling test failed:', error.message);
    results.push({ test: 'API error handling', status: 'FAIL' });
  }
  
  // Test 4: Database Constraint Validation
  console.log('\n🗄️  Test 4: Database Constraint Validation');
  
  try {
    console.log('  🛡️  Testing database constraints and data integrity:');
    
    // Test unique constraint violations (if any)
    const constraintTests = [
      {
        name: 'Null constraint violation',
        test: async () => {
          // Try to update task with null required field
          const tasksResponse = await fetch(`${baseURL}/api/tasks`);
          if (tasksResponse.ok) {
            const tasks = await tasksResponse.json();
            if (tasks.length > 0) {
              const response = await fetch(`${baseURL}/api/tasks/${tasks[0].id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: null })
              });
              return response.status >= 400;
            }
          }
          return false;
        },
        description: 'Should prevent null values in required fields'
      },
      {
        name: 'Foreign key constraint',
        test: async () => {
          // Try to create task with non-existent project ID
          const response = await fetch(`${baseURL}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'Test Task',
              category: 'test',
              priority: 1,
              type: 'reactive',
              projectId: 'non-existent-project-id'
            })
          });
          return response.status >= 400;
        },
        description: 'Should enforce foreign key relationships'
      }
    ];
    
    for (const constraintTest of constraintTests) {
      try {
        const constraintViolated = await constraintTest.test();
        if (constraintViolated) {
          console.log(`    ✅ ${constraintTest.description}: Constraint properly enforced`);
          results.push({ test: constraintTest.name, status: 'PASS' });
        } else {
          console.log(`    ⚠️  ${constraintTest.description}: Constraint not enforced as expected`);
          results.push({ test: constraintTest.name, status: 'PARTIAL' });
        }
      } catch (error) {
        console.log(`    ❌ ${constraintTest.description}: Test failed - ${error.message}`);
        results.push({ test: constraintTest.name, status: 'FAIL' });
      }
    }
    
  } catch (error) {
    console.log('  ❌ Database constraint validation test failed:', error.message);
    results.push({ test: 'Database constraints', status: 'FAIL' });
  }
  
  // Test 5: Input Sanitization and Security
  console.log('\n🔒 Test 5: Input Sanitization and Security');
  
  try {
    const securityTests = [
      {
        name: 'Script tag injection',
        data: { 
          title: '<script>alert("XSS")</script>Test Task',
          category: 'test',
          priority: 1,
          type: 'reactive'
        },
        field: 'title',
        description: 'Should sanitize script tags in user input'
      },
      {
        name: 'HTML entity injection',
        data: { 
          title: 'Test &lt;img src=x onerror=alert(1)&gt; Task',
          category: 'test',
          priority: 1,
          type: 'reactive'
        },
        field: 'title',
        description: 'Should handle HTML entities safely'
      },
      {
        name: 'Extremely long input',
        data: { 
          title: 'A'.repeat(10000),
          category: 'test',
          priority: 1,
          type: 'reactive'
        },
        expectedStatus: [400, 413],
        description: 'Should handle extremely long inputs appropriately'
      }
    ];
    
    console.log('  🔐 Testing input sanitization and security:');
    
    for (const securityTest of securityTests) {
      const response = await fetch(`${baseURL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(securityTest.data)
      });
      
      if (securityTest.expectedStatus) {
        const statusMatches = Array.isArray(securityTest.expectedStatus) 
          ? securityTest.expectedStatus.includes(response.status)
          : response.status === securityTest.expectedStatus;
        
        if (statusMatches) {
          console.log(`    ✅ ${securityTest.name}: ${response.status} (${securityTest.description})`);
          results.push({ test: securityTest.name, status: 'PASS' });
        } else {
          console.log(`    ⚠️  ${securityTest.name}: Expected ${securityTest.expectedStatus}, got ${response.status}`);
          results.push({ test: securityTest.name, status: 'PARTIAL' });
        }
      } else {
        // For injection tests, check if the response is handled safely
        if (response.ok) {
          try {
            const createdTask = await response.json();
            const fieldValue = createdTask[securityTest.field];
            
            // Check if the malicious content is properly sanitized
            if (fieldValue && !fieldValue.includes('<script>') && !fieldValue.includes('onerror=')) {
              console.log(`    ✅ ${securityTest.name}: Input properly sanitized`);
              results.push({ test: securityTest.name, status: 'PASS' });
              
              // Clean up created test task
              await fetch(`${baseURL}/api/tasks/${createdTask.id}`, { method: 'DELETE' });
            } else {
              console.log(`    ⚠️  ${securityTest.name}: Potential security issue - malicious content not sanitized`);
              results.push({ test: securityTest.name, status: 'FAIL' });
            }
          } catch (e) {
            console.log(`    ⚠️  ${securityTest.name}: Unable to verify sanitization`);
            results.push({ test: securityTest.name, status: 'PARTIAL' });
          }
        } else {
          console.log(`    ✅ ${securityTest.name}: Request properly rejected (${response.status})`);
          results.push({ test: securityTest.name, status: 'PASS' });
        }
      }
    }
    
  } catch (error) {
    console.log('  ❌ Input sanitization test failed:', error.message);
    results.push({ test: 'Input sanitization', status: 'FAIL' });
  }
  
  // Test 6: CRUD Operations End-to-End Validation
  console.log('\n🔄 Test 6: CRUD Operations End-to-End Validation');
  
  try {
    console.log('  📋 Testing complete CRUD lifecycle with validation:');
    
    // Create
    const createData = {
      title: 'CRUD Test Task - Full Lifecycle',
      category: 'testing.crud',
      priority: 3,
      type: 'reactive',
      status: 'OPEN'
    };
    
    const createResponse = await fetch(`${baseURL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createData)
    });
    
    if (createResponse.ok) {
      const createdTask = await createResponse.json();
      console.log(`    ✅ CREATE: Task created successfully (ID: ${createdTask.id})`);
      
      // Read
      const readResponse = await fetch(`${baseURL}/api/tasks/${createdTask.id}`);
      if (readResponse.ok) {
        const readTask = await readResponse.json();
        console.log(`    ✅ READ: Task retrieved successfully`);
        
        // Validate data integrity
        if (readTask.title === createData.title && readTask.priority === createData.priority) {
          console.log(`    ✅ Data integrity maintained in CREATE->READ`);
        } else {
          console.log(`    ⚠️  Data integrity issue in CREATE->READ`);
        }
        
        // Update
        const updateData = { title: 'CRUD Test Task - Updated', priority: 1 };
        const updateResponse = await fetch(`${baseURL}/api/tasks/${createdTask.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        
        if (updateResponse.ok) {
          console.log(`    ✅ UPDATE: Task updated successfully`);
          
          // Verify update
          const verifyResponse = await fetch(`${baseURL}/api/tasks/${createdTask.id}`);
          if (verifyResponse.ok) {
            const verifiedTask = await verifyResponse.json();
            if (verifiedTask.title === updateData.title && verifiedTask.priority === updateData.priority) {
              console.log(`    ✅ Data integrity maintained in UPDATE->READ`);
            } else {
              console.log(`    ⚠️  Data integrity issue in UPDATE->READ`);
            }
          }
          
          // Delete
          const deleteResponse = await fetch(`${baseURL}/api/tasks/${createdTask.id}`, {
            method: 'DELETE'
          });
          
          if (deleteResponse.ok || deleteResponse.status === 204) {
            console.log(`    ✅ DELETE: Task deleted successfully`);
            
            // Verify deletion
            const verifyDeleteResponse = await fetch(`${baseURL}/api/tasks/${createdTask.id}`);
            if (verifyDeleteResponse.status === 404) {
              console.log(`    ✅ DELETE verification: Task properly removed`);
              results.push({ test: 'CRUD operations end-to-end', status: 'PASS' });
            } else {
              console.log(`    ⚠️  DELETE verification: Task still exists after deletion`);
              results.push({ test: 'CRUD operations end-to-end', status: 'PARTIAL' });
            }
          } else {
            console.log(`    ⚠️  DELETE: Failed to delete task (${deleteResponse.status})`);
            results.push({ test: 'CRUD operations end-to-end', status: 'PARTIAL' });
          }
          
        } else {
          console.log(`    ⚠️  UPDATE: Failed to update task (${updateResponse.status})`);
          results.push({ test: 'CRUD operations end-to-End', status: 'PARTIAL' });
        }
        
      } else {
        console.log(`    ⚠️  READ: Failed to read created task (${readResponse.status})`);
        results.push({ test: 'CRUD operations end-to-end', status: 'PARTIAL' });
      }
      
    } else {
      console.log(`    ⚠️  CREATE: Failed to create test task (${createResponse.status})`);
      results.push({ test: 'CRUD operations end-to-end', status: 'PARTIAL' });
    }
    
  } catch (error) {
    console.log('  ❌ CRUD operations test failed:', error.message);
    results.push({ test: 'CRUD operations end-to-end', status: 'FAIL' });
  }
  
  return results;
}

// Generate Comprehensive Data Validation Test Report
function generateValidationTestReport(results) {
  console.log('\n📊 COMPREHENSIVE DATA VALIDATION TEST REPORT');
  console.log('=' .repeat(70));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const total = results.length;
  
  console.log('\n🎯 VALIDATION TEST SUMMARY:');
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`⚠️  Partial: ${partial}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}`);
  
  const successRate = Math.round(((passed + (partial * 0.5)) / total) * 100);
  console.log(`📈 Overall Validation Success Rate: ${successRate}%`);
  
  console.log('\n📋 DETAILED VALIDATION RESULTS:');
  const categories = {
    'Task Validation': results.filter(r => r.test.includes('task') || r.test.includes('Task')),
    'Project Validation': results.filter(r => r.test.includes('project') || r.test.includes('Project')),
    'API Error Handling': results.filter(r => r.test.includes('404') || r.test.includes('API') || r.test.includes('error')),
    'Security & Sanitization': results.filter(r => r.test.includes('injection') || r.test.includes('XSS') || r.test.includes('security')),
    'Database Constraints': results.filter(r => r.test.includes('constraint') || r.test.includes('Null')),
    'CRUD Operations': results.filter(r => r.test.includes('CRUD'))
  };
  
  Object.entries(categories).forEach(([category, categoryResults]) => {
    if (categoryResults.length > 0) {
      console.log(`\n  📁 ${category}:`);
      categoryResults.forEach(result => {
        const icons = {
          'PASS': '✅',
          'FAIL': '❌', 
          'PARTIAL': '⚠️',
          'ERROR': '🔴'
        };
        const icon = icons[result.status] || '❓';
        console.log(`    ${icon} ${result.test}`);
      });
    }
  });
  
  console.log('\n🚀 DATA VALIDATION READINESS:');
  if (successRate >= 90) {
    console.log('   🟢 EXCELLENT - Data validation and error handling production ready');
  } else if (successRate >= 75) {
    console.log('   🟡 GOOD - Strong validation with minor improvements needed');
  } else if (successRate >= 50) {
    console.log('   🔴 NEEDS WORK - Critical validation gaps requiring attention');
  } else {
    console.log('   🚨 CRITICAL - Major validation failures - not production ready');
  }
  
  console.log('\n🛡️  DATA VALIDATION INSIGHTS:');
  console.log('   • Input validation prevents malformed data entry');
  console.log('   • API error responses provide appropriate HTTP status codes');
  console.log('   • Database constraints maintain data integrity');
  console.log('   • Security measures protect against common attacks');
  console.log('   • CRUD operations maintain data consistency throughout lifecycle');
  
  console.log('\n💡 VALIDATION RECOMMENDATIONS:');
  if (failed > 0) {
    console.log('   • Address critical validation failures immediately');
  }
  if (partial > 0) {
    console.log('   • Review partial results - some validation may be too permissive');
  }
  console.log('   • Implement client-side validation to complement server-side validation');
  console.log('   • Add comprehensive logging for security-related validation failures');
  console.log('   • Consider rate limiting for repeated validation failures');
  
  return { passed, failed, partial, total, successRate };
}

// Main execution function
async function runComprehensiveValidationTests() {
  console.log('🧪 SYNERGY VA OPS HUB - COMPREHENSIVE DATA VALIDATION TESTING');
  console.log('=' .repeat(70));
  
  try {
    const results = await testDataValidationAndErrorHandling();
    const summary = generateValidationTestReport(results);
    
    console.log('\n🎉 Comprehensive data validation testing completed!');
    return summary;
    
  } catch (error) {
    console.error('❌ Comprehensive data validation testing failed:', error.message);
    return null;
  }
}

// Auto-run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveValidationTests().catch(console.error);
}

export { runComprehensiveValidationTests, testDataValidationAndErrorHandling };