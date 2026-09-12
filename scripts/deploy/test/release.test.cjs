const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '../../..');
const sha = 'a'.repeat(40);
const oldSha = 'b'.repeat(40);

function sandbox(t, scenario = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'anyostore-deploy-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.env.production'), '');
  writeFileSync(join(dir, 'scenario.json'), JSON.stringify(scenario));
  // Every external command is replaced. These tests never call Docker, Git or SSH.
  const fake = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.DEPLOY_DIR;
const scenario = JSON.parse(fs.readFileSync(path.join(dir, 'scenario.json')));
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, 'commands.log'), JSON.stringify([name, ...args]) + '\\n');
const output = value => { process.stdout.write(String(value) + '\\n'); };
if (name === 'sudo') {
  const env = { ...process.env };
  while (args[0]?.startsWith('RELEASE_SHA=')) {
    env.RELEASE_SHA = args.shift().slice('RELEASE_SHA='.length);
  }
  const result = require('node:child_process').spawnSync(args[0], args.slice(1), { stdio: 'inherit', env });
  process.exit(result.status ?? 1);
}
if (name === 'flock') process.exit(scenario.lockFailure ? 1 : 0);
if (name === 'sleep') process.exit(0);
if (name === 'df') { output('Use%\\n' + (scenario.disk || 20) + '%'); process.exit(0); }
if (name === 'git') {
  if (args[0] === 'status') output(scenario.dirty ? ' M tracked.txt' : '');
  if (args[0] === 'rev-parse') output(args.includes('--git-dir') ? '.git' : '${sha}');
  if (args[0] === 'fetch' && scenario.fetchFailure) process.exit(1);
  if (args[0] === 'checkout' && scenario.checkoutFailure) process.exit(1);
  if (args[0] === 'merge-base') {
    if (args.at(-1) === 'origin/main') process.exit(scenario.unreachable ? 1 : 0);
    process.exit(scenario.stale ? 0 : 1);
  }
  process.exit(0);
}
if (name === 'curl') {
  if (scenario.endpointFailure) process.exit(22);
  output(JSON.stringify({ok: !scenario.notOk, release_sha: scenario.wrongEndpointSha ? '${oldSha}' : '${sha}'}));
  process.exit(0);
}
if (name === 'docker') {
  if (args[0] === 'compose' && process.env.RELEASE_SHA !== '${sha}') process.exit(1);
  if (args[0] === 'inspect') {
    const service = args.at(-1).replace('-id', '');
    const counter = path.join(dir, service + '.count');
    const count = fs.existsSync(counter) ? Number(fs.readFileSync(counter)) : 0;
    fs.writeFileSync(counter, String(count + 1));
    const states = (scenario.health || {})[service] || ['running healthy'];
    const state = states[Math.min(count, states.length - 1)];
    output(state + (service === 'db' ? '' : ' ' + (scenario.wrongContainerSha ? '${oldSha}' : '${sha}')));
    process.exit(scenario.inspectFailure ? 1 : 0);
  }
  const offset = args.indexOf('--env-file') + 2;
  const command = args.slice(offset);
  if (command[0] === 'ps') {
    if (!scenario.missingContainer) output(command.at(-1) + '-id');
  }
  if (command[0] === 'build' && scenario.buildFailure) process.exit(1);
  if (command[0] === 'run' && scenario.migrationFailure) process.exit(1);
  if (command[0] === 'up' && scenario.upFailure) process.exit(1);
  if (command[0] === 'exec') {
    // Config is retrieved from inside Caddy without sourcing the secret env file.
    if (command.includes('caddy')) output('example.test');
  }
  process.exit(0);
}
process.exit(1);
`;
  for (const name of ['sudo', 'docker', 'git', 'df', 'flock', 'sleep', 'curl']) {
    writeFileSync(join(bin, name), fake, { mode: 0o755 });
  }
  return {
    dir,
    run: (mode = 'automatic') => spawnSync('bash', [join(root, 'scripts/deploy/release.sh'), sha, mode], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: bin + ':' + process.env.PATH, DEPLOY_DIR: dir,
        HEALTH_ATTEMPTS: '3', HEALTH_INTERVAL: '0', ENDPOINT_ATTEMPTS: '2' },
    }),
    commands: () => existsSync(join(dir, 'commands.log'))
      ? readFileSync(join(dir, 'commands.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [],
    success: () => existsSync(join(dir, '.git/last-successful-release'))
      ? readFileSync(join(dir, '.git/last-successful-release'), 'utf8').trim() : null,
  };
}

test('same SHA redeploy builds and recreates both services, then records verified release', t => {
  const f = sandbox(t);
  for (let i = 0; i < 2; i++) {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(f.success(), sha);
  }
  const commands = f.commands().filter(command => command[0] === 'docker');
  assert.equal(commands.filter(command => command.includes('build')).length, 2);
  assert.equal(commands.filter(command => command.includes('--force-recreate') && command.includes('backend') && command.includes('frontend')).length, 2);
  assert.ok(f.commands().some(command => command.includes('checkout') && command.includes(sha)));
});

test('starting services are polled until both backend and frontend become healthy', t => {
  const f = sandbox(t, { health: { backend: ['running starting', 'running healthy'], frontend: ['running starting', 'running starting', 'running healthy'] } });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test('health polling ignores one-off migration containers', t => {
  const f = sandbox(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const backendPs = f.commands().find(command => command[0] === 'docker' && command.includes('ps') && command.includes('backend'));
  assert.ok(backendPs?.includes('label=com.docker.compose.oneoff=False'));
});

for (const service of ['backend', 'frontend']) {
  for (const state of ['running unhealthy', 'running starting', 'exited healthy', 'restarting healthy', 'running missing']) {
    test(`${service} ${state} fails release without updating success marker`, t => {
      const f = sandbox(t, { health: { [service]: [state] } });
      const result = f.run();
      assert.notEqual(result.status, 0);
      assert.equal(f.success(), null);
      assert.match(result.stderr + result.stdout, new RegExp(service));
    });
  }
}

for (const flag of ['buildFailure', 'migrationFailure', 'upFailure', 'fetchFailure', 'checkoutFailure', 'inspectFailure', 'missingContainer', 'wrongContainerSha', 'endpointFailure', 'wrongEndpointSha', 'notOk', 'dirty', 'unreachable', 'lockFailure']) {
  test(`${flag} blocks success`, t => {
    const f = sandbox(t, { [flag]: true });
    assert.notEqual(f.run().status, 0);
    assert.equal(f.success(), null);
    if (['migrationFailure', 'buildFailure'].includes(flag)) {
      assert.ok(!f.commands().some(command => command.includes('--force-recreate')));
    }
  });
}

test('failed build can be retried at the same SHA', t => {
  const f = sandbox(t, { buildFailure: true });
  assert.notEqual(f.run().status, 0);
  writeFileSync(join(f.dir, 'scenario.json'), '{}');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(f.success(), sha);
});

test('older queued automatic release cannot overwrite a newer successful release', t => {
  const f = sandbox(t, { stale: true });
  writeFileSync(join(f.dir, '.git/last-successful-release'), oldSha + '\n');
  assert.notEqual(f.run().status, 0);
  assert.equal(f.success(), oldSha);
  assert.ok(!f.commands().some(command => command.includes('build')));
});

test('explicit manual rollback permits an older SHA and preserves previous release marker', t => {
  const f = sandbox(t, { stale: true });
  writeFileSync(join(f.dir, '.git/last-successful-release'), oldSha + '\n');
  const result = f.run('manual');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(readFileSync(join(f.dir, '.git/previous-successful-release'), 'utf8').trim(), oldSha);
});

test('high disk usage fails; cleanup only removes dangling images and old build cache', t => {
  const full = sandbox(t, { disk: 94 });
  assert.notEqual(full.run().status, 0);
  const f = sandbox(t, { disk: 85 });
  assert.equal(f.run().status, 0);
  const commands = f.commands().filter(command => command[0] === 'docker');
  assert.ok(commands.some(command => command.join(' ') === 'docker image prune -f'));
  assert.ok(commands.some(command => command.join(' ') === 'docker builder prune -f --filter until=168h'));
  assert.ok(!commands.some(command => command.includes('--volumes') || command.includes('-af') || command.includes('down')));
});

test('production startup never starts API after migration fails; retry can succeed', t => {
  const dir = mkdtempSync(join(tmpdir(), 'anyostore-start-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'node'), '#!/bin/sh\nprintf "%s\\n" "$1" >> "$STARTUP_LOG"\nif [ "$1" = scripts/migrate.js ]; then exit "${MIGRATE_STATUS:-0}"; fi\n', { mode: 0o755 });
  const log = join(dir, 'startup.log');
  const env = { ...process.env, PATH: dir + ':' + process.env.PATH, STARTUP_LOG: log, MIGRATE_STATUS: '1' };
  const script = join(root, 'backend/scripts/start-production.sh');
  assert.notEqual(spawnSync('sh', [script], { env }).status, 0);
  assert.equal(readFileSync(log, 'utf8'), 'scripts/migrate.js\n');
  env.MIGRATE_STATUS = '0';
  assert.equal(spawnSync('sh', [script], { env }).status, 0);
  assert.ok(readFileSync(log, 'utf8').endsWith('scripts/fix-clone-paths.js\nsrc/index.js\n'));
});
