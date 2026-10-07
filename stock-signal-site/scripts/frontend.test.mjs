import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/load\(true\);\s*$/, '');
function setup(data={}){
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelectorAll(){return []},querySelector(){return element('child')}});return elements.get(id)};
 const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},fetch:async()=>({ok:true,json:async()=>data}),requestAnimationFrame(){},setTimeout,clearTimeout,console,window:{},localStorage:{getItem:()=>null}});
 vm.runInContext(source,context);
 return {run:code=>vm.runInContext(code,context),element};
}
const stat={ev:.02,winRate:.6,payoff:null,n:30,avgWin:.04,avgLoss:.02};
const signal=(extra={})=>({type:'ma10',status:'in',validated:true,trainScore:.03,bh:10,st:{10:stat},badge:'10',desc:'test',zoneLo:90,zoneHi:110,...extra});
const stock=(extra={})=>({sym:'abc',name:'Example',sector:'Tech',country:'us',rs:90,stale:false,sigs:[signal()],...extra});
test('only fresh validated first entries qualify',()=>{
 const {run}=setup();
 const rows=[stock(),stock({sym:'stale',stale:true}),stock({sym:'missing',stale:undefined}),stock({sym:'invalid',sigs:[signal({validated:false})]}),stock({sym:'wait',sigs:[signal({status:'wait'})]})];
 run(`TREND=${JSON.stringify(rows)}`);
 assert.equal(run('buildCands().length'),1);
 assert.equal(run('buildCands()[0].a.sym'),'abc');
});
test('per-stock signal selection uses training score rather than validation return',()=>{
 const {run}=setup();const highTrain=signal({type:'training',trainScore:.1,st:{10:{...stat,ev:.001}}});const highValidation=signal({type:'validation',trainScore:.01,st:{10:{...stat,ev:5}}});
 run(`TREND=${JSON.stringify([stock({sigs:[highValidation,highTrain]})])}`);
 assert.equal(run('buildCands()[0].s.type'),'training');
 assert.equal(run('chooseSignal(TREND[0].sigs).type'),'training');
});
test('renderers tolerate undefined payoff and escape external names',()=>{
 const {run,element}=setup();const external='<img src=x onerror=alert(1)>';
 run(`DATA={};TREND=${JSON.stringify([stock({name:external,sector:'A"<b>'})])};STOCKS=[];renderTrend()`);
 const table=element('#view').innerHTML;
 assert.ok(table.includes('&lt;img'));
 assert.ok(!table.includes(external));
 assert.ok(table.includes('2.00%'));
 assert.ok(table.includes('—'));
 run('openDetail(TREND[0],TREND[0].sigs[0])');
 assert.ok(element('#modal').innerHTML.includes('&lt;img'));
});
test('old schemas are rejected before recommendation rendering',async()=>{
 const {run,element}=setup({schemaVersion:3,trend:[stock()]});
 await run('load(false)');
 assert.equal(run('DATA'),null);
 assert.ok(element('#warn').textContent.includes('v4'));
 assert.ok(!element('#view').innerHTML.includes('Example'));
});
test('schema4 loads training-selected map and warnings as text',async()=>{
 const {run,element}=setup({schemaVersion:4,builtAt:new Date().toISOString(),trend:[stock()],stocks:[],warnings:['<script>alert(1)</script>']});
 await run('load(false)');
 assert.equal(run('CANDMAP.abc.s.trainScore'),.03);
 assert.equal(element('#warn').textContent,'<script>alert(1)</script>');
});
