import React,{useEffect,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import{initialState,transition}from'./model.mjs';
import{load,save}from'./storage.mjs';
import * as api from './api.mjs';
import './styles.css';

function Icon({name,size=20,...props}){
 const paths={spark:'m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z',leaf:'M19 4C7 2 2 9 7 16c7 5 14 0 12-12ZM6 19l9-10',check:'m5 12 4 4L19 6',arrow:'M5 12h14m-5-5 5 5-5 5',moon:'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z',close:'m6 6 12 12M6 18 18 6',minus:'M5 12h14',plus:'M5 12h14M12 5v14',back:'M19 12H5m5-5-5 5 5 5',settings:'M4 7h16M4 17h16M8 4v6m8 4v6',clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',pin:'m8 3 8 0-1 6 3 3H6l3-3-1-6Zm4 9v9',cup:'M5 7h12v7a5 5 0 0 1-10 0V7Zm12 1h2a3 3 0 0 1 0 6h-2M5 21h14',edit:'m15 4 5 5L9 20H4v-5L15 4Z',grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'};
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]||paths.spark}/></svg>;
}
function Dango({sleep=false,happy=false,motion=false}){return <svg className={`dango ${motion?'breathing':''}`} viewBox="0 0 180 150" fill="none" aria-hidden="true"><defs><radialGradient id="body"><stop stopColor="#FFF5D9"/><stop offset="1" stopColor="#F5D9AA"/></radialGradient><filter id="shadow"><feGaussianBlur stdDeviation="4"/></filter></defs><ellipse cx="91" cy="133" rx="54" ry="7" fill="#94734A" opacity=".14" filter="url(#shadow)"/><ellipse cx="64" cy="123" rx="16" ry="9" fill="#EFC493"/><ellipse cx="116" cy="123" rx="16" ry="9" fill="#EFC493"/><path d="M30 92C20 62 43 34 66 26c16-14 43-14 55 1 25 8 47 30 40 60-5 31-29 42-68 42-37 0-58-11-63-37Z" fill="url(#body)" stroke="#DDC399" strokeWidth="1.2"/><path d="M43 64c5-15 16-23 28-27" stroke="#FFFDF1" strokeWidth="5" strokeLinecap="round" opacity=".8"/><ellipse cx="57" cy="91" rx="11" ry="6" fill="#EDB7A0" opacity=".75"/><ellipse cx="126" cy="91" rx="11" ry="6" fill="#EDB7A0" opacity=".75"/>{sleep?<><path d="m70 80 9 2m27 0 9-2" stroke="#6B5141" strokeWidth="3" strokeLinecap="round"/><path d="M86 94h10" stroke="#6B5141" strokeWidth="2.5" strokeLinecap="round"/></>:<><ellipse cx="76" cy="80" rx="3.2" ry="4" fill="#604B3C"/><ellipse cx="108" cy="80" rx="3.2" ry="4" fill="#604B3C"/><path d={happy?'M84 93q8 13 16 0Z':'M86 93q6 7 12 0'} stroke="#604B3C" strokeWidth="2.2" fill={happy?'#C2886F':'none'} strokeLinecap="round"/></>}{happy&&<path d="m150 21 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#D5AD62"/>}</svg>}

const view=new URLSearchParams(location.search).get('view')||'preview';
function PetOnly(){return <div className="native-pet"><div className="pet-drag" title="按住这里拖动小团子">⠿</div><button className="pet-button" aria-label="展开 Tada 任务面板" onClick={()=>window.tada?.toggle()}><Dango/><span className="pet-label">Tada!</span></button><button className="pet-collapse" aria-label="收起小团子" title="收起小团子，藏到托盘" onClick={()=>window.tada?.rest()}><Icon name="minus" size={13}/></button></div>}
function App(){
 const[state,setState]=useState(initialState),[loaded,setLoaded]=useState(false),[saveError,setSaveError]=useState(''),[expanded,setExpanded]=useState(true),[tab,setTab]=useState('plan'),[manual,setManual]=useState(false),[manualText,setManualText]=useState(''),[editing,setEditing]=useState(false),[editText,setEditText]=useState(''),[inputError,setInputError]=useState('');
 const native=view==='panel',queue=useRef(Promise.resolve()),latest=useRef(state),dialogRef=useRef(null);
 useEffect(()=>{load().then(s=>{if(s?.version===1){latest.current=s;setState(s);}setLoaded(true);}).catch(()=>{setSaveError('未能读取本地记录，本次操作仍可继续。');setLoaded(true);});},[]);
 function dispatch(action){const next=transition(latest.current,action);latest.current=next;setState(next);queue.current=queue.current.then(()=>save(next)).then(()=>setSaveError('')).catch(()=>setSaveError('暂时未能保存。请先保留此窗口，稍后操作会再次尝试。'));}
 useEffect(()=>{if(native)window.tada?.onTop(state.preferences.onTop);},[state.preferences.onTop,native]);
 useEffect(()=>{if(tab==='settings')dialogRef.current?.focus();},[tab]);
 useEffect(()=>{const key=e=>{if(e.key==='Escape'){setTab('home');setEditing(false);if(native)window.tada?.collapse();else setExpanded(false);}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[native]);
 function collapse(){if(native)window.tada?.collapse();else setExpanded(false);}
 function submit(e){e.preventDefault();if(!state.draft.trim()){setInputError('先写下想做的事，一个词也可以。');return;}if(manual&&!manualText.trim()){setInputError('写下你想尝试的第一步。');return;}dispatch({type:'create',manual:manual?manualText.trim():null});setInputError('');setManual(false);}
 const task=state.task,step=task?.steps[task.index],compose=!task||state.view==='compose',celebrating=task?.status==='celebrating',done=task?.status==='done',paused=task?.status==='paused'||task?.status==='parked',recovering=task?.status==='recovering',active=task?.status==='active';
 const recent=state.history.slice(-3).reverse();
 function newTask(){dispatch({type:'new'});setTab('home');setExpanded(true);}
 function settings(){setTab(tab==='settings'?'home':'settings');setExpanded(true);}

 const card=<section className={`companion-card ${native?'native-card':''}`} aria-label="Tada 任务助手">
  <header className="card-header"><span className="wordmark">Tada<span>!</span><i/></span><div className="window-controls"><button className="icon-button" onClick={settings} aria-label="陪伴偏好"><Icon name="settings" size={18}/></button><button className="icon-button" onClick={collapse} aria-label="收起面板"><Icon name="minus" size={18}/></button></div></header>
  {tab==='settings'?<div className="card-body settings" tabIndex={-1} ref={dialogRef}><button className="text-button back" onClick={()=>setTab('home')}><Icon name="back" size={17}/>回到小步</button><div className="eyebrow">MAKE YOURSELF AT HOME</div><h2>以你舒服的方式。</h2><p className="muted">陪伴的分寸，由你来定。</p><Toggle title="轻轻呼吸" desc="默认静止。打开后，小团子会缓慢呼吸。" checked={state.preferences.motion} onChange={v=>dispatch({type:'preferences',value:{motion:v}})}/><Toggle title="陪在窗口上方" desc={native?'团子始终置顶可见；开启后任务面板也常驻最前。':'桌面版生效，预览中仅保存偏好。'} checked={state.preferences.onTop} onChange={v=>dispatch({type:'preferences',value:{onTop:v}})}/><div className="quiet-note"><Icon name="moon"/><div>安静，是默认设置。<small>没有声音、弹窗提醒或打卡压力。</small></div></div>{native&&<button className="secondary full" onClick={()=>window.tada.rest()}>先休息，藏到托盘</button>}<p className="privacy-note">示例模式 · 不调用 AI · 仅本机保存<br/>不自动启动，也不读取其他窗口。</p></div>:
  <div className="card-body">{!loaded?<p className="muted">正在找回你的小步…</p>:compose?<>
    <div className="soft-badge"><Icon name="leaf" size={14}/> 一次，只做一小步</div>
    <h1>先做一点点，<br/>就很好。</h1><p className="muted intro">不用准备好一切。<br/>把想做的事放在这里吧。</p>
    <form onSubmit={submit}><label htmlFor="task-input">此刻，想从哪件事开始？</label><div className="input-wrap"><textarea id="task-input" maxLength={2000} rows={2} value={state.draft} onChange={e=>{dispatch({type:'draft',value:e.target.value});setInputError('');}} placeholder="例如：开始整理我的作品集"/><span className="input-spark"><Icon name="spark" size={17}/></span></div>
    <div className="suggestions">{['整理作品集','读一会儿书'].map(s=><button type="button" key={s} onClick={()=>dispatch({type:'draft',value:s})}>{s}</button>)}</div>
    {manual&&<label className="manual-label">我想尝试的第一步<input maxLength={100} value={manualText} onChange={e=>setManualText(e.target.value)} placeholder="例如：打开一个空白文档" autoFocus/></label>}
    {inputError&&<p className="form-error" role="alert">{inputError}</p>}
    <button className="primary full" type="submit">{manual?'就从这一步开始':'帮我找第一步'}<Icon name="arrow" size={19}/></button></form>
    <button className="text-button centered" onClick={()=>{setManual(!manual);setInputError('');}}>{manual?'使用示例建议':'我已经知道第一步'}</button>
    {task&&<button className="text-button centered" onClick={()=>dispatch({type:'restore'})}>回到之前的小步</button>}
   </>:celebrating||done?<div className="celebration" aria-live="polite"><span className="soft-badge"><Icon name="spark" size={14}/> 每一小步，都值得庆祝</span><Dango happy motion={state.preferences.motion}/><h1>{done?'今天的这件事，\n走完啦。':'Tada!\n这一小步完成啦。'}</h1><p className="muted">{done?'可以在这里歇一会儿。':'你刚刚做到了：'}</p><div className="completed-step"><Icon name="check"/>{done?task.title:step.title}</div><p className="gentle-line">不用急着赶下一步，先收下这个小小的好。</p>{!done&&<button className="primary full" onClick={()=>dispatch({type:'next'})}>{task.index+1<task.steps.length?'想再走一小步':'收好这份完成'}<Icon name="arrow" size={18}/></button>}<button className="text-button centered" onClick={done?newTask:collapse}>{done?'放一件新的小事进来':'先歇一会儿'}</button></div>:<>
    <div className={`soft-badge ${recovering?'lilac':''}`}><Icon name={recovering?'leaf':paused?'moon':active?'cup':'spark'} size={14}/>{recovering?'欢迎回来':paused?'进度好好地留在这里':active?'我在这里，陪着你':'找到一个小小的起点'}</div>
    <p className="task-context">想做的事<span>{task.title}</span></p>
    <h1 className="action-heading">{recovering?'没关系，\n我们接着这里。':paused?'休息一下，\n也完全可以。':active?'现在，\n只看眼前这一步。':'这次，\n只做这一点点。'}</h1>
    <div className={`step-card ${active?'active-step':''}`}><div className="step-meta"><span>第 {task.index+1} 小步 / 共 {task.steps.length} 步</span><button className="icon-button" aria-label="编辑当前小步" onClick={()=>{setEditing(!editing);setEditText(step.title);}}><Icon name="edit" size={16}/></button></div>{editing?<form onSubmit={e=>{e.preventDefault();dispatch({type:'edit',value:editText});setEditing(false);}}><input aria-label="当前小步" value={editText} maxLength={100} onChange={e=>setEditText(e.target.value)} autoFocus/><button className="text-button" disabled={!editText.trim()}>保存这一步</button></form>:<h2>{step.title}</h2>}<p>{active?'不必盯着时间。完成后，再回来告诉我。':'只需要尝试这一步，后面的事等一等。'}</p></div>
    <button className="primary full" onClick={()=>dispatch(active?{type:'complete'}:{type:'status',value:'active'})}><Icon name={active?'check':'arrow'} size={19}/>{active?'完成这一步':recovering||paused?'接着做这一步':'就做这一步'}</button>
    <div className="secondary-row">{active?<><button onClick={()=>dispatch({type:'status',value:'recovering'})}>我分心了</button><span/><button onClick={()=>dispatch({type:'status',value:'paused'})}>先暂停</button></>:<><button onClick={()=>dispatch({type:'shrink'})}>还是有点大，再小一点</button><span/><button onClick={collapse}>收起陪伴</button></>}</div>
    <div className="steps-dots" aria-label={`已完成 ${task.steps.filter(s=>s.done).length} 步`}>{task.steps.map((s,i)=><i key={s.id} className={s.done?'finished':i===task.index?'current':''}/>)}</div>
   </>}
   <footer className="card-footer"><span className="tiny-dot"/>示例模式 · {saveError?'保存遇到问题':'进度仅保存在本机'}</footer>{saveError&&<p className="form-error" role="alert">{saveError}</p>}
  </div>}
 </section>;
 if(native)return <main className={`native-root ${state.preferences.motion?'motion':''}`}>{card}</main>;
 return <main className="studio"><aside className="sidebar"><div className="brand"><span className="brand-icon"><Icon name="spark" size={23}/></span><span>Tada<span className="brand-exclaim">!</span></span></div><p className="brand-sub">让每一小步，都有陪伴。</p><div className="nav-label">MY LITTLE SPACE</div><nav aria-label="主导航"><button className={tab==='home'?'selected':''} onClick={()=>{setTab('home');setExpanded(true);}}><Icon name="grid"/>我的角落<span className="nav-dot"/></button><button className={tab==='plan'?'selected':''} onClick={()=>setTab('plan')}><Icon name="spark"/>和团子聊聊<span className="nav-dot"/></button><button className={tab==='snippets'?'selected':''} onClick={()=>setTab('snippets')}><Icon name="leaf"/>随手记</button><button className={tab==='calendar'?'selected':''} onClick={()=>setTab('calendar')}><Icon name="clock"/>日历</button><button className={tab==='journal'?'selected':''} onClick={()=>setTab('journal')}><Icon name="leaf"/>小步记录{state.history.length>0&&<small>{state.history.length}</small>}</button><button className={tab==='settings'?'selected':''} onClick={settings}><Icon name="settings"/>陪伴偏好</button></nav><div className="sidebar-note"><span className="note-star">✳</span><p>不必一下子<br/>成为很厉害的人。</p><span>今天，先做一点点就好。</span><svg viewBox="0 0 140 35" aria-hidden="true"><path d="M3 25q25-20 45-4t44-3 44-6" fill="none" stroke="#B8BDA3" strokeWidth="2"/></svg></div><div className="sidebar-bottom"><span className="online-dot"/><span>安静陪伴中<small>没有催促，也没有落后。</small></span></div></aside>
 <section className="workspace"><header className="workspace-header"><div><span className="breadcrumb">我的空间 <span>/</span> {tab==='plan'?'和团子聊聊':tab==='snippets'?'随手记':tab==='calendar'?'日历':tab==='journal'?'小步记录':'桌面陪伴'}</span><h2>{tab==='plan'?'想到什么，就告诉团子。':tab==='snippets'?'按类别整理你的零碎记录。':tab==='calendar'?'所有天的小步，都在这里。':tab==='journal'?'那些小小的做到，都算数。':'留一点空间，慢慢来。'}</h2>{tab==='plan'&&<p className="header-sub">待办、日程，或是突然冒出来的小想法，团子都会帮你整理好。</p>}</div>{tab!=='plan'&&tab!=='calendar'&&tab!=='snippets'&&<button className="outline-button" onClick={()=>{setTab('home');setExpanded(!expanded);}}><Icon name={expanded?'minus':'plus'} size={17}/>{expanded?'只留小团子':'展开任务卡'}</button>}</header>
 {tab==='plan'?<PlanView onGoCalendar={()=>setTab('calendar')}/>:tab==='snippets'?<SnippetsView/>:tab==='calendar'?<CalendarView onGoPlan={()=>setTab('plan')}/>:tab==='journal'?<section className="journal"><span className="eyebrow">LITTLE STEPS, REAL PROGRESS</span><h1>每一步，都留在这里。</h1><p className="muted">没有连续打卡。只有你已经走过的路。</p>{state.history.length?<div className="journal-list">{[...state.history].reverse().map(item=><article key={item.id}><span className="journal-check"><Icon name="check"/></span><div><h3>{item.title}</h3><p>{item.taskTitle}</p></div><time>{new Date(item.at).toLocaleDateString('zh-CN',{month:'long',day:'numeric'})}</time></article>)}</div>:<div className="empty-state"><Dango sleep/><h3>不用急着填满这里。</h3><p>完成一小步，它就会安静地留下来。</p><button className="secondary" onClick={()=>{setTab('home');setExpanded(true);}}>回去找一小步<Icon name="arrow" size={16}/></button></div>}</section>:<div className={`desktop-scene ${expanded?'is-expanded':'is-collapsed'}`}><Landscape/>
 <div className="desktop-status"><span className="online-dot"/>{active?'只做眼前这一小步':'小团子在这里，安静陪着你'}<span className="status-divider"/><Icon name="moon" size={14}/> 免打扰</div>
 <div className="scene-poem"><span>ONE SMALL STEP AT A TIME</span><h2>今天，也按照<br/>自己的节奏来。</h2><p>不需要一直专注。<br/>回来时，我帮你接上。</p><div className="poem-line"/></div>
 <div className="desktop-note"><span className="tape"/><Icon name="leaf" size={21}/><p>{recent.length?'你已经做到了':'今天的小约定'}</p><h3>{recent[0]?.title||'把「开始」，\n变得再轻一点。'}</h3><small>{recent.length?'这一小步，值得被记住。':'只走一步，也是在向前。'}</small></div>
 {expanded&&<div className="card-anchor">{card}<div className="popover-tail"/></div>}
 <div className="scene-pet"><button className="preview-pet-button" onClick={()=>setExpanded(!expanded)} aria-label={expanded?'收起 Tada 任务面板':'展开 Tada 任务面板'}><Dango happy={celebrating} sleep={paused} motion={state.preferences.motion}/></button><span className="pet-caption">{active?'我陪你。':paused?'休息也很好。':'我在，不着急。'}</span></div>
 <div className="desktop-bottom"><span className="desktop-mode"><i/> DESKTOP COMPANION</span><span>需要时点一下 · 不需要时安静陪伴</span></div>
 </div>}
 <footer className="workspace-footer"><span><Icon name="leaf" size={15}/> 每一小步，都值得庆祝。</span><button onClick={newTask}><Icon name="plus" size={15}/>放一件新的小事</button><span className="prototype-label">前端展示版 v0.1</span></footer></section></main>;
}
function SnippetsView(){
 const[snippets,setSnippets]=useState([]);
 const[selectedCat,setSelectedCat]=useState(null);
 const[searchQ,setSearchQ]=useState('');
 const[searchResults,setSearchResults]=useState(null);
 const[searching,setSearching]=useState(false);
 const[loading,setLoading]=useState(true);
 const[editingSource,setEditingSource]=useState(null);
 const[editValue,setEditValue]=useState('');
 const[confirmState,setConfirmState]=useState({open:false,message:'',onConfirm:null});
 async function refresh(){try{const r=await api.listSnippets();setSnippets(r||[]);}catch{setSnippets([]);}setLoading(false);}
 useEffect(()=>{refresh();},[]);
 const categories=[...new Set(snippets.map(s=>s.category).filter(Boolean))];
 const filtered=searchResults!==null?searchResults:(selectedCat===null?snippets:selectedCat==='__uncat'?snippets.filter(s=>!s.category):snippets.filter(s=>s.category===selectedCat));
 function customConfirm(msg,fn){setConfirmState({open:true,message:msg,onConfirm:()=>{setConfirmState({open:false});fn();}});}
 async function doSearch(q){if(!q.trim()){setSearchResults(null);return;}setSearching(true);setSearchResults([]);try{const r=await api.searchKnowledge(q);setSearchResults(r||[]);}catch(e){console.error('search failed:',e);setSearchResults([]);}finally{setSearching(false);}}
 async function removeSnippet(source){customConfirm('确认删除这条记录？',async()=>{try{await api.deleteSnippet(source);await refresh();if(searchResults)doSearch(searchQ);}catch{}});}
 async function saveSnippetTitle(oldSource){setEditingSource(null);if(editValue.trim()&&editValue!==oldSource){try{await api.renameSnippet(oldSource,editValue.trim());await refresh();}catch{}}}
 async function changeCategory(source,cat){try{await api.updateCategory(source,cat||null);await refresh();}catch{}}
 return <section className="snippets-view"><div className="snippets-layout">
  <aside className="snippets-sidebar">
   <button className={selectedCat===null&&!searchResults?'selected':''} onClick={()=>{setSelectedCat(null);setSearchResults(null);}}>全部</button>
   {categories.map(cat=><button key={cat} className={selectedCat===cat&&!searchResults?'selected':''} onClick={()=>{setSelectedCat(cat);setSearchResults(null);}}>{cat}</button>)}
   {snippets.some(s=>!s.category)&&<button className={selectedCat==='__uncat'&&!searchResults?'selected':''} onClick={()=>{setSelectedCat('__uncat');setSearchResults(null);}}>未分类</button>}
  </aside>
  <div className="snippets-main">
   <div className="snippets-search"><input value={searchQ} onChange={e=>{setSearchQ(e.target.value);if(!e.target.value.trim())setSearchResults(null);}} onKeyDown={e=>{if(e.key==='Enter')doSearch(searchQ);}} placeholder="想找点什么？问问团子…"/><button onClick={()=>doSearch(searchQ)}><Icon name="spark" size={16}/>搜一下</button></div>
   {loading?<p className="muted">加载中…</p>:searching?<div className="search-loading"><div className="search-loading-dango"><Dango motion={false}/></div><p className="muted">搜索中…</p></div>:(filtered.length===0?<div className="cal-empty"><Dango sleep/><h3>{searchResults!==null?'没搜到相关记录。':'还没有随手记。'}</h3><p>{searchResults!==null?'换个关键词试试。':'去「和团子聊聊」跟团子说"存一下"+内容。'}</p></div>:
    <div className="snippets-list">{filtered.map(s=><div className="snippet-card" key={s.source}>
     <div className="snippet-card-header">{editingSource===s.source?<input className="snippet-edit" value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={()=>saveSnippetTitle(s.source)} onKeyDown={e=>{if(e.key==='Enter')saveSnippetTitle(s.source);}} autoFocus/>:<strong onClick={()=>{setEditingSource(s.source);setEditValue(s.source);}}>{s.source}</strong>}<select value={s.category||''} onChange={e=>changeCategory(s.source,e.target.value)}><option value="">未分类</option>{categories.map(cat=><option key={cat} value={cat}>{cat}</option>)}</select><button className="task-delete" onClick={()=>removeSnippet(s.source)}><Icon name="close" size={14}/></button></div>
     <p className="snippet-content">{s.content}</p>
    </div>)}</div>)}
  </div>
 </div><ConfirmModal {...confirmState} onCancel={()=>setConfirmState({open:false})}/></section>;
}
function PlanView({onGoCalendar}){
 const today=todayStr();
 const[messages,setMessages]=useState([]);
 const[input,setInput]=useState('');
 const[loading,setLoading]=useState(false);
 const[error,setError]=useState('');
 const[created,setCreated]=useState([]);
 const[demoMode,setDemoMode]=useState(false);
 const[selectedDate,setSelectedDate]=useState(today);
 const[view,setView]=useState('chat');
 const[autoSorting,setAutoSorting]=useState(false);const[dragId,setDragId]=useState(null);const[snippets,setSnippets]=useState([]);const[editingSource,setEditingSource]=useState(null);const[editValue,setEditValue]=useState('');const[confirmState,setConfirmState]=useState({open:false,message:'',onConfirm:null});
 const[dayTasks,setDayTasks]=useState([]);
 const endRef=useRef(null);
 useEffect(()=>{fetch('/api/status').then(r=>r.json()).then(s=>setDemoMode(!!s.demo)).catch(()=>{});},[]);
 async function loadDate(date){setSelectedDate(date);setView('chat');setCreated([]);try{const entries=await api.listDailyLog(date);setMessages(entries.filter(e=>e.type==='chat_user'||e.type==='chat_assistant').map(e=>({role:e.type==='chat_user'?'user':'assistant',content:e.content})));}catch{setMessages([]);}}
 useEffect(()=>{loadDate(today);},[]);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[messages,loading]);
 useEffect(()=>{if(view==='schedule'){api.listTasks(selectedDate).then(r=>setDayTasks(r||[])).catch(()=>setDayTasks([]));}},[view,selectedDate]);
 async function send(text){
  const content=text.trim();if(!content||loading||selectedDate!==today)return;
  setMessages(m=>[...m,{role:'user',content}]);setInput('');setError('');setLoading(true);setCreated([]);
  try{
   const result=await api.chat(selectedDate,content);
   if(result.reply)setMessages(m=>[...m,{role:'assistant',content:result.reply}]);
   if(result.actions){
    const cr=result.actions.filter(a=>a.tool==='create_task'&&a.result&&a.result.ok).map(a=>a.result.task).filter(Boolean);
    if(cr.length)setCreated(cr);
   }
  }catch(e){setError(e.message||'这次没成功，可以再试。');}
  finally{setLoading(false);}
 }
 function reset(){setMessages([]);setInput('');setError('');setCreated([]);}
 async function toggle(id){try{await api.toggleTask(id,selectedDate);const r=await api.listTasks(selectedDate);setDayTasks(r);}catch{}}
 function remove(id){customConfirm('确认删除这个任务？',async()=>{try{await api.deleteTask(id);const r=await api.listTasks(selectedDate);setDayTasks(r);}catch{}});}
 const isToday=selectedDate===today;
 const conflictSet=findConflicts(dayTasks);
 const lastIsUser=messages.length&&messages[messages.length-1].role==='user';
 async function doAutoSort(){const untimed=dayTasks.filter(t=>!t.time);if(untimed.length<2)return;setAutoSorting(true);try{await api.autoSort(selectedDate,untimed.map(t=>({id:t.id,title:t.title})));const r=await api.listTasks(selectedDate);setDayTasks(r||[]);}catch{}setAutoSorting(false);}
 function drop(targetId){if(!dragId||dragId===targetId)return;const ids=dayTasks.filter(t=>!t.time).map(t=>t.id);const from=ids.indexOf(dragId),to=ids.indexOf(targetId);if(from<0||to<0)return;ids.splice(from,1);ids.splice(to,0,dragId);setDragId(null);api.applyOrder(selectedDate,ids).then(()=>{api.listTasks(selectedDate).then(r=>setDayTasks(r||[]));});}
 useEffect(()=>{if(view==='info'){api.listSnippetsByDay(selectedDate).then(r=>setSnippets(r||[])).catch(()=>setSnippets([]));}},[view,selectedDate]);
 function removeSnippet(source){customConfirm('确认删除这条信息？',async()=>{try{await api.deleteSnippet(source);const r=await api.listSnippets();setSnippets(r||[]);}catch{}});}
 async function saveSnippetTitle(oldSource){setEditingSource(null);if(editValue.trim()&&editValue!==oldSource){try{await api.renameSnippet(oldSource,editValue.trim());const r=await api.listSnippets();setSnippets(r||[]);}catch{}}}
 function customConfirm(msg,fn){setConfirmState({open:true,message:msg,onConfirm:()=>{setConfirmState({open:false});fn();}});}
 const tabs=[['chat','全部'],['schedule','日程安排'],['info','随手记'],['microstep','微步执行']];
 return <section className="plan-view">
  <div className="conv-top"><div className="plan-dango"><Dango happy={created.length>0} motion={false}/></div><div className="conv-top-text"><span className="eyebrow">和团子 · {isToday?'今天':selectedDate}{demoMode&&<strong className="demo-tag"> · 示例模式</strong>}</span><div className="conv-date"><input type="date" value={selectedDate} max={today} onChange={e=>e.target.value&&loadDate(e.target.value)}/><button className="text-button" onClick={()=>loadDate(today)}>今天</button></div></div></div>
  <div className="conv-tabs">{tabs.map(([k,label])=><button key={k} className={`conv-tab ${view===k?'active':''}`} onClick={()=>setView(k)}>{label}</button>)}</div>
  {view==='chat'?<div className="chat-area">
   {messages.length===0&&!loading&&<div className="chat-empty"><p className="muted">{isToday?'例如：今天下午三点写 PPT 大纲，明天健身。也可以粘一段文字或链接给团子。':'这一天没有对话记录。'}</p></div>}
   {messages.map((m,i)=><ChatBubble key={i} m={m}/>)}
   {loading&&<div className="bubble-row dango"><div className="bubble-avatar"><Dango motion={false}/></div><div className="bubble bubble-dango typing">团子在想想…</div></div>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div ref={endRef}/>
  </div>:view==='schedule'?<div className="queue-wrap"><div className="queue-head">{dayTasks.some(t=>!t.time)&&dayTasks.length>0&&!autoSorting&&<button className="text-button" onClick={doAutoSort}>自动排序</button>}{autoSorting&&<span className="muted">排序中…</span>}</div><div className="queue-list">{dayTasks.length===0?<div className="cal-empty"><Dango sleep/><h3>{isToday?'今天还没有安排。':selectedDate+' 没有安排。'}</h3>{isToday&&<p className="muted">回「全部聊天」跟团子说要做什么。</p>}</div>:dayTasks.map((tk,i)=><div className={`task-row ${tk.time?'timed':'untimed'} ${tk.done?'done':''}`} key={tk.id} draggable={!tk.time} onDragStart={!tk.time?()=>setDragId(tk.id):undefined} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(tk.id)}><span className="queue-idx">{i+1}</span><div className="task-when">{typeMark(tk)}{tk.time?<span className="time-pill"><Icon name="clock" size={11}/>{tk.time}</span>:<span className="flex-tag">灵活</span>}</div><div className="task-body"><strong>{tk.title}</strong>{conflictSet.has(tk.id)&&<span className="conflict-badge"><Icon name="close" size={11}/>时间冲突</span>}</div><button className="task-check" onClick={()=>toggle(tk.id)} aria-label={tk.done?'标记未完成':'标记完成'}><Icon name={tk.done?'check':'minus'} size={14}/></button><button className="task-delete" onClick={()=>remove(tk.id)} aria-label="删除"><Icon name="close" size={14}/></button></div>)}</div></div>:view==='info'?<div className="snippet-list">{snippets.length===0?<div className="cal-empty"><Dango sleep/><h3>还没有收集零碎信息。</h3><p className="muted">在「全部」跟团子说"存一下"+内容。</p></div>:snippets.map(s=><div className="snippet-row" key={s.source}><div className="snippet-body"><strong onClick={()=>{setEditingSource(s.source);setEditValue(s.source);}}>{s.source}</strong><small>{s.content}</small></div><button className="task-delete" onClick={()=>removeSnippet(s.source)} aria-label="删除"><Icon name="close" size={14}/></button></div>)}</div>:<div className="cal-empty"><Dango sleep/><h3>还没有微步执行记录。</h3><p className="muted">这部分功能在路上。</p></div>}
  {view==='chat'&&created.length>0&&!loading&&<div className="when-plan"><div className="when-head"><span className="when-layer">✓ 已加入日历</span><div className="when-actions"><button className="text-button" onClick={()=>onGoCalendar&&onGoCalendar()}>去日历<Icon name="arrow" size={14}/></button><button className="text-button" onClick={reset}>再说一句</button></div></div><ul className="when-list">{created.map((t,i)=><li key={i}><span className="when-time">{t.recurrence?'↻ '+freqLabel(t.recurrence):(t.time||'灵活')}</span><span className="when-item">{t.title}</span></li>)}</ul></div>}
  {view==='chat'&&isToday&&<form className="chat-input" onSubmit={e=>{e.preventDefault();send(input);}}>
   <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder={lastIsUser?'团子还在想…':'和团子说，或者贴点东西给它…'} rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(input);}}}/>
   <button className="primary" type="submit" disabled={loading||!input.trim()}><Icon name="arrow" size={18}/>发给团子</button>
  </form>}
  <ConfirmModal {...confirmState} onCancel={()=>setConfirmState({open:false})}/>
 </section>;
}
function todayStr(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function ChatBubble({m}){
 if(m.role==='user')return <div className="bubble-row mine"><div className="bubble bubble-user">{m.content}</div></div>;
 if(m.role==='assistant'){
  if(m.tool_calls&&m.tool_calls.length)return <div className="bubble-row dango"><div className="bubble-avatar"><Dango motion={false}/></div><div className="tool-chips">{m.tool_calls.map((tc,i)=>{let a={};try{a=JSON.parse(tc.function.arguments||'{}');}catch{};const label=tc.function.name==='create_task'?(a.recurrence?'↻ '+freqLabel(a.recurrence)+' ':a.time?a.time+' ':'')+a.title:tc.function.name;return <span className="tool-chip" key={i}><Icon name="plus" size={11}/>{label}</span>;})}</div></div>;
  return <div className="bubble-row dango"><div className="bubble-avatar"><Dango happy motion={false}/></div><div className="bubble bubble-dango">{m.content}</div></div>;
 }
 return null;
}
function freqLabel(r){if(!r)return'';if(r.freq==='daily')return'每天';if(r.freq==='weekdays')return'工作日';if(r.freq==='weekly')return'每周'+['日','一','二','三','四','五','六'][r.days?.[0]??0];return'';}
function typeMark(tk){if(tk.type==='long')return <span className="type-mark long">↻ {freqLabel(tk.recurrence)}</span>;if(tk.type==='short')return <span className="type-mark short">短期</span>;return null;}
function findConflicts(list){const set=new Set();const map={};for(const t of list){if(!t.time)continue;const k=(t.startDate||t.date)+'@'+t.time;(map[k]=map[k]||[]).push(t.id);}for(const k in map){if(map[k].length>1)for(const id of map[k])set.add(id);}return set;}
function CalendarView({onGoPlan}){
 const[tasks,setTasks]=useState([]);
 const[loading,setLoading]=useState(true);
 const[cursor,setCursor]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);});
 const[selectedDate,setSelectedDate]=useState(null);
 const[dayTasks,setDayTasks]=useState([]);const[confirmState,setConfirmState]=useState({open:false,message:'',onConfirm:null});
 async function refresh(){try{const r=await api.listTasks();setTasks(r||[]);}catch{setTasks([]);}setLoading(false);}
 useEffect(()=>{refresh();},[]);
 useEffect(()=>{if(selectedDate){api.listTasks(selectedDate).then(r=>setDayTasks(r||[])).catch(()=>setDayTasks([]));}},[selectedDate]);
 async function toggle(id){try{await api.toggleTask(id,selectedDate);const r=await api.listTasks(selectedDate);setDayTasks(r);}catch{}}
 function remove(id){customConfirm('确认删除这个任务？',async()=>{try{await api.deleteTask(id);const r=await api.listTasks(selectedDate);setDayTasks(r);}catch{}});}
 function customConfirm(msg,fn){setConfirmState({open:true,message:msg,onConfirm:()=>{setConfirmState({open:false});fn();}});}
 const weekdays=['日','一','二','三','四','五','六'];const monthNames=['1 月','2 月','3 月','4 月','5 月','6 月','7 月','8 月','9 月','10 月','11 月','12 月'];
 const t=new Date();const todayIso=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
 if(selectedDate){
  const dt=new Date(selectedDate+'T00:00:00');const isToday=selectedDate===todayIso;const conflictSet=findConflicts(dayTasks);
  return <section className="calendar-view">
   <header className="cal-header"><button className="text-button" onClick={()=>setSelectedDate(null)}><Icon name="back" size={16}/>返回日历</button><div className="cal-title"><h2>{dt.getMonth()+1} 月 {dt.getDate()} 日 · {weekdays[dt.getDay()]}{isToday?'（今天）':''}</h2><small>{dayTasks.length} 项，已完成 {dayTasks.filter(x=>x.done).length}</small></div><span className="cal-spacer"/></header>
   <div className="day-detail-list">
    {dayTasks.length===0?<div className="cal-empty"><Dango sleep/><h3>这一天还没有安排。</h3><p>去「和团子聊聊」加一点想做的事吧。</p><button className="secondary" onClick={()=>onGoPlan&&onGoPlan()}>和团子聊聊<Icon name="arrow" size={14}/></button></div>
    :dayTasks.map((tk,i)=><div className={`task-row ${tk.time?'timed':'untimed'} ${tk.done?'done':''}`} key={tk.id}><span className="queue-idx">{i+1}</span><div className="task-when">{typeMark(tk)}{tk.time?<span className="time-pill"><Icon name="clock" size={11}/>{tk.time}</span>:<span className="flex-tag">灵活</span>}</div><div className="task-body"><strong>{tk.title}</strong>{conflictSet.has(tk.id)&&<span className="conflict-badge"><Icon name="close" size={11}/>时间冲突</span>}</div><button className="task-check" onClick={()=>toggle(tk.id)} aria-label={tk.done?'标记未完成':'标记完成'}><Icon name={tk.done?'check':'minus'} size={14}/></button><button className="task-delete" onClick={()=>remove(tk.id)} aria-label="删除"><Icon name="close" size={14}/></button></div>)}
   </div>
  <ConfirmModal {...confirmState} onCancel={()=>setConfirmState({open:false})}/>
 </section>;
 }
 const year=cursor.getFullYear(),month=cursor.getMonth();
 const first=new Date(year,month,1),startDay=first.getDay(),daysInMonth=new Date(year,month+1,0).getDate();
 const cells=[];for(let i=0;i<startDay;i++)cells.push(null);for(let d=1;d<=daysInMonth;d++)cells.push(d);
 return <section className="calendar-view">
  <header className="cal-header"><button className="text-button" onClick={()=>setCursor(new Date(year,month-1,1))}><Icon name="back" size={16}/>上月</button><div className="cal-title"><h2>{year} 年 {monthNames[month]}</h2><small>共 {tasks.length} 个任务</small></div><button className="text-button" onClick={()=>setCursor(new Date(year,month+1,1))}>下月<Icon name="arrow" size={16}/></button></header>
  <div className="cal-weekdays">{weekdays.map(w=><span key={w}>{w}</span>)}</div>
  <div className="cal-grid">{cells.map((d,i)=>{if(d===null)return <div className="cal-cell empty" key={i}/>;const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const ts=tasks.filter(t=>api.occursOn(iso,t));const isToday=iso===todayIso;const shown=ts.slice(0,2);const more=ts.length-shown.length;return <div className={`cal-cell ${ts.length?'has-task':''} ${isToday?'is-today':''}`} key={i} onClick={()=>setSelectedDate(iso)}><div className="cal-date">{d}</div>{shown.map(tk=><div className={`cal-task-chip ${tk.done?'done':''}`} key={tk.id}>{tk.time&&<span className="chip-time">{tk.time}</span>}{tk.title}</div>)}{more>0&&<div className="cal-more">+{more} 项</div>}</div>;})}</div>
  {tasks.length===0&&!loading&&<div className="cal-empty"><Dango sleep/><h3>日历还空空的。</h3><p>去「和团子聊聊」说一句今天想做哪些事，团子帮你排进来。</p><button className="secondary" onClick={()=>onGoPlan&&onGoPlan()}>和团子聊聊<Icon name="arrow" size={14}/></button></div>}
 <ConfirmModal {...confirmState} onCancel={()=>setConfirmState({open:false})}/>
 </section>;
}
function ConfirmModal({open,message,onConfirm,onCancel}){if(!open)return null;return <div className="confirm-overlay" onClick={onCancel}><div className="confirm-card" onClick={e=>e.stopPropagation()}><div className="confirm-dango"><Dango motion={false}/></div><p className="confirm-message">{message}</p><div className="confirm-buttons"><button className="text-button" onClick={onCancel}>再想想</button><button className="primary" onClick={onConfirm}>确认删除</button></div></div></div>;}
function Toggle({title,desc,checked,onChange}){return <div className="setting-row"><div><strong>{title}</strong><p>{desc}</p></div><button className={`toggle ${checked?'on':''}`} role="switch" aria-checked={checked} aria-label={title} onClick={()=>onChange(!checked)}><span/></button></div>}
function Landscape(){return <svg className="landscape" viewBox="0 0 1100 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#F4F2E9"/><stop offset="1" stopColor="#E9EDDF"/></linearGradient><radialGradient id="sun"><stop stopColor="#FAEAC5" stopOpacity=".9"/><stop offset="1" stopColor="#FAEAC5" stopOpacity="0"/></radialGradient></defs><path fill="url(#sky)" d="M0 0h1100v800H0z"/><circle cx="590" cy="230" r="240" fill="url(#sun)"/><circle cx="590" cy="230" r="85" fill="#F1DFC0" opacity=".45"/><path d="M-50 610Q200 220 510 545T1160 430v450H-50Z" fill="#D7DFCC" opacity=".66"/><path d="M-50 710Q370 340 730 635T1200 560v300H-50Z" fill="#C9D3BD" opacity=".55"/><path d="M-20 780Q350 570 700 740t450-40v150H-20Z" fill="#B9C7AD" opacity=".38"/><path d="m208 224 8-4 8 4m20-17 8-4 8 4" stroke="#A4AA94" strokeWidth="1.5" fill="none" opacity=".5"/></svg>}
function PetChat(){
 const[messages,setMessages]=useState([]);
 const[input,setInput]=useState('');
 const[loading,setLoading]=useState(false);
 const endRef=useRef(null);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'});},[messages,loading]);
 async function send(text){
  const content=text.trim();if(!content||loading)return;
  setMessages(m=>[...m,{role:'user',content}]);setInput('');setLoading(true);
  try{const result=await window.tada.chat(content);if(result.reply)setMessages(m=>[...m,{role:'assistant',content:result.reply}]);}
  catch(e){setMessages(m=>[...m,{role:'assistant',content:'团子暂时连不上，等一下再试。'}]);}
  finally{setLoading(false);}
 }
 return <div className="pet-chat">
  <div className="pet-chat-header"><span>Tada!</span><button className="pet-chat-close" onClick={()=>window.tada?.closeChat()} aria-label="关闭"><Icon name="close" size={16}/></button></div>
  <div className="pet-chat-messages">{messages.length===0?<div className="pet-chat-empty"><p>和团子说点什么吧～</p></div>:messages.map((m,i)=><div key={i} className={`pet-chat-bubble ${m.role}`}>{m.content}</div>)}{loading&&<div className="pet-chat-bubble assistant">团子在想想…</div>}<div ref={endRef}/></div>
  <form className="pet-chat-input" onSubmit={e=>{e.preventDefault();send(input);}}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="说点什么…" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();send(input);}}}/><button type="submit" disabled={loading||!input.trim()}><Icon name="arrow" size={16}/></button></form>
 </div>;
}
createRoot(document.getElementById('root')).render(view==='pet'?<PetOnly/>:view==='desktop-chat'?<PetChat/>:<App/>);
