import { queryClient } from "./queryClient";

export async function apiRequest(
  method: string,
  url: string,
  data?: any
): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status}: ${errorText}`);
  }

  return response;
}

// Task API functions
export const taskAPI = {
  async getAll(filters?: Record<string, any>) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
    }
    
    const url = `/api/tasks${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await apiRequest('GET', url);
    return response.json();
  },

  async getById(id: string) {
    const response = await apiRequest('GET', `/api/tasks/${id}`);
    return response.json();
  },

  async create(task: any) {
    const response = await apiRequest('POST', '/api/tasks', task);
    return response.json();
  },

  async update(id: string, updates: any) {
    const response = await apiRequest('PATCH', `/api/tasks/${id}`, updates);
    return response.json();
  },

  async delete(id: string) {
    const response = await apiRequest('DELETE', `/api/tasks/${id}`);
    return response.json();
  },

  async addComment(taskId: string, comment: any) {
    const response = await apiRequest('POST', `/api/tasks/${taskId}/comments`, comment);
    return response.json();
  },

  async getStats(userId?: string) {
    const url = userId ? `/api/tasks/stats/${userId}` : '/api/tasks/stats';
    const response = await apiRequest('GET', url);
    return response.json();
  }
};

// Project API functions
export const projectAPI = {
  async getAll() {
    const response = await apiRequest('GET', '/api/projects');
    return response.json();
  },

  async getById(id: string) {
    const response = await apiRequest('GET', `/api/projects/${id}`);
    return response.json();
  },

  async create(project: any) {
    const response = await apiRequest('POST', '/api/projects', project);
    return response.json();
  },

  async update(id: string, updates: any) {
    const response = await apiRequest('PATCH', `/api/projects/${id}`, updates);
    return response.json();
  },

  async getProgress(id: string) {
    const response = await apiRequest('GET', `/api/projects/${id}/progress`);
    return response.json();
  },

  async addTask(projectId: string, task: any) {
    const response = await apiRequest('POST', `/api/projects/${projectId}/tasks`, task);
    return response.json();
  }
};

// Playbook API functions
export const playbookAPI = {
  async getAll() {
    const response = await apiRequest('GET', '/api/playbooks');
    return response.json();
  },

  async getByKey(key: string) {
    const response = await apiRequest('GET', `/api/playbooks/${key}`);
    return response.json();
  },

  async create(playbook: any) {
    const response = await apiRequest('POST', '/api/playbooks', playbook);
    return response.json();
  },

  async update(key: string, updates: any) {
    const response = await apiRequest('PATCH', `/api/playbooks/${key}`, updates);
    return response.json();
  },

  async getByCategory(category: string) {
    const response = await apiRequest('GET', `/api/playbooks/category/${category}`);
    return response.json();
  },

  async validateDoD(key: string, evidence: any) {
    const response = await apiRequest('POST', `/api/playbooks/${key}/validate-dod`, evidence);
    return response.json();
  },

  async getSLA(category: string) {
    const response = await apiRequest('GET', `/api/playbooks/sla/${category}`);
    return response.json();
  }
};

// User API functions
export const userAPI = {
  async getAll() {
    const response = await apiRequest('GET', '/api/users');
    return response.json();
  },

  async getById(id: string) {
    const response = await apiRequest('GET', `/api/users/${id}`);
    return response.json();
  }
};

// Metrics API functions
export const metricsAPI = {
  async getScorecard(timeRange: string = '7d') {
    const response = await apiRequest('GET', `/api/metrics/scorecard?timeRange=${timeRange}`);
    return response.json();
  },

  async getMetrics(filters: {
    startDate: string;
    endDate: string;
    userId?: string;
  }) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    
    const response = await apiRequest('GET', `/api/metrics?${params.toString()}`);
    return response.json();
  },

  async export(data: any) {
    const response = await apiRequest('POST', '/api/metrics/export', data);
    return response;
  }
};

// Audit API functions
export const auditAPI = {
  async getRecent(limit: number = 20) {
    const response = await apiRequest('GET', `/api/audits/recent?limit=${limit}`);
    return response.json();
  },

  async getForEntity(entity: string, entityId: string) {
    const response = await apiRequest('GET', `/api/audits/${entity}/${entityId}`);
    return response.json();
  }
};

// Utility function to invalidate related queries after mutations
export function invalidateTaskQueries() {
  queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
}

export function invalidateProjectQueries() {
  queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
}

export function invalidateMetricsQueries() {
  queryClient.invalidateQueries({ queryKey: ['/api/metrics'] });
}

// Error handling utility
export function handleAPIError(error: any): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
