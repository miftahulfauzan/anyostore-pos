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
  const lockAcquire = remoteScript.indexOf('flock -n 9');
  assert.ok(diagnosticBranch >= 0 && lockAcquire > diagnosticBranch);
  assert.match(remoteScript.slice(diagnosticBranch, lockAcquire), /show_lock_holders/);
  assert.match(remoteScript, /sudo fuser -- "\$lock_file"/);
  assert.match(remoteScript, /sudo ps -p "\$pid" -o pid=,ppid=,stat=,etime=,comm=/);
  assert.doesNotMatch(remoteScript, /-o pid=,ppid=,stat=,etime=,args=/);
});

test('lock diagnostics never log process arguments', () => {
  assert.match(remoteScript, /Do not log argv/);
  assert.match(remoteScript, /EXECUTABLE:/);
});
