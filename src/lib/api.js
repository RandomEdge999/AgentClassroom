async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parse failures.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  health() {
    return request('/api/health');
  },
  listJobs() {
    return request('/api/jobs');
  },
  createJob(payload) {
    return request('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getJob(id) {
    return request(`/api/jobs/${id}`);
  },
  getResults(id) {
    return request(`/api/jobs/${id}/results`);
  },
  getArtifactContent(id, artifactPath) {
    const query = new URLSearchParams({ path: artifactPath });
    return request(`/api/jobs/${id}/artifact-content?${query.toString()}`);
  },
  artifactUrl(id, artifactPath) {
    const query = new URLSearchParams({ path: artifactPath });
    return `/api/jobs/${id}/artifact?${query.toString()}`;
  },
  downloadUrl(id) {
    return `/api/jobs/${id}/download`;
  },
  cancelJob(id) {
    return request(`/api/jobs/${id}/cancel`, {
      method: 'POST',
    });
  },
  deleteJob(id) {
    return request(`/api/jobs/${id}`, {
      method: 'DELETE',
    });
  },
  cleanupJobs(keepCount = 10) {
    return request('/api/cleanup', {
      method: 'POST',
      body: JSON.stringify({ keepCount }),
    });
  },
};
