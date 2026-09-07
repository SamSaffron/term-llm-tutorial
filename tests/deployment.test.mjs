import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('workflow pins actions and separates unprivileged build from gated deploy', async () => {
  const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');
  const actions = [...workflow.matchAll(/uses: (\S+)/g)].map(m => m[1]);
  assert.equal(actions.length, 6);
  for (const action of actions) assert.match(action, /^actions\/[\w-]+@[a-f0-9]{40}$/);
  const [build, deploy] = workflow.split('\n  deploy:\n');
  assert.doesNotMatch(build, /secrets\./);
  assert.match(deploy, /needs: build/);
  assert.match(deploy, /environment: production/);
  assert.match(deploy, /vars\.PRODUCTION_DEPLOY_ENABLED == 'true'/);
  assert.match(deploy, /github\.event_name != 'pull_request'/);
  assert.doesNotMatch(deploy, /npm ci|build\.mjs|stage-hosting\.mjs/);
  assert.doesNotMatch(workflow, /pull_request_target/);
});

test('upload rejects root accounts and symlinks, uses only constrained rsync', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tutorial-deploy-'));
  try {
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, 'hosting/site/learn'), {recursive: true});
    await mkdir(join(root, 'bin'));
    await copyFile('scripts/deploy-learn.sh', join(root, 'scripts/deploy-learn.sh'));
    await writeFile(join(root, 'hosting/site/learn/index.html'), 'test');
    await writeFile(join(root, 'hosting/asset-manifest.json'), '[]');
    await writeFile(join(root, 'bin/rsync'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', {mode: 0o755});
    const run = host => spawnSync('bash', ['scripts/deploy-learn.sh'], {
      cwd: root, encoding: 'utf8', env: {...process.env, DEPLOY_HOST: host, PATH: `${root}/bin:${process.env.PATH}`},
    });
    assert.notEqual(run('root@example.test').status, 0);
    const ok = run('tutorial-deploy@example.test');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /tutorial-deploy@example\.test:\.\//);
    assert.match(ok.stdout, /StrictHostKeyChecking=yes/);
    assert.doesNotMatch(ok.stdout, /--delete/);
    await symlink('/etc/passwd', join(root, 'hosting/site/learn/unsafe'));
    const bad = run('tutorial-deploy@example.test');
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /Refusing symlinks/);
  } finally { await rm(root, {recursive: true, force: true}); }
});
