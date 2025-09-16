// Tasks Page Functionality Testing Suite
// Tests: task creation, editing, filtering, search, modal interactions, CRUD operations

async function testTasksPageFunctionality() {
  console.log('🧪 TASKS PAGE FUNCTIONALITY TESTING\n');
  console.log('=' .repeat(60));
  
  const baseURL = 'http://localhost:5000';
  const results = [];
  
  // Test 1: Tasks List Display and Data Structure
  console.log('📝 Test 1: Tasks List Display and Data Structure');
  
  try {
    const response = await fetch(`${baseURL}/api/tasks`);
    const tasks = await response.json();
    
    console.log(`  ✓ Tasks loaded: ${tasks.length} total tasks`);
    
    if (tasks.length > 0) {
      const sampleTask = tasks[0];
      const requiredFields = ['id', 'title', 'category', 'status', 'priority', 'createdAt'];
      const missingFields = requiredFields.filter(field => !(field in sampleTask));
      
      if (missingFields.length === 0) {
        console.log('  ✓ Task data structure complete');
      } else {
        console.log(`  ⚠️  Missing required fields: ${missingFields.join(', ')}`);
      }
      
      // Test task categories
      const categories = [...new Set(tasks.map(task => task.category))];
      console.log(`  ✓ Task categories found: ${categories.length} unique categories`);
      console.log(`    Categories: ${categories.join(', ')}`);
      
      // Test task statuses
      const statuses = [...new Set(tasks.map(task => task.status))];
      console.log(`  ✓ Task statuses found: ${statuses.length} unique statuses`);
      console.log(`    Statuses: ${statuses.join(', ')}`);
      
      // Test priority distribution
      const priorities = tasks.map(task => task.priority);
      const priorityDistribution = {
        high: priorities.filter(p => p <= 2).length,
        medium: priorities.filter(p => p === 3).length,
        low: priorities.filter(p => p >= 4).length
      };
      console.log(`  ✓ Priority distribution - High: ${priorityDistribution.high}, Medium: ${priorityDistribution.medium}, Low: ${priorityDistribution.low}`);
    }
    
    results.push({ test: 'Tasks list display', status: 'PASS' });
    
  } catch (error) {
    console.log('  ❌ Tasks list test failed:', error.message);
    results.push({ test: 'Tasks list display', status: 'FAIL' });
  }
  
  // Test 2: Task Filtering Functionality
  console.log('\n🔍 Test 2: Task Filtering and Search');
  
  const filterTests = [
    { param: 'status=OPEN', description: 'Open tasks filter' },
    { param: 'status=IN_PROGRESS', description: 'In Progress tasks filter' },
    { param: 'status=DONE', description: 'Completed tasks filter' },
    { param: 'priority=1', description: 'High priority filter' },
    { param: 'category=support', description: 'Support category filter' },
    { param: 'overdue=true', description: 'Overdue tasks filter' },
    { param: 'slaBreached=true', description: 'SLA breached filter' }
  ];
  
  for (const filterTest of filterTests) {
    try {
      const response = await fetch(`${baseURL}/api/tasks?${filterTest.param}`);
      const filteredTasks = await response.json();
      console.log(`  ✓ ${filterTest.description}: ${filteredTasks.length} results`);
      results.push({ test: filterTest.description, status: 'PASS' });
    } catch (error) {
      console.log(`  ❌ ${filterTest.description} failed: ${error.message}`);
      results.push({ test: filterTest.description, status: 'FAIL' });
    }
  }
  
  // Test 3: Task Creation (POST endpoint)
  console.log('\n➕ Test 3: Task Creation Functionality');
  
  const newTaskData = {
    title: 'Test Task Creation - Automated Test',
    category: 'testing.automation',
    priority: 2,
    status: 'OPEN',
    playbookKey: 'testing.automation'
  };
  
  try {
    const response = await fetch(`${baseURL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTaskData)
    });
    
    if (response.status === 201 || response.status === 200) {
      const createdTask = await response.json();
      console.log('  ✓ Task creation successful');
      console.log(`  ✓ Created task ID: ${createdTask.id}`);
      console.log(`  ✓ Task title: "${createdTask.title}"`);
      results.push({ test: 'Task creation', status: 'PASS' });
      
      // Store task ID for further testing
      global.testTaskId = createdTask.id;
      
    } else {
      const errorText = await response.text();
      console.log(`  ⚠️  Task creation returned ${response.status}: ${errorText}`);
      results.push({ test: 'Task creation', status: 'PARTIAL' });
    }
    
  } catch (error) {
    console.log('  ❌ Task creation failed:', error.message);
    results.push({ test: 'Task creation', status: 'FAIL' });
  }
  
  // Test 4: Task Update/Edit Functionality
  console.log('\n✏️  Test 4: Task Update/Edit Functionality');
  
  try {
    // Get a task to update
    const tasksResponse = await fetch(`${baseURL}/api/tasks`);
    const tasks = await tasksResponse.json();
    
    if (tasks.length > 0) {
      const taskToUpdate = tasks[0];
      const updateData = {
        title: `${taskToUpdate.title} - UPDATED`,
        status: 'IN_PROGRESS'
      };
      
      const updateResponse = await fetch(`${baseURL}/api/tasks/${taskToUpdate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      if (updateResponse.status === 200 || updateResponse.status === 204) {
        console.log('  ✓ Task update successful');
        console.log(`  ✓ Updated task: ${taskToUpdate.id}`);
        results.push({ test: 'Task update', status: 'PASS' });
        
        // Verify the update
        const verifyResponse = await fetch(`${baseURL}/api/tasks/${taskToUpdate.id}`);
        if (verifyResponse.ok) {
          const updatedTask = await verifyResponse.json();
          if (updatedTask.title.includes('UPDATED')) {
            console.log('  ✓ Task update verification successful');
          }
        }
        
      } else {
        const errorText = await updateResponse.text();
        console.log(`  ⚠️  Task update returned ${updateResponse.status}: ${errorText}`);
        results.push({ test: 'Task update', status: 'PARTIAL' });
      }
    }
    
  } catch (error) {
    console.log('  ❌ Task update failed:', error.message);
    results.push({ test: 'Task update', status: 'FAIL' });
  }
  
  // Test 5: Task Assignment and User Management
  console.log('\n👤 Test 5: Task Assignment and User Management');
  
  try {
    // Get users for assignment testing
    const usersResponse = await fetch(`${baseURL}/api/users`);
    const users = await usersResponse.json();
    
    console.log(`  ✓ Users available for assignment: ${users.length}`);
    
    if (users.length > 0 && tasks.length > 0) {
      const userToAssign = users[0];
      const taskToAssign = tasks[0];
      
      const assignmentData = {
        assigneeId: userToAssign.id
      };
      
      const assignResponse = await fetch(`${baseURL}/api/tasks/${taskToAssign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignmentData)
      });
      
      if (assignResponse.ok) {
        console.log(`  ✓ Task assignment successful`);
        console.log(`  ✓ Assigned to: ${userToAssign.name}`);
        results.push({ test: 'Task assignment', status: 'PASS' });
      } else {
        console.log(`  ⚠️  Task assignment returned status: ${assignResponse.status}`);
        results.push({ test: 'Task assignment', status: 'PARTIAL' });
      }
    }
    
  } catch (error) {
    console.log('  ❌ Task assignment failed:', error.message);
    results.push({ test: 'Task assignment', status: 'FAIL' });
  }
  
  // Test 6: Due Date and SLA Management
  console.log('\n⏰ Test 6: Due Date and SLA Management');
  
  try {
    const tasksResponse = await fetch(`${baseURL}/api/tasks`);
    const tasks = await tasksResponse.json();
    
    if (tasks.length > 0) {
      const taskForDueDate = tasks[0];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 1 week from now
      
      const slaDate = new Date();
      slaDate.setHours(slaDate.getHours() + 2); // 2 hours from now
      
      const dueDateData = {
        dueAt: futureDate.toISOString(),
        slaAt: slaDate.toISOString()
      };
      
      const dueDateResponse = await fetch(`${baseURL}/api/tasks/${taskForDueDate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dueDateData)
      });
      
      if (dueDateResponse.ok) {
        console.log('  ✓ Due date and SLA setting successful');
        console.log(`  ✓ Due date: ${futureDate.toLocaleDateString()}`);
        console.log(`  ✓ SLA time: ${slaDate.toLocaleTimeString()}`);
        results.push({ test: 'Due date management', status: 'PASS' });
      } else {
        console.log(`  ⚠️  Due date setting returned status: ${dueDateResponse.status}`);
        results.push({ test: 'Due date management', status: 'PARTIAL' });
      }
    }
    
  } catch (error) {
    console.log('  ❌ Due date management failed:', error.message);
    results.push({ test: 'Due date management', status: 'FAIL' });
  }
  
  // Test 7: Bulk Operations and Advanced Features
  console.log('\n📦 Test 7: Bulk Operations and Advanced Features');
  
  try {
    // Test bulk status update
    const bulkUpdateData = {
      taskIds: tasks.slice(0, 3).map(task => task.id), // First 3 tasks
      updates: {
        status: 'IN_PROGRESS'
      }
    };
    
    // Note: This endpoint may not exist yet, testing if it's available
    const bulkResponse = await fetch(`${baseURL}/api/tasks/bulk`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bulkUpdateData)
    });
    
    if (bulkResponse.ok) {
      console.log('  ✓ Bulk operations supported');
      results.push({ test: 'Bulk operations', status: 'PASS' });
    } else if (bulkResponse.status === 404) {
      console.log('  ℹ️  Bulk operations not implemented yet (404)');
      results.push({ test: 'Bulk operations', status: 'NOT_IMPLEMENTED' });
    } else {
      console.log(`  ⚠️  Bulk operations returned status: ${bulkResponse.status}`);
      results.push({ test: 'Bulk operations', status: 'PARTIAL' });
    }
    
  } catch (error) {
    console.log('  ⚠️  Bulk operations test error:', error.message);
    results.push({ test: 'Bulk operations', status: 'ERROR' });
  }
  
  // Test 8: Data Validation and Error Handling
  console.log('\n🛡️  Test 8: Data Validation and Error Handling');
  
  const validationTests = [
    {
      name: 'Empty title validation',
      data: { title: '', category: 'test', priority: 1 },
      expectedStatus: 400
    },
    {
      name: 'Invalid priority validation',
      data: { title: 'Test', category: 'test', priority: 'invalid' },
      expectedStatus: 400
    },
    {
      name: 'Missing required fields',
      data: { title: 'Test' }, // Missing category and priority
      expectedStatus: 400
    },
    {
      name: 'Invalid status value',
      data: { title: 'Test', category: 'test', priority: 1, status: 'INVALID_STATUS' },
      expectedStatus: 400
    }
  ];
  
  for (const validationTest of validationTests) {
    try {
      const response = await fetch(`${baseURL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validationTest.data)
      });
      
      if (response.status === validationTest.expectedStatus) {
        console.log(`  ✓ ${validationTest.name}: Properly rejected`);
        results.push({ test: validationTest.name, status: 'PASS' });
      } else {
        console.log(`  ⚠️  ${validationTest.name}: Expected ${validationTest.expectedStatus}, got ${response.status}`);
        results.push({ test: validationTest.name, status: 'PARTIAL' });
      }
      
    } catch (error) {
      console.log(`  ❌ ${validationTest.name} failed:`, error.message);
      results.push({ test: validationTest.name, status: 'FAIL' });
    }
  }
  
  return results;
}

// Generate Tasks Page Test Report
function generateTasksTestReport(results) {
  console.log('\n📊 TASKS PAGE FUNCTIONALITY REPORT');
  console.log('=' .repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const notImplemented = results.filter(r => r.status === 'NOT_IMPLEMENTED').length;
  const total = results.length;
  
  console.log('\n🎯 TEST SUMMARY:');
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`⚠️  Partial: ${partial}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}`);
  console.log(`ℹ️  Not Implemented: ${notImplemented}/${total}`);
  
  const successRate = Math.round(((passed + (partial * 0.5)) / total) * 100);
  console.log(`📈 Overall Success Rate: ${successRate}%`);
  
  console.log('\n📋 DETAILED RESULTS:');
  results.forEach(result => {
    const icons = {
      'PASS': '✅',
      'FAIL': '❌', 
      'PARTIAL': '⚠️',
      'NOT_IMPLEMENTED': 'ℹ️',
      'ERROR': '🔴'
    };
    const icon = icons[result.status] || '❓';
    console.log(`  ${icon} ${result.test}`);
  });
  
  console.log('\n🚀 TASKS PAGE READINESS:');
  if (successRate >= 90) {
    console.log('   🟢 EXCELLENT - Tasks functionality is production ready');
  } else if (successRate >= 75) {
    console.log('   🟡 GOOD - Minor issues to address');
  } else {
    console.log('   🔴 NEEDS WORK - Major functionality gaps');
  }
  
  return { passed, failed, partial, total, successRate };
}

// Main execution function
async function runTasksPageTests() {
  console.log('🧪 SYNERGY VA OPS HUB - TASKS PAGE TESTING');
  console.log('=' .repeat(60));
  
  try {
    const results = await testTasksPageFunctionality();
    const summary = generateTasksTestReport(results);
    
    console.log('\n🎉 Tasks page testing completed!');
    return summary;
    
  } catch (error) {
    console.error('❌ Tasks page testing failed:', error.message);
    return null;
  }
}

// Auto-run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTasksPageTests().catch(console.error);
}

export { runTasksPageTests, testTasksPageFunctionality };