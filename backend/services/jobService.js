const { v4: uuidv4 } = require('uuid');

const jobs = new Map();

function createJob(label, steps, runner) {
  const id = uuidv4();
  const job = {
    id,
    label,
    status: 'queued',
    progress: 0,
    currentStep: '',
    steps: steps.map(step => ({ label: step, status: 'pending' })),
    result: null,
    error: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(id, job);

  setTimeout(async () => {
    try {
      updateJob(id, { status: 'running', currentStep: steps[0] || '' });
      const result = await runner({
        setStep(stepIndex, message) {
          const live = jobs.get(id);
          if (!live) return;
          live.steps = live.steps.map((step, index) => ({
            ...step,
            status: index < stepIndex ? 'done' : index === stepIndex ? 'running' : 'pending'
          }));
          live.currentStep = message || live.steps[stepIndex]?.label || '';
          live.progress = Math.round((stepIndex / Math.max(steps.length, 1)) * 100);
          live.updatedAt = new Date().toISOString();
        }
      });
      const live = jobs.get(id);
      if (live) {
        live.status = 'done';
        live.progress = 100;
        live.currentStep = '完成';
        live.steps = live.steps.map(step => ({ ...step, status: 'done' }));
        live.result = result || null;
        live.updatedAt = new Date().toISOString();
      }
    } catch (error) {
      const live = jobs.get(id);
      if (live) {
        live.status = 'failed';
        live.error = error.message || '任务失败';
        live.updatedAt = new Date().toISOString();
      }
    }
  }, 0);

  return job;
}

function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function listJobs() {
  return [...jobs.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
}

module.exports = {
  createJob,
  getJob,
  listJobs
};
