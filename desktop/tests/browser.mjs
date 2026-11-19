import{chromium}from'playwright-core';
import{mkdir,writeFile}from'node:fs/promises';
import path from'node:path';
import assert from'node:assert/strict';
const out=path.resolve('work','browser-check-'+Date.now());await mkdir(out,{recursive:true});
const context=await chromium.launchPersistentContext(path.join(out,'browser-profile'),{executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,viewport:{width:1440,height:1000},args:['--disable-gpu-shader-disk-cache','--disk-cache-size=0']});
const page=context.pages()[0]||await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4174');await page.getByLabel('此刻，想从哪件事开始？').waitFor();
 await page.screenshot({path:path.join(out,'01-desktop-home.png'),fullPage:true});
 await page.getByRole('button',{name:'帮我找第一步',exact:true}).click();await page.getByRole('alert').waitFor();
 await page.getByRole('button',{name:'整理作品集',exact:true}).click();await page.getByRole('button',{name:'帮我找第一步',exact:true}).click();
 await page.getByRole('heading',{name:'打开一个空白文档',exact:true}).waitFor();
 await page.getByRole('button',{name:'还是有点大，再小一点',exact:true}).click();
 await page.getByRole('heading',{name:'先找到准备使用的文档入口',exact:true}).waitFor();
 await page.getByRole('button',{name:'就做这一步',exact:true}).click();
 await page.getByRole('button',{name:'我分心了',exact:true}).click();await page.getByRole('button',{name:'接着做这一步',exact:true}).waitFor();
 await page.screenshot({path:path.join(out,'02-recovery.png'),fullPage:true});
 await page.reload();await page.getByRole('button',{name:'接着做这一步',exact:true}).waitFor();
 await page.getByRole('button',{name:'接着做这一步',exact:true}).click();await page.getByRole('button',{name:'完成这一步',exact:true}).click();
 await page.getByRole('heading',{name:/这一小步完成啦/}).waitFor();await page.screenshot({path:path.join(out,'03-celebration.png'),fullPage:true});
 await page.getByRole('button',{name:/小步记录/}).click();await page.getByRole('heading',{name:'每一步，都留在这里。'}).waitFor();assert.equal(await page.locator('.journal-list article').count(),1);
 await page.locator('nav').getByRole('button',{name:'陪伴偏好',exact:true}).click();await page.getByRole('switch',{name:'轻轻呼吸',exact:true}).click();await page.reload();await page.locator('nav').getByRole('button',{name:'陪伴偏好',exact:true}).click();assert.equal(await page.getByRole('switch',{name:'轻轻呼吸',exact:true}).getAttribute('aria-checked'),'true');
 await page.getByRole('button',{name:'只留小团子',exact:true}).click();assert.equal(await page.locator('.companion-card').count(),0);await page.getByRole('button',{name:'展开 Tada 任务面板',exact:true}).click();assert.equal(await page.locator('.companion-card').count(),1);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'04-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,checks:['blank input','example suggestions','shrink','start','recovery','reload persistence','completion','journal','preferences persistence','collapse/expand','mobile overflow','no renderer errors'],errors},null,2),{flag:'wx'});
 console.log('Browser checks passed:',out);
}finally{await context.close();}
