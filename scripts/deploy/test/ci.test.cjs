const assert = require('node:assert/strict');
const { test } = require('node:test');
const { verifyCi } = require('../verify-ci.cjs');

const sha = 'a'.repeat(40);
const repository = { full_name: 'owner/repo' };
const run = {
  id: 42, workflow_id: 7, head_sha: sha, head_branch: 'main', event: 'push',
  status: 'completed', conclusion: 'success', repository, head_repository: repository,
};

function fixture({ event = 'workflow_run', overrides = {}, runs, jobs } = {}) {
  const current = { ...run, ...overrides };
  const context = {
    eventName: event, repo: { owner: 'owner', repo: 'repo' }, ref: 'refs/heads/main',
    payload: { workflow_run: current, inputs: { sha } },
  };
  const github = {
    rest: { actions: {
      getWorkflow: async () => ({ data: { id: 7 } }),
      getWorkflowRun: async () => ({ data: current }),
      listWorkflowRuns: async (args) => {
        assert.equal(args.head_sha, sha);
        assert.equal(args.event, 'push');
        assert.equal(args.branch, 'main');
        assert.equal(args.status, undefined, 'Do not hide a newer failed/pending run');
        return { data: { workflow_runs: runs || [current] } };
      },
      listJobsForWorkflowRun: async () => {},
    } },
    paginate: async (_method, args) => {
      assert.equal(args.run_id, 42);
      assert.equal(args.filter, 'latest');
      return jobs || ['backend', 'frontend'].map(name => ({ name, conclusion: 'success' }));
    },
  };
  return { github, context };
}

test('automatic deploy uses the successful triggering CI SHA, not current main', async () => {
  const f = fixture();
  f.context.sha = 'b'.repeat(40);
  assert.deepEqual(await verifyCi(f), { sha, runId: 42, mode: 'automatic' });
});

test('manual redeploy of the same validated SHA is permitted', async () => {
  assert.deepEqual(await verifyCi(fixture({ event: 'workflow_dispatch' })), { sha, runId: 42, mode: 'manual' });
});

for (const overrides of [
  { conclusion: 'failure' }, { conclusion: 'cancelled' }, { status: 'in_progress' },
  { event: 'pull_request' }, { head_branch: 'feature' }, { workflow_id: 9 },
  { head_repository: { full_name: 'fork/repo' } }, { repository: { full_name: 'fork/repo' } },
]) {
  test(`CI gate refuses ${JSON.stringify(overrides)}`, async () => {
    await assert.rejects(verifyCi(fixture({ overrides })));
  });
}

test('fresh API run must still match the triggering SHA', async () => {
  const f = fixture();
  f.github.rest.actions.getWorkflowRun = async () => ({ data: { ...run, head_sha: 'b'.repeat(40) } });
  await assert.rejects(verifyCi(f), /CI/);
});

for (const conclusion of ['skipped', 'failure', 'cancelled']) {
  test(`required frontend job cannot be ${conclusion}`, async () => {
    await assert.rejects(verifyCi(fixture({ jobs: [
      { name: 'backend', conclusion: 'success' }, { name: 'frontend', conclusion },
    ] })), /frontend/);
  });
}

test('missing required job fails closed', async () => {
  await assert.rejects(verifyCi(fixture({ jobs: [] })), /backend/);
});

test('manual retry cannot fall back to an older green run after a newer failure', async () => {
  await assert.rejects(verifyCi(fixture({ event: 'workflow_dispatch',
    overrides: { conclusion: 'failure' },
    runs: [{ ...run, conclusion: 'failure' }, { ...run, id: 41 }],
  })), /CI/);
});

test('manual deploy requires a CI run for the requested SHA', async () => {
  await assert.rejects(verifyCi(fixture({ event: 'workflow_dispatch', runs: [] })), /CI/);
});

test('manual SHA is validated before API access', async () => {
  const f = fixture({ event: 'workflow_dispatch' });
  f.context.payload.inputs.sha = 'main; echo unsafe';
  f.github.rest.actions.getWorkflow = async () => assert.fail('API must not be called');
  await assert.rejects(verifyCi(f), /SHA/);
});

test('manual workflow must run from main', async () => {
  const f = fixture({ event: 'workflow_dispatch' });
  f.context.ref = 'refs/heads/feature';
  await assert.rejects(verifyCi(f), /main/);
});

test('unsupported event fails closed', async () => {
  await assert.rejects(verifyCi(fixture({ event: 'push' })), /event/i);
});

test('API failures block deployment', async () => {
  const f = fixture();
  f.github.rest.actions.getWorkflow = async () => { throw new Error('API unavailable'); };
  await assert.rejects(verifyCi(f), /API unavailable/);
});
