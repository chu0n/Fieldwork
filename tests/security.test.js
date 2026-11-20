import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8');
test('project pins its toolchain and keeps one dependency lockfile',()=>{
 const p=JSON.parse(read('package.json'));assert.equal(p.packageManager,'pnpm@12.15.0');assert.equal(p.engines.node,'>=24.22.1 <25');
 assert.equal(existsSync(new URL('package-lock.json',root)),false);assert.equal(existsSync(new URL('bun.lock',root)),false);
 for(const version of Object.values({...p.dependencies,...p.devDependencies}))assert.match(version,/^\d+\.\d+\.\d+$/);
 assert.match(read('pnpm-lock.yaml'),/integrity: sha512-/);
});
test('project policy blocks install scripts, package-manager downloads and automatic installs on run',()=>{
 const policy=read('pnpm-workspace.yaml');for(const line of ['ignoreScripts: true','ignorePnpmfile: true','strictDepBuilds: true','blockExoticSubdeps: true','verifyStoreIntegrity: true','verifyDepsBeforeRun: error','pmOnFail: error','runtimeOnFail: error','minimumReleaseAge: 1440'])assert.ok(policy.includes(line),line);
 assert.match(read('.npmrc'),/^ignore-scripts=true$/m);
});
test('real pnpm install skips root lifecycle scripts and pnpmfile hooks',t=>{
 const pnpm=process.env.npm_execpath;if(!pnpm||!existsSync(pnpm)||!/[\\/]pnpm(?:\.exe|\.c?js|\.mjs)?$/i.test(pnpm)){t.skip('Run through pnpm test to exercise the real installer.');return;}
 const dir=mkdtempSync(join(tmpdir(),'fieldwork-security-'));t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'fieldwork-security-'));rmSync(dir,{recursive:true,force:true});});
 writeFileSync(join(dir,'package.json'),JSON.stringify({name:'fieldwork-security-fixture',version:'1.0.0',private:true,scripts:{preinstall:'node -e "process.exit(91)"',postinstall:'node -e "process.exit(92)"'}}));
 writeFileSync(join(dir,'pnpm-workspace.yaml'),read('pnpm-workspace.yaml'));
 for(const name of ['.pnpmfile.mjs','.pnpmfile.cjs'])writeFileSync(join(dir,name),'throw new Error("pnpmfile must never run");');
 const output=execFileSync(pnpm,['install','--offline','--reporter=append-only'],{cwd:dir,encoding:'utf8',timeout:30000,env:{...process.env,CI:'true'}});assert.match(output,/Done|up to date/);
});
