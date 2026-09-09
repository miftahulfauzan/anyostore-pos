// Used by actions/github-script and tested with an injected, read-only GitHub API.
async function verifyCi({ github, context }) {
  const automatic = context.eventName === 'workflow_run';
  if (!automatic && context.eventName !== 'workflow_dispatch') {
    throw new Error('Unsupported deploy event');
  }
  if (!automatic && context.ref !== 'refs/heads/main') {
    throw new Error('Run the manual deploy workflow from main');
  }
  const sha = automatic ? context.payload.workflow_run?.head_sha : context.payload.inputs?.sha;
  if (!/^[a-f0-9]{40}$/.test(sha || '')) {
    throw new Error('Deploy requires a full lowercase 40-character commit SHA');
  }

  const repo = context.repo;
  const fullName = `${repo.owner}/${repo.repo}`;
  const { data: workflow } = await github.rest.actions.getWorkflow({ ...repo, workflow_id: 'ci.yml' });
  let runId = context.payload.workflow_run?.id;
  if (!automatic) {
    // No success filter: an older green run must not conceal a newer failed run.
    const { data } = await github.rest.actions.listWorkflowRuns({
      ...repo, workflow_id: workflow.id, head_sha: sha, branch: 'main', event: 'push', per_page: 100,
    });
    runId = data.workflow_runs.sort((a, b) => b.id - a.id)[0]?.id;
  }
  if (!runId) throw new Error('No CI push run exists for this SHA on main');
  // Re-read even automatic events: a rerun may now be in progress or have failed.
  const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: runId });
  if (run.workflow_id !== workflow.id || run.head_sha !== sha || run.head_branch !== 'main'
      || run.event !== 'push' || run.status !== 'completed' || run.conclusion !== 'success'
      || run.repository?.full_name !== fullName || run.head_repository?.full_name !== fullName) {
    throw new Error('CI must have succeeded for this exact SHA in this repository on main');
  }
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    ...repo, run_id: runId, filter: 'latest', per_page: 100,
  });
  for (const name of ['backend', 'frontend']) {
    if (!jobs.some(job => job.name === name && job.conclusion === 'success')) {
      throw new Error(`Required CI job ${name} did not succeed`);
    }
  }
  return { sha, runId, mode: automatic ? 'automatic' : 'manual' };
}

module.exports = { verifyCi };
