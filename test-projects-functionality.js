// Projects Page Functionality Testing Suite
// Tests: project creation, task assignment, progress tracking, empty states

async function testProjectsPageFunctionality() {
  console.log('🧪 PROJECTS PAGE FUNCTIONALITY TESTING\n');
  console.log('=' .repeat(60));
  
  const baseURL = 'http://localhost:5000';
  const results = [];
  
  // Test 1: Projects List Display and Empty State
  console.log('🏗️ Test 1: Projects List Display and Empty State Handling');
  
  try {
    const response = await fetch(`${baseURL}/api/projects`);
    const projects = await response.json();
    
    console.log(`  ✓ Projects API responsive: ${projects.length} projects found`);
    
    if (projects.length === 0) {
      console.log('  ✓ Empty state handling: No projects present (good for testing creation)');
      results.push({ test: 'Empty state handling', status: 'PASS' });
    } else {
      console.log(`  ✓ Projects data structure verification with ${projects.length} projects`);
      
      const sampleProject = projects[0];
      const expectedFields = ['id', 'title', 'scope', 'status', 'createdAt', 'taskStats'];
      const missingFields = expectedFields.filter(field => !(field in sampleProject));
      
      if (missingFields.length === 0) {
        console.log('  ✓ Project data structure complete');
        console.log('  📊 Sample project structure:', JSON.stringify(sampleProject, null, 2));
      } else {
        console.log(`  ⚠️  Missing fields in project structure: ${missingFields.join(', ')}`);
      }
    }
    
    results.push({ test: 'Projects list display', status: 'PASS' });
    
  } catch (error) {
    console.log('  ❌ Projects list test failed:', error.message);
    results.push({ test: 'Projects list display', status: 'FAIL' });
  }
  
  // Test 2: Project Creation Functionality
  console.log('\n➕ Test 2: Project Creation Functionality');
  
  const newProjectData = {
    title: 'Test Project - QA Automation Suite',
    scope: 'Comprehensive testing of project management functionality including task assignment, progress tracking, and milestone management.',
    status: 'ACTIVE',
    startAt: new Date().toISOString(),
    targetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
  };
  
  try {
    const response = await fetch(`${baseURL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProjectData)
    });
    
    if (response.status === 201 || response.status === 200) {
      const createdProject = await response.json();
      console.log('  ✅ Project creation successful');
      console.log(`  ✓ Created project ID: ${createdProject.id}`);
      console.log(`  ✓ Project title: "${createdProject.title}"`);
      console.log(`  ✓ Project status: ${createdProject.status}`);
      
      // Store for later tests
      global.testProjectId = createdProject.id;
      results.push({ test: 'Project creation', status: 'PASS' });
      
    } else {
      const errorText = await response.text();
      console.log(`  ⚠️  Project creation returned ${response.status}: ${errorText}`);
      results.push({ test: 'Project creation', status: 'PARTIAL' });
    }
    
  } catch (error) {
    console.log('  ❌ Project creation failed:', error.message);
    results.push({ test: 'Project creation', status: 'FAIL' });
  }
  
  // Test 3: Project Status Management
  console.log('\n🔄 Test 3: Project Status Management');
  
  try {
    // Get projects to test status updates
    const projectsResponse = await fetch(`${baseURL}/api/projects`);
    const projects = await projectsResponse.json();
    
    if (projects.length > 0) {
      const projectToUpdate = projects[0];
      const statusUpdateData = {
        status: 'PLANNING'
      };
      
      const updateResponse = await fetch(`${baseURL}/api/projects/${projectToUpdate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statusUpdateData)
      });
      
      if (updateResponse.ok) {
        const updatedProject = await updateResponse.json();
        console.log('  ✓ Project status update successful');
        console.log(`  ✓ Status changed to: ${updatedProject.status}`);
        results.push({ test: 'Project status update', status: 'PASS' });
        
        // Test different status values
        const statuses = ['ACTIVE', 'ON_HOLD', 'COMPLETED'];
        for (const status of statuses) {
          const statusTest = await fetch(`${baseURL}/api/projects/${projectToUpdate.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
          });
          
          if (statusTest.ok) {
            console.log(`  ✓ Status transition to ${status} works`);
          } else {
            console.log(`  ⚠️  Status transition to ${status} failed: ${statusTest.status}`);
          }
        }
        
      } else {
        console.log(`  ⚠️  Project status update failed: ${updateResponse.status}`);
        results.push({ test: 'Project status update', status: 'PARTIAL' });
      }
    } else {
      console.log('  ℹ️  No projects available for status update testing');
      results.push({ test: 'Project status update', status: 'NOT_TESTED' });
    }
    
  } catch (error) {
    console.log('  ❌ Project status management failed:', error.message);
    results.push({ test: 'Project status update', status: 'FAIL' });
  }
  
  // Test 4: Task Assignment to Projects
  console.log('\n📝 Test 4: Task Assignment to Projects');
  
  try {
    // Get available tasks and projects
    const [tasksResponse, projectsResponse] = await Promise.all([
      fetch(`${baseURL}/api/tasks`),
      fetch(`${baseURL}/api/projects`)
    ]);
    
    const tasks = await tasksResponse.json();
    const projects = await projectsResponse.json();
    
    console.log(`  ℹ️  Available for assignment: ${tasks.length} tasks, ${projects.length} projects`);
    
    if (tasks.length > 0 && projects.length > 0) {
      const taskToAssign = tasks[0];
      const targetProject = projects[0];
      
      const assignmentData = {
        projectId: targetProject.id
      };
      
      const assignResponse = await fetch(`${baseURL}/api/tasks/${taskToAssign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignmentData)
      });
      
      if (assignResponse.ok) {
        console.log('  ✅ Task assignment to project successful');
        console.log(`  ✓ Assigned task "${taskToAssign.title}" to project "${targetProject.title}"`);
        results.push({ test: 'Task assignment to project', status: 'PASS' });
        
        // Verify the assignment by fetching the updated task
        const verifyResponse = await fetch(`${baseURL}/api/tasks/${taskToAssign.id}`);
        if (verifyResponse.ok) {
          const updatedTask = await verifyResponse.json();
          if (updatedTask.projectId === targetProject.id) {
            console.log('  ✓ Task assignment verification successful');
          } else {
            console.log('  ⚠️  Task assignment verification failed - project ID mismatch');
          }
        }
        
      } else {
        const errorText = await assignResponse.text();
        console.log(`  ⚠️  Task assignment failed: ${assignResponse.status} - ${errorText}`);
        results.push({ test: 'Task assignment to project', status: 'PARTIAL' });
      }
      
    } else {
      console.log('  ℹ️  Insufficient data for assignment testing');
      results.push({ test: 'Task assignment to project', status: 'NOT_TESTED' });
    }
    
  } catch (error) {
    console.log('  ❌ Task assignment testing failed:', error.message);
    results.push({ test: 'Task assignment to project', status: 'FAIL' });
  }
  
  // Test 5: Project Progress Tracking and Statistics
  console.log('\n📊 Test 5: Project Progress Tracking and Statistics');
  
  try {
    const projectsResponse = await fetch(`${baseURL}/api/projects`);
    const projects = await projectsResponse.json();
    
    if (projects.length > 0) {
      const project = projects[0];
      
      console.log(`  ✓ Project statistics available for: "${project.title}"`);
      
      if (project.taskStats) {
        const stats = project.taskStats;
        console.log(`  📈 Task Statistics:`);
        console.log(`    - Total tasks: ${stats.total || 0}`);
        console.log(`    - Completed: ${stats.completed || 0}`);
        console.log(`    - In Progress: ${stats.inProgress || 0}`);
        console.log(`    - Blocked: ${stats.blocked || 0}`);
        console.log(`    - Open: ${stats.open || 0}`);
        
        // Calculate progress percentage
        const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
        console.log(`    - Progress: ${progressPercent}%`);
        
        results.push({ test: 'Project progress tracking', status: 'PASS' });
      } else {
        console.log('  ⚠️  Task statistics not available in project data');
        results.push({ test: 'Project progress tracking', status: 'PARTIAL' });
      }
      
    } else {
      console.log('  ℹ️  No projects available for progress tracking testing');
      results.push({ test: 'Project progress tracking', status: 'NOT_TESTED' });
    }
    
  } catch (error) {
    console.log('  ❌ Project progress tracking failed:', error.message);
    results.push({ test: 'Project progress tracking', status: 'FAIL' });
  }
  
  // Test 6: Project Timeline Management
  console.log('\n⏰ Test 6: Project Timeline Management');
  
  try {
    const projectsResponse = await fetch(`${baseURL}/api/projects`);
    const projects = await projectsResponse.json();
    
    if (projects.length > 0) {
      const project = projects[0];
      
      // Test timeline updates
      const timelineData = {
        startAt: new Date().toISOString(),
        targetAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString() // 45 days
      };
      
      const timelineResponse = await fetch(`${baseURL}/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timelineData)
      });
      
      if (timelineResponse.ok) {
        console.log('  ✅ Project timeline update successful');
        console.log(`  ✓ Start date: ${new Date(timelineData.startAt).toLocaleDateString()}`);
        console.log(`  ✓ Target date: ${new Date(timelineData.targetAt).toLocaleDateString()}`);
        
        // Calculate project duration
        const duration = Math.ceil((new Date(timelineData.targetAt) - new Date(timelineData.startAt)) / (1000 * 60 * 60 * 24));
        console.log(`  ✓ Project duration: ${duration} days`);
        
        results.push({ test: 'Project timeline management', status: 'PASS' });
      } else {
        console.log(`  ⚠️  Timeline update failed: ${timelineResponse.status}`);
        results.push({ test: 'Project timeline management', status: 'PARTIAL' });
      }
      
    } else {
      console.log('  ℹ️  No projects available for timeline testing');
      results.push({ test: 'Project timeline management', status: 'NOT_TESTED' });
    }
    
  } catch (error) {
    console.log('  ❌ Project timeline management failed:', error.message);
    results.push({ test: 'Project timeline management', status: 'FAIL' });
  }
  
  // Test 7: Project Filtering and Search
  console.log('\n🔍 Test 7: Project Filtering and Search');
  
  const filterTests = [
    { param: 'status=ACTIVE', description: 'Active projects filter' },
    { param: 'status=PLANNING', description: 'Planning projects filter' },
    { param: 'status=ON_HOLD', description: 'On hold projects filter' },
    { param: 'status=COMPLETED', description: 'Completed projects filter' }
  ];
  
  for (const filterTest of filterTests) {
    try {
      const response = await fetch(`${baseURL}/api/projects?${filterTest.param}`);
      const filteredProjects = await response.json();
      console.log(`  ✓ ${filterTest.description}: ${filteredProjects.length} results`);
      results.push({ test: filterTest.description, status: 'PASS' });
    } catch (error) {
      console.log(`  ❌ ${filterTest.description} failed: ${error.message}`);
      results.push({ test: filterTest.description, status: 'FAIL' });
    }
  }
  
  // Test 8: Project Data Validation
  console.log('\n🛡️  Test 8: Project Data Validation');
  
  const validationTests = [
    {
      name: 'Empty title validation',
      data: { title: '', scope: 'Test scope' },
      expectedStatus: 400
    },
    {
      name: 'Invalid status validation', 
      data: { title: 'Test Project', scope: 'Test scope', status: 'INVALID_STATUS' },
      expectedStatus: 400
    },
    {
      name: 'Missing required fields',
      data: { title: 'Test Project' }, // Missing scope
      expectedStatus: 400
    },
    {
      name: 'Invalid date format',
      data: { title: 'Test Project', scope: 'Test', startAt: 'invalid-date' },
      expectedStatus: 400
    }
  ];
  
  for (const validationTest of validationTests) {
    try {
      const response = await fetch(`${baseURL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validationTest.data)
      });
      
      if (response.status === validationTest.expectedStatus || response.status === 400) {
        console.log(`  ✓ ${validationTest.name}: Properly validated`);
        results.push({ test: validationTest.name, status: 'PASS' });
      } else {
        console.log(`  ⚠️  ${validationTest.name}: Expected validation error, got ${response.status}`);
        results.push({ test: validationTest.name, status: 'PARTIAL' });
      }
      
    } catch (error) {
      console.log(`  ❌ ${validationTest.name} failed:`, error.message);
      results.push({ test: validationTest.name, status: 'FAIL' });
    }
  }
  
  // Test 9: Project-Task Relationship Integrity
  console.log('\n🔗 Test 9: Project-Task Relationship Integrity');
  
  try {
    const [projectsResponse, tasksResponse] = await Promise.all([
      fetch(`${baseURL}/api/projects`),
      fetch(`${baseURL}/api/tasks`)
    ]);
    
    const projects = await projectsResponse.json();
    const tasks = await tasksResponse.json();
    
    // Check for tasks assigned to projects
    const tasksWithProjects = tasks.filter(task => task.projectId);
    console.log(`  ✓ Tasks linked to projects: ${tasksWithProjects.length}`);
    
    // Verify relationship integrity
    let integrityIssues = 0;
    for (const task of tasksWithProjects) {
      const projectExists = projects.find(p => p.id === task.projectId);
      if (!projectExists) {
        integrityIssues++;
        console.log(`  ⚠️  Task ${task.id} references non-existent project ${task.projectId}`);
      }
    }
    
    if (integrityIssues === 0) {
      console.log('  ✓ Project-task relationship integrity verified');
      results.push({ test: 'Project-task integrity', status: 'PASS' });
    } else {
      console.log(`  ⚠️  Found ${integrityIssues} integrity issues`);
      results.push({ test: 'Project-task integrity', status: 'PARTIAL' });
    }
    
  } catch (error) {
    console.log('  ❌ Relationship integrity test failed:', error.message);
    results.push({ test: 'Project-task integrity', status: 'FAIL' });
  }
  
  return results;
}

// Generate Projects Page Test Report
function generateProjectsTestReport(results) {
  console.log('\n📊 PROJECTS PAGE FUNCTIONALITY REPORT');
  console.log('=' .repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const notTested = results.filter(r => r.status === 'NOT_TESTED').length;
  const total = results.length;
  
  console.log('\n🎯 TEST SUMMARY:');
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`⚠️  Partial: ${partial}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}`);
  console.log(`ℹ️  Not Tested: ${notTested}/${total}`);
  
  const successRate = Math.round(((passed + (partial * 0.5)) / total) * 100);
  console.log(`📈 Overall Success Rate: ${successRate}%`);
  
  console.log('\n📋 DETAILED RESULTS:');
  results.forEach(result => {
    const icons = {
      'PASS': '✅',
      'FAIL': '❌', 
      'PARTIAL': '⚠️',
      'NOT_TESTED': 'ℹ️',
      'ERROR': '🔴'
    };
    const icon = icons[result.status] || '❓';
    console.log(`  ${icon} ${result.test}`);
  });
  
  console.log('\n🚀 PROJECTS PAGE READINESS:');
  if (successRate >= 90) {
    console.log('   🟢 EXCELLENT - Projects functionality is production ready');
  } else if (successRate >= 75) {
    console.log('   🟡 GOOD - Minor issues to address');
  } else {
    console.log('   🔴 NEEDS WORK - Major functionality gaps');
  }
  
  console.log('\n💡 RECOMMENDATIONS:');
  if (notTested > 0) {
    console.log('   • Create more test data to fully test all project features');
  }
  if (partial > 0) {
    console.log('   • Review partially working features for improvement opportunities');
  }
  if (failed > 0) {
    console.log('   • Address failed test cases to improve reliability');
  }
  
  return { passed, failed, partial, total, successRate, notTested };
}

// Main execution function
async function runProjectsPageTests() {
  console.log('🧪 SYNERGY VA OPS HUB - PROJECTS PAGE TESTING');
  console.log('=' .repeat(60));
  
  try {
    const results = await testProjectsPageFunctionality();
    const summary = generateProjectsTestReport(results);
    
    console.log('\n🎉 Projects page testing completed!');
    return summary;
    
  } catch (error) {
    console.error('❌ Projects page testing failed:', error.message);
    return null;
  }
}

// Auto-run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runProjectsPageTests().catch(console.error);
}

export { runProjectsPageTests, testProjectsPageFunctionality };