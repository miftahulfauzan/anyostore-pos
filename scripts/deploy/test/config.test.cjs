const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const yaml = require('../../../frontend/node_modules/js-yaml');

const root = resolve(__dirname, '../../..');
const read = file => readFileSync(resolve(root, file), 'utf8');

test('workflow YAML gates exact-SHA deploy on CI and serializes releases without cancellation', () => {
  const ci = yaml.load(read('.github/workflows/ci.yml'));
  const deploy = yaml.load(read('.github/workflows/deploy.yml'));
  assert.equal(ci.name, 'CI');
  assert.equal(deploy.on.push, undefined);
  assert.deepEqual(deploy.on.workflow_run, { workflows: ['CI'], types: ['completed'], branches: ['main'] });
  assert.equal(deploy.on.workflow_dispatch.inputs.sha.required, true);
  assert.equal(deploy.concurrency['cancel-in-progress'], false);
  assert.equal(deploy.concurrency.group, 'anyostore-production');
  assert.equal(deploy.permissions.actions, 'read');
  const steps = deploy.jobs.deploy.steps;
  const gate = steps.findIndex(step => step.id === 'ci');
  const ssh = steps.findIndex(step => (step.run || '').includes('ssh -i'));
  assert.ok(gate >= 0 && ssh > gate);
  assert.match(steps[ssh].env.DEPLOY_SHA, /steps\.ci\.outputs\.sha/);
  assert.match(steps[ssh].run, /EXPECTED_APP_DOMAIN=anyostore\.my\.id bash -s --/);
  assert.match(steps.find(step => step.name === 'Verify public production release').run, /https:\/\/anyostore\.my\.id/);
  assert.ok(ci.jobs.frontend.steps.some(step => (step.run || '').includes('../scripts/deploy/test/*.test.cjs')));
  assert.equal(String(ci.jobs.backend.steps.find(step => step.uses?.startsWith('actions/setup-node')).with['node-version']), '22');
});

test('production compose requires release identity, consistent WIB timezone and health checks', () => {
  const compose = yaml.load(read('docker-compose.production.yml'));
  assert.equal(compose.services.backend.environment.TZ, 'Asia/Jakarta');
  assert.ok(compose.services.db.command.includes('--default-time-zone=+07:00'));
  assert.equal(compose.services.backend.entrypoint, undefined, 'Use tested image startup command');
  for (const service of ['backend', 'frontend']) {
    assert.match(compose.services[service].build.args.RELEASE_SHA, /RELEASE_SHA:\?/);
    assert.match(compose.services[service].environment.RELEASE_SHA, /RELEASE_SHA:\?/);
    assert.ok(compose.services[service].healthcheck.test);
  }
  assert.match(compose.services.frontend.build.args.NEXT_PUBLIC_RELEASE_SHA, /RELEASE_SHA:\?/);
  assert.ok(!compose.services.backend.volumes.some(volume => /backend\/(scripts|migrations)/.test(volume)), 'Release code must come from the image');
});

test('Dockerfiles preserve BuildKit caches and bake release identity into matching Node runtimes', () => {
  for (const service of ['backend', 'frontend']) {
    const dockerfile = read(`${service}/Dockerfile.production`);
    assert.match(dockerfile, /FROM node:22-alpine/);
    assert.match(dockerfile, /--mount=type=cache,target=\/root\/\.npm/);
    assert.match(dockerfile, /org\.opencontainers\.image\.revision/);
    assert.match(dockerfile, /ENV RELEASE_SHA=/);
  }
  assert.match(read('frontend/Dockerfile.production'), /--mount=type=cache,target=\/app\/\.next\/cache/);
  assert.match(read('backend/Dockerfile.production'), /COPY.*migrations \.\/migrations/);
  assert.match(read('backend/Dockerfile.production'), /start-production\.sh/);
});
