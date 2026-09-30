const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const yaml = require('../../../frontend/node_modules/js-yaml');

const root = resolve(__dirname, '../../..');
const read = file => readFileSync(resolve(root, file), 'utf8');

test('workflow YAML gates exact-SHA deploy on CI and serializes releases without cancellation', () => {
  const ci = yaml.load(read('.github/workflows/ci.yml'));
  const mobile = yaml.load(read('.github/workflows/mobile.yml'));
  const deploy = yaml.load(read('.github/workflows/deploy.yml'));
  assert.equal(ci.name, 'CI');
  assert.equal(ci.jobs.mobile, undefined, 'Mobile checks must not delay web CI/deploy');
  assert.equal(ci.jobs['android-apk'], undefined, 'APK build must not delay web CI/deploy');
  assert.equal(mobile.name, 'Mobile');
  assert.ok(mobile.on.push.branches.includes('main'));
  assert.ok(mobile.on.pull_request !== undefined);
  assert.ok(mobile.on.workflow_dispatch !== undefined);
  assert.ok(mobile.jobs.mobile);
  assert.ok(mobile.jobs['android-apk']);
  assert.match(String(mobile.jobs['android-apk'].if), /pull_request/);
  assert.ok(mobile.jobs['android-apk'].steps.some(step => (step.run || '').includes('flutter build apk --release')));
  assert.equal(deploy.on.push, undefined);
  assert.deepEqual(deploy.on.workflow_run, { workflows: ['CI'], types: ['completed'], branches: ['main'] });
  assert.equal(deploy.on.workflow_dispatch.inputs.sha.required, true);
  assert.equal(deploy.concurrency['cancel-in-progress'], false);
  assert.equal(deploy.concurrency.group, 'anyostore-production');
  assert.equal(deploy.permissions.actions, 'read');
  const steps = deploy.jobs.deploy.steps;
  const gate = steps.findIndex(step => step.id === 'ci');
  const ssh = steps.findIndex(step => (step.run || '').includes('ssh_opts'));
  assert.ok(gate >= 0 && ssh > gate);
  assert.match(steps[ssh].env.DEPLOY_SHA, /steps\.ci\.outputs\.sha/);
  assert.equal(steps[ssh].env.VPS_HOST, 'anyostore.my.id');
  assert.match(steps[ssh].run, /getent ahostsv4/);
  assert.match(steps[ssh].run, /api\.ipify\.org/);
  assert.match(steps[ssh].run, /EXPECTED_APP_DOMAIN=anyostore\.my\.id DEPLOY_DIR=\/home\/ubuntu\/anyostore-pos bash -s --/);
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
  assert.equal(compose.services.frontend.build.args.NEXT_PUBLIC_RELEASE_SHA, undefined);
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

test('frontend release identity does not invalidate the expensive build stage', () => {
  const dockerfile = read('frontend/Dockerfile.production');
  const runnerStart = dockerfile.indexOf('FROM node:22-alpine AS runner');
  assert.ok(runnerStart > 0, 'frontend must have a separate runner stage');
  const builder = dockerfile.slice(0, runnerStart);
  const runner = dockerfile.slice(runnerStart);
  assert.doesNotMatch(builder, /ENV RELEASE_SHA=/);
  assert.doesNotMatch(builder, /ENV NEXT_PUBLIC_RELEASE_SHA=/);
  assert.match(runner, /ARG RELEASE_SHA/);
  assert.match(runner, /ENV RELEASE_SHA=\$RELEASE_SHA/);
});

test('deploy build and endpoint retries are bounded for fast feedback', () => {
  const release = read('scripts/deploy/release.sh');
  const deploy = yaml.load(read('.github/workflows/deploy.yml'));
  assert.match(release, /compose build --parallel backend frontend/);
  assert.match(release, /ENDPOINT_ATTEMPTS:-6/);
  assert.match(deploy.jobs.deploy.steps.find(step => step.name === 'Verify public production release').run, /seq 1 4/);
});

test('Caddy uses stable host loopback ports, not stale Docker DNS aliases', () => {
  const caddy = read('deploy/Caddyfile');
  const compose = yaml.load(read('docker-compose.production.yml'));
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3001/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3000/);
  assert.equal(compose.services.caddy.network_mode, 'host');
  assert.deepEqual(compose.services.backend.ports, ['127.0.0.1:3001:3001']);
  assert.deepEqual(compose.services.frontend.ports, ['127.0.0.1:3000:3000']);
  assert.equal(compose.services.caddy.ports, undefined);
  assert.equal(compose.services.caddy.networks, undefined);
});
