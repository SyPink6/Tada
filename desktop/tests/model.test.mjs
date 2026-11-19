import test from 'node:test';
import assert from 'node:assert/strict';
import{initialState,transition,suggest}from'../src/model.mjs';
const create=()=>transition({...initialState(),draft:'做作品集'},{type:'create'});
test('empty input cannot create a task',()=>assert.equal(transition(initialState(),{type:'create'}).task,null));
test('a completed step is recorded once and never completes the whole task',()=>{
 let s=transition(create(),{type:'status',value:'active'});s=transition(s,{type:'complete'});s=transition(s,{type:'complete'});
 assert.equal(s.history.length,1);assert.equal(s.task.status,'celebrating');assert.equal(s.task.steps.filter(x=>x.done).length,1);
 s=transition(s,{type:'next'});assert.equal(s.task.index,1);assert.equal(s.task.status,'ready');
});
test('recovery preserves the exact current step and prior progress',()=>{
 let s=transition(create(),{type:'status',value:'active'});s=transition(s,{type:'complete'});s=transition(s,{type:'next'});
 const id=s.task.steps[1].id;s=transition(s,{type:'status',value:'recovering'});
 assert.equal(s.task.steps[1].id,id);assert.equal(s.task.steps[0].done,true);
});
test('shrinking and editing retain previous action versions',()=>{
 let s=create(),old=s.task.steps[0].title;s=transition(s,{type:'shrink'});assert.equal(s.task.steps[0].revisions[0],old);
 const shrunk=s.task.steps[0].title;s=transition(s,{type:'edit',value:'只打开文档'});assert.equal(s.task.steps[0].revisions[1],shrunk);
});
test('manual first step is respected and full completion requires final confirmation',()=>{
 let s=transition({...initialState(),draft:'练习'},{type:'create',manual:'打开练习题'});assert.equal(s.task.steps.length,1);
 s=transition(s,{type:'status',value:'active'});s=transition(s,{type:'complete'});assert.equal(s.task.status,'celebrating');
 s=transition(s,{type:'next'});assert.equal(s.task.status,'done');
});
test('examples remain at most three steps and are relevant to reading',()=>{assert.equal(suggest('读书').length,3);assert.match(suggest('读书')[0],/书/);});
