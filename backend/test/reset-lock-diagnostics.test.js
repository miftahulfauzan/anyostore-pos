const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/reset-target-branches.yml'), 'utf8');
const remoteScript = fs.readFileSync(path.join(repoRoot, 'scripts/maintenance/reset-target-branches.sh'), 'utf8');

test('provides read-only lock diagnostics before trying to acquire the production lock', () => {
  assert.match(workflow, /options:\s*\[audit, apply, diagnose_lock\]/);
  assert.match(workflow, /\[\[ "\$OPERATION" = audit \|\| "\$OPERATION" = apply \|\| "\$OPERATION" = diagnose_lock \]\]/);
  assert.match(workflow, /if \[\[ "\$OPERATION" = diagnose_lock \]\]; then[\s\S]*?Production lock diagnostics \(read-only\)/);

  const diagnosticBranch = remoteScript.indexOf('if [[ "$operation" = diagnose_lock ]]; then');
  const lockAcquire = remoteScript.indexOf('if [[ "$lock_status" -eq 75 ]]', diagnosticBranch);
  assert.ok(diagnosticBranch >= 0 && lockAcquire > diagnosticBranch);
  assert.match(remoteScript.slice(diagnosticBranch, lockAcquire), /show_lock_holders/);
  assert.match(remoteScript, /stat -Lc '%t %T %i' "\$lock_file"/);
  assert.match(remoteScript, /\/proc\/locks/);
  assert.match(remoteScript, /flock -n -E 75 9/);
  assert.match(remoteScript, /sudo -n fuser "\$lock_file"/);
  assert.doesNotMatch(remoteScript, /sudo -n fuser -- "\$lock_file"/);
  assert.match(remoteScript, /command -v fuser/);
  assert.match(remoteScript, /sudo -n ps -p "\$pid" -o pid=,ppid=,stat=,etime=,comm=/);
  assert.doesNotMatch(remoteScript, /-o pid=,ppid=,stat=,etime=,args=/);
});

test('lock diagnostics distinguish contention from probe and inspection errors', () => {
  assert.match(remoteScript, /FUSER_EXIT_STATUS:/);
  assert.match(remoteScript, /KERNEL_LOCKS_EXIT_STATUS:/);
  assert.match(remoteScript, /LOCK_PROBE_EXIT_STATUS:/);
  assert.match(remoteScript, /75\)\s+printf 'LOCK_PROBE: held/);
  assert.match(remoteScript, /\*\)\s+printf 'LOCK_PROBE: error/);
  assert.doesNotMatch(remoteScript, /sudo -n fuser -- "\$lock_file" 2>\/dev\/null \|\| true/);
});

test('lock diagnostics never log process arguments', () => {
  assert.match(remoteScript, /Do not log argv/);
  assert.match(remoteScript, /EXECUTABLE:/);
});
