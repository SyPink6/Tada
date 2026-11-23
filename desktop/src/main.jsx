import React,{useEffect,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import{marked}from'marked';
import DOMPurify from'dompurify';
import{initialState,transition}from'./model.mjs';
import{load,save}from'./storage.mjs';
import * as api from './api.mjs';
import './styles.css';
marked.setOptions({breaks:true,gfm:true});
function renderMarkdown(md){return DOMPurify.sanitize(marked.parse(md||''));}

function Icon({name,size=20,...props}){
 const paths={spark:'m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z',leaf:'M19 4C7 2 2 9 7 16c7 5 14 0 12-12ZM6 19l9-10',check:'m5 12 4 4L19 6',arrow:'M5 12h14m-5-5 5 5-5 5',moon:'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z',close:'m6 6 12 12M6 18 18 6',minus:'M5 12h14',plus:'M5 12h14M12 5v14',back:'M19 12H5m5-5-5 5 5 5',settings:'M4 7h16M4 17h16M8 4v6m8 4v6',clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',pin:'m8 3 8 0-1 6 3 3H6l3-3-1-6Zm4 9v9',cup:'M5 7h12v7a5 5 0 0 1-10 0V7Zm12 1h2a3 3 0 0 1 0 6h-2M5 21h14',edit:'m15 4 5 5L9 20H4v-5L15 4Z',grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'};
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]||paths.spark}/></svg>;
}
function Dango({sleep=false,happy=false,motion=false}){return <svg className={`dango ${motion?'breathing':''}`} viewBox="0 0 180 150" fill="none" aria-hidden="true"><defs><radialGradient id="body"><stop stopColor="#FFF5D9"/><stop offset="1" stopColor="#F5D9AA"/></radialGradient><filter id="shadow"><feGaussianBlur stdDeviation="4"/></filter></defs><ellipse cx="91" cy="133" rx="54" ry="7" fill="#94734A" opacity=".14" filter="url(#shadow)"/><ellipse cx="64" cy="123" rx="16" ry="9" fill="#EFC493"/><ellipse cx="116" cy="123" rx="16" ry="9" fill="#EFC493"/><path d="M30 92C20 62 43 34 66 26c16-14 43-14 55 1 25 8 47 30 40 60-5 31-29 42-68 42-37 0-58-11-63-37Z" fill="url(#body)" stroke="#DDC399" strokeWidth="1.2"/><path d="M43 64c5-15 16-23 28-27" stroke="#FFFDF1" strokeWidth="5" strokeLinecap="round" opacity=".8"/><ellipse cx="57" cy="91" rx="11" ry="6" fill="#EDB7A0" opacity=".75"/><ellipse cx="126" cy="91" rx="11" ry="6" fill="#EDB7A0" opacity=".75"/>{sleep?<><path d="m70 80 9 2m27 0 9-2" stroke="#6B5141" strokeWidth="3" strokeLinecap="round"/><path d="M86 94h10" stroke="#6B5141" strokeWidth="2.5" strokeLinecap="round"/></>:<><ellipse cx="76" cy="80" rx="3.2" ry="4" fill="#604B3C"/><ellipse cx="108" cy="80" rx="3.2" ry="4" fill="#604B3C"/><path d={happy?'M84 93q8 13 16 0Z':'M86 93q6 7 12 0'} stroke="#604B3C" strokeWidth="2.2" fill={happy?'#C2886F':'none'} strokeLinecap="round"/></>}{happy&&<path d="m150 21 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#D5AD62"/>}</svg>}

const view=new URLSearchParams(location.search).get('view')||'preview';
const TAB_PATHS={home:'/home',plan:'/',snippets:'/snippets',calendar:'/calendar',journal:'/journal'};
function parseRoute(pathname){const p=(pathname||location.pathname).replace(/^\/+|\/+$/g,'');if(p.startsWith('snippets/')){const sid=Number(p.split('/')[1]);return{tab:'snippets',snippetId:Number.isFinite(sid)&&sid>0?sid:null};}if(p.startsWith('chat/')){const d=p.split('/')[1];return{tab:'plan',chatDate:/^\d{4}-\d{2}-\d{2}$/.test(d)?d:null};}const e=Object.entries(TAB_PATHS).find(([,v])=>(v.replace(/^\/+|\/+$/g,''))===p);return{tab:e?e[0]:'plan',snippetId:null};}
function PetOnly(){return <div className="native-pet"><div className="pet-drag" title="按住这里拖动小团子">⠿</div><button className="pet-button" aria-label="展开 Tada 任务面板" onClick={()=>window.tada?.toggle()}><Dango/><span className="pet-label">Tada!</span></button><button className="pet-collapse" aria-label="收起小团子" title="收起小团子，藏到托盘" onClick={()=>window.tada?.rest()}><Icon name="minus" size={13}/></button></div>}
function App(){
 const[state,setState]=useState(initialState),[loaded,setLoaded]=useState(false),[saveError,setSaveError]=useState(''),[expanded,setExpanded]=useState(true),[tab,_setTab]=useState(()=>parseRoute(location.pathname).tab),[snippetId,setSnippetId]=useState(()=>parseRoute(location.pathname).snippetId),[chatDate,setChatDate]=useState(()=>parseRoute(location.pathname).chatDate),[manual,setManual]=useState(false),[manualText,setManualText]=useState(''),[editing,setEditing]=useState(false),[editText,setEditText]=useState(''),[inputError,setInputError]=useState('');
 const native=view==='panel',queue=useRef(Promise.resolve()),latest=useRef(state),dialogRef=useRef(null);
 const applyRoute=(pathname)=>{const r=parseRoute(pathname);_setTab(r.tab);setSnippetId(r.snippetId);setChatDate(r.chatDate);};
 const setTab=(t)=>{const path=TAB_PATHS[t]||'/';if(path!==location.pathname)history.pushState(null,'',path);applyRoute(path);};
 const goSnippet=(id,from)=>{let path='/snippets/'+id;const search=from?('?from='+encodeURIComponent(from)):'';if(path+search!==location.pathname+location.search)history.pushState(null,'',path+search);applyRoute(path);};
 const goChat=(date)=>{const path='/chat/'+date;if(path!==location.pathname)history.pushState(null,'',path);applyRoute(path);};
 const goSnippetsList=()=>{const path='/snippets';if(path!==location.pathname)history.pushState(null,'',path);applyRoute(path);};
 useEffect(()=>{const onPop=()=>applyRoute(location.pathname);window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);},[]);
 useEffect(()=>{load().then(s=>{if(s?.version===1){latest.current=s;setState(s);}setLoaded(true);}).catch(()=>{setSaveError('未能读取本地记录，本次操作仍可继续。');setLoaded(true);});},[]);
 function dispatch(action){const next=transition(latest.current,action);latest.current=next;setState(next);queue.current=queue.current.then(()=>save(next)).then(()=>setSaveError('')).catch(()=>setSaveError('暂时未能保存。请先保留此窗口，稍后操作会再次尝试。'));}
 useEffect(()=>{if(native)window.tada?.onTop(state.preferences.onTop);},[state.preferences.onTop,native]);
 useEffect(()=>{const key=e=>{if(e.key==='Escape'){setTab('home');setEditing(false);if(native)window.tada?.collapse();else setExpanded(false);}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[native]);
 function collapse(){if(native)window.tada?.collapse();else setExpanded(false);}
 function submit(e){e.preventDefault();if(!state.draft.trim()){setInputError('先写下想做的事，一个词也可以。');return;}if(manual&&!manualText.trim()){setInputError('写下你想尝试的第一步。');return;}dispatch({type:'create',manual:manual?manualText.trim():null});setInputError('');setManual(false);}
 const task=state.task,step=task?.steps[task.index],compose=!task||state.view==='compose',celebrating=task?.status==='celebrating',done=task?.status==='done',paused=task?.status==='paused'||task?.status==='parked',recovering=task?.status==='recovering',active=task?.status==='active';
 const recent=state.history.slice(-3).reverse();
 function newTask(){dispatch({type:'new'});setTab('home');setExpanded(true);}

 const card=<section className={`companion-card ${native?'native-card':''}`} aria-label="Tada 任务助手">
  <header className="card-header"><span className="wordmark">Tada<span>!</span><i/></span><div className="window-controls"><button className="icon-button" onClick={collapse} aria-label="收起面板"><Icon name="minus" size={18}/></button></div></header>
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
 return <main className="studio"><aside className="sidebar"><div className="brand"><span className="brand-icon"><Icon name="spark" size={23}/></span><span>Tada<span className="brand-exclaim">!</span></span></div><p className="brand-sub">让每一小步，都有陪伴。</p><div className="nav-label">MY LITTLE SPACE</div><nav aria-label="主导航"><button className={tab==='home'?'selected':''} onClick={()=>{setTab('home');setExpanded(true);}}><Icon name="grid"/>我的角落<span className="nav-dot"/></button><button className={tab==='plan'?'selected':''} onClick={()=>setTab('plan')}><Icon name="spark"/>和团子聊聊<span className="nav-dot"/></button><button className={tab==='calendar'?'selected':''} onClick={()=>setTab('calendar')}><Icon name="clock"/>日程</button><button className={tab==='snippets'?'selected':''} onClick={()=>setTab('snippets')}><Icon name="leaf"/>随手记</button><button className={tab==='journal'?'selected':''} onClick={()=>setTab('journal')}><Icon name="leaf"/>小步记录{state.history.length>0&&<small>{state.history.length}</small>}</button></nav><div className="sidebar-note"><span className="note-star">✳</span><p>不必一下子<br/>成为很厉害的人。</p><span>今天，先做一点点就好。</span><svg viewBox="0 0 140 35" aria-hidden="true"><path d="M3 25q25-20 45-4t44-3 44-6" fill="none" stroke="#B8BDA3" strokeWidth="2"/></svg></div></aside>
 <section className="workspace"><header className="workspace-header"><div><span className="breadcrumb">我的空间 <span>/</span> {tab==='plan'?'和团子聊聊':tab==='snippets'?'随手记':tab==='calendar'?'日程':tab==='journal'?'小步记录':'桌面陪伴'}</span><h2>{tab==='plan'?'想到什么，就告诉团子。':tab==='snippets'?(snippetId?'查看一条记录。':'你的零碎记录。'):tab==='calendar'?'所有天的小步，都在这里。':tab==='journal'?'那些小小的做到，都算数。':'留一点空间，慢慢来。'}</h2>{tab==='plan'&&<p className="header-sub">待办、日程，或是突然冒出来的小想法，团子都会帮你整理好。</p>}</div>{tab!=='plan'&&tab!=='calendar'&&tab!=='snippets'&&<button className="outline-button" onClick={()=>{setTab('home');setExpanded(!expanded);}}><Icon name={expanded?'minus':'plus'} size={17}/>{expanded?'只留小团子':'展开任务卡'}</button>}</header>
 {tab==='plan'?<PlanView date={chatDate} onGoCalendar={()=>setTab('calendar')} onGoChat={goChat} onGoSnippet={goSnippet}/>:tab==='snippets'?(snippetId?<SnippetDetail id={snippetId} onBack={goSnippetsList} onDeleted={goSnippetsList}/>:<SnippetsView onOpen={goSnippet}/>):tab==='calendar'?<CalendarView onGoPlan={()=>setTab('plan')}/>:tab==='journal'?<section className="journal"><span className="eyebrow">LITTLE STEPS, REAL PROGRESS</span><h1>每一步，都留在这里。</h1><p className="muted">没有连续打卡。只有你已经走过的路。</p>{state.history.length?<div className="journal-list">{[...state.history].reverse().map(item=><article key={item.id}><span className="journal-check"><Icon name="check"/></span><div><h3>{item.title}</h3><p>{item.taskTitle}</p></div><time>{new Date(item.at).toLocaleDateString('zh-CN',{month:'long',day:'numeric'})}</time></article>)}</div>:<div className="empty-state"><Dango sleep/><h3>不用急着填满这里。</h3><p>完成一小步，它就会安静地留下来。</p><button className="secondary" onClick={()=>{setTab('home');setExpanded(true);}}>回去找一小步<Icon name="arrow" size={16}/></button></div>}</section>:<div className={`desktop-scene ${expanded?'is-expanded':'is-collapsed'}`}><Landscape/>
 <div className="desktop-status"><span className="online-dot"/>{active?'只做眼前这一小步':'小团子在这里，安静陪着你'}<span className="status-divider"/><Icon name="moon" size={14}/> 免打扰</div>
 <div className="scene-poem"><span>ONE SMALL STEP AT A TIME</span><h2>今天，也按照<br/>自己的节奏来。</h2><p>不需要一直专注。<br/>回来时，我帮你接上。</p><div className="poem-line"/></div>
 <div className="desktop-note"><span className="tape"/><Icon name="leaf" size={21}/><p>{recent.length?'你已经做到了':'今天的小约定'}</p><h3>{recent[0]?.title||'把「开始」，\n变得再轻一点。'}</h3><small>{recent.length?'这一小步，值得被记住。':'只走一步，也是在向前。'}</small></div>
 {expanded&&<div className="card-anchor">{card}<div className="popover-tail"/></div>}
 <div className="scene-pet"><button className="preview-pet-button" onClick={()=>setExpanded(!expanded)} aria-label={expanded?'收起 Tada 任务面板':'展开 Tada 任务面板'}><Dango happy={celebrating} sleep={paused} motion={state.preferences.motion}/></button><span className="pet-caption">{active?'我陪你。':paused?'休息也很好。':'我在，不着急。'}</span></div>
 <div className="desktop-bottom"><span>需要时点一下 · 不需要时安静陪伴</span></div>
 </div>}
 </section></main>;
}
function SnippetsView({onOpen,hideSidebar,hideSearch,date}){
 const[snippets,setSnippets]=useState([]);
 const[selectedCat,setSelectedCat]=useState(null);
 const[searchQ,setSearchQ]=useState('');
 const[searchResults,setSearchResults]=useState(null);
 const[searching,setSearching]=useState(false);
 const[loading,setLoading]=useState(true);
 const[editingId,setEditingId]=useState(null);
 const[editValue,setEditValue]=useState('');
 const[confirmState,setConfirmState]=useState({open:false,message:'',onConfirm:null});
 const[lightbox,setLightbox]=useState(null);
 async function refresh(){try{const r=date?await api.listSnippetsByDay(date):await api.listSnippets();setSnippets(r||[]);}catch{setSnippets([]);}setLoading(false);}
 useEffect(()=>{refresh();},[date]);
 useEffect(()=>{if(!snippets.some(s=>s.status==='pending'))return;const t=setTimeout(refresh,3000);return()=>clearTimeout(t);},[snippets]);
 const categories=[...new Set(snippets.map(s=>s.category).filter(Boolean))];
 const filtered=searchResults!==null?searchResults:(selectedCat===null?snippets:selectedCat==='__uncat'?snippets.filter(s=>!s.category):snippets.filter(s=>s.category===selectedCat));
 function customConfirm(msg,fn){setConfirmState({open:true,message:msg,onConfirm:()=>{setConfirmState({open:false});fn();}});}
 async function doSearch(q){if(!q.trim()){setSearchResults(null);return;}setSearching(true);setSearchResults([]);try{const r=await api.searchKnowledge(q);setSearchResults(r||[]);}catch(e){console.error('search failed:',e);setSearchResults([]);}finally{setSearching(false);}}
 async function removeSnippet(id){customConfirm('确认删除这条记录？',async()=>{try{await api.deleteSnippet(id);await refresh();if(searchResults)doSearch(searchQ);}catch{}});}
 async function saveSnippetTitle(id){setEditingId(null);if(editValue.trim()){try{await api.renameSnippet(id,editValue.trim());await refresh();}catch{}}}
 async function changeCategory(id,cat){try{await api.updateCategory(id,cat||null);await refresh();}catch{}}
 const inSearch=searchResults!==null;
 return <section className={`snippets-view${hideSidebar?' embedded':''}`}><div className="snippets-layout">
  {!hideSidebar&&<aside className="snippets-sidebar">
   <button className={selectedCat===null&&!inSearch?'selected':''} onClick={()=>{setSelectedCat(null);setSearchResults(null);}}>全部</button>
   {categories.map(cat=><button key={cat} className={selectedCat===cat&&!inSearch?'selected':''} onClick={()=>{setSelectedCat(cat);setSearchResults(null);}}>{cat}</button>)}
   {snippets.some(s=>!s.category)&&<button className={selectedCat==='__uncat'&&!inSearch?'selected':''} onClick={()=>{setSelectedCat('__uncat');setSearchResults(null);}}>未分类</button>}
  </aside>}
  <div className="snippets-main">
  {!hideSearch&&<div className="snippets-search"><input value={searchQ} onChange={e=>{setSearchQ(e.target.value);if(!e.target.value.trim())setSearchResults(null);}} onKeyDown={e=>{if(e.key==='Enter')doSearch(searchQ);}} placeholder="想找点什么？问问团子…"/><button onClick={()=>doSearch(searchQ)}><Icon name="spark" size={16}/>搜一下</button></div>}
   {loading?<p className="muted">加载中…</p>:searching?<div className="search-loading"><div className="search-loading-dango"><Dango motion={false}/></div><p className="muted">搜索中…</p></div>:(filtered.length===0?<div className="cal-empty"><Dango sleep/><h3>{inSearch?'没搜到相关记录。':'还没有随手记。'}</h3><p>{inSearch?'换个关键词试试。':'去「和团子聊聊」存储你的零碎记录。'}</p></div>:
    <div className="snippets-list">{filtered.map(s=>{
     const id=s.id??s.snippet_id,title=s.title||'(分析中…)',preview=s.preview??s.content??'';
     const isLink=s.type==='link',isImage=s.type==='image';
     return <div className="snippet-card" key={id} onClick={()=>onOpen&&onOpen(id)}>
      <div className="snippet-card-header">
       {editingId===id?<input className="snippet-edit" value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={()=>saveSnippetTitle(id)} onKeyDown={e=>{if(e.key==='Enter')saveSnippetTitle(id);}} onClick={e=>e.stopPropagation()} autoFocus/>:
        isLink?<a href={s.url} target="_blank" rel="noreferrer" className="snippet-link-title" onClick={e=>e.stopPropagation()}>{title}<Icon name="arrow" size={13}/></a>:
        <strong onClick={e=>{e.stopPropagation();setEditingId(id);setEditValue(title);}}>{title}</strong>}
       {s.type&&<span className="snippet-type-badge">{isLink?'链接':isImage?'图片':'文本'}</span>}
       {s.status==='pending'&&<span className="snippet-status pending">分析中</span>}
       {s.status==='failed'&&<span className="snippet-status failed">分析失败</span>}
       {!inSearch&&<select value={s.category||''} onChange={e=>changeCategory(id,e.target.value)} onClick={e=>e.stopPropagation()}><option value="">未分类</option>{categories.map(cat=><option key={cat} value={cat}>{cat}</option>)}</select>}
       <button className="task-delete" onClick={e=>{e.stopPropagation();removeSnippet(id);}}><Icon name="close" size={14}/></button>
      </div>
      {isImage?
       <div className="snippet-image-row">{s.image_path&&<img className="snippet-thumb" src={api.snippetImageUrl(id)} onClick={e=>{e.stopPropagation();setLightbox(api.snippetImageUrl(id));}} alt=""/>}<span className="snippet-content">{preview||'(图片分析中…)'}</span></div>:
       <p className="snippet-content">{preview}</p>}
     </div>;
    })}</div>)}
  </div>
 </div>{lightbox&&<div className="lightbox" onClick={()=>setLightbox(null)}><img src={lightbox} alt=""/></div>}<ConfirmModal {...confirmState} onCancel={()=>setConfirmState({open:false})}/></section>;
}
function SnippetDetail({id,onBack,onDeleted}){
 const[snip,setSnip]=useState(null);
 const[loading,setLoading]=useState(true);
 const[error,setError]=useState('');
 const[editing,setEditing]=useState(false);
 const[editValue,setEditValue]=useState('');
 const[confirmState,setConfirmState]=useState({open:false,message:'',onConfirm:null});
 const[refreshing,setRefreshing]=useState(false);
 const[notice,setNotice]=useState('');
 const[lightbox,setLightbox]=useState(null);
 const[categories,setCategories]=useState([]);
 function back(){const from=new URLSearchParams(location.search).get('from');if(from){history.pushState(null,'',from);window.dispatchEvent(new PopStateEvent('popstate'));}else{onBack&&onBack();}}
 async function load(){setLoading(true);setError('');try{const s=await api.getSnippet(id);setSnip(s);}catch(e){setError('加载失败');}setLoading(false);}
 useEffect(()=>{load();},[id]);
 useEffect(()=>{if(!snip||snip.status!=='pending')return;const t=setTimeout(load,3000);return()=>clearTimeout(t);},[snip]);
 useEffect(()=>{api.listSnippets().then(r=>setCategories([...new Set((r||[]).map(s=>s.category).filter(Boolean))])).catch(()=>{});},[]);
 function customConfirm(msg,fn){setConfirmState({open:true,message:msg,onConfirm:()=>{setConfirmState({open:false});fn();}});}
 async function saveTitle(){setEditing(false);if(editValue.trim()){try{await api.renameSnippet(id,editValue.trim());await load();}catch{}}}
 async function changeCategory(cat){try{await api.updateCategory(id,cat||null);await load();}catch{}}
 async function remove(){customConfirm('确认删除这条记录？',async()=>{try{await api.deleteSnippet(id);back();}catch{}});}
 async function refresh(){setRefreshing(true);setNotice('');try{const r=await api.refreshSnippet(id);if(r.ok){await load();setNotice('已重新抓取，正文约'+r.length+'字');}else{setNotice(r.error||'抓取失败');}}catch(e){setNotice(e.message||'抓取失败');}setRefreshing(false);}
 if(loading)return <section className="snippet-detail"><p className="muted">加载中…</p></section>;
 if(error||!snip)return <section className="snippet-detail"><div className="cal-empty"><Dango sleep/><h3>没找到这条记录。</h3><button className="secondary" onClick={back}>返回<Icon name="arrow" size={14}/></button></div></section>;
 const isLink=snip.type==='link';
 const catOptions=[...new Set([...categories,snip.category].filter(Boolean))];
 return <section className="snippet-detail">
  <button className="text-button back" onClick={back}><Icon name="back" size={17}/>返回</button>
  <div className="snippet-detail-head">
   <span className="snippet-type-badge">{isLink?'链接':'文本'}</span>
   {editing?<input className="snippet-edit" value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={saveTitle} onKeyDown={e=>{if(e.key==='Enter')saveTitle();}} autoFocus/>:
    isLink?<a href={snip.url} target="_blank" rel="noreferrer" className="snippet-link-title">{snip.title}<Icon name="arrow" size={14}/></a>:
    <h2 onClick={()=>{setEditing(true);setEditValue(snip.title);}}>{snip.title}</h2>}
   <select value={snip.category||''} onChange={e=>changeCategory(e.target.value)}><option value="">未分类</option>{catOptions.map(c=><option key={c} value={c}>{c}</option>)}</select>
   {isLink&&<button className="text-button" onClick={refresh} disabled={refreshing}>{refreshing?'抓取中…':'重新抓取正文'}</button>}
   <button className="task-delete" onClick={remove} aria-label="删除"><Icon name="close" size={14}/></button>
  </div>
  {notice&&<p className="form-error snippet-notice">{notice}</p>}
  {snip.created_at&&<p className="muted snippet-meta">{new Date(snip.created_at).toLocaleString('zh-CN')} 存</p>}
  {snip.type==='image'&&snip.image_path&&<img className="snippet-detail-image" src={api.snippetImageUrl(snip.id)} onClick={()=>setLightbox(api.snippetImageUrl(snip.id))} alt=""/>}
  {snip.status==='pending'&&<p className="muted">分析中，团子在看看这张图…</p>}
  {snip.status==='failed'&&<p className="form-error">分析失败：{snip.error||'未知错误'}</p>}
  <div className={`snippet-detail-body${snip.content_format==='markdown'?' markdown-body':''}`}>
   {snip.content_format==='markdown'?
    <span dangerouslySetInnerHTML={{__html:renderMarkdown(snip.original_content)}}/>:
    snip.original_content||'(无描述)'}
  </div>
  {snip.ocr_text&&<div className="snippet-ocr-section"><div className="snippet-ocr-label">图中文字</div><div className="snippet-ocr-text">{snip.ocr_text}</div></div>}
  <ConfirmModal {...confirmState} onCancel={()=>setConfirmState({open:false})}/>
  {lightbox&&<div className="lightbox" onClick={()=>setLightbox(null)}><img src={lightbox} alt=""/></div>}
 </section>;
}
function PlanView({onGoCalendar,onGoChat,onGoSnippet,date}){
 const today=todayStr();
 const[messages,setMessages]=useState([]);
 const[input,setInput]=useState('');
 const[loading,setLoading]=useState(false);
 const[error,setError]=useState('');
 const[created,setCreated]=useState([]);
 const[demoMode,setDemoMode]=useState(false);
 const[selectedDate,setSelectedDate]=useState(date||today);
 const[view,setView]=useState(()=>new URLSearchParams(location.search).get('sub')||'chat');
 useEffect(()=>{const p=new URLSearchParams(location.search);p.set('sub',view);const q=p.toString();const next=location.pathname+(q?'?'+q:'');if(location.pathname+location.search!==next)history.replaceState(null,'',next);},[view]);
 const[autoSorting,setAutoSorting]=useState(false);const[dragId,setDragId]=useState(null);const[confirmState,setConfirmState]=useState({open:false,message:'',onConfirm:null});
 const[dayTasks,setDayTasks]=useState([]);
 const[pendingImage,setPendingImage]=useState(null);
 const endRef=useRef(null);
 useEffect(()=>{fetch('/api/status').then(r=>r.json()).then(s=>setDemoMode(!!s.demo)).catch(()=>{});},[]);
 async function loadDate(date){setSelectedDate(date);setCreated([]);try{const entries=await api.listDailyLog(date);setMessages(entries.filter(e=>e.type==='chat_user'||e.type==='chat_assistant').map(e=>({role:e.type==='chat_user'?'user':'assistant',content:e.content})));}catch{setMessages([]);}}
 useEffect(()=>{loadDate(date||today);},[date]);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[messages,loading]);
 useEffect(()=>{
  const pending=messages.filter(m=>m.pendingId);
  if(!pending.length)return;
  const t=setTimeout(async()=>{
   const snips=await Promise.all(pending.map(m=>api.getSnippet(m.pendingId).catch(()=>null)));
   setMessages(prev=>prev.map(m=>{
    if(!m.pendingId)return m;
    const i=pending.indexOf(m);const s=snips[i];
    if(s&&s.status==='ready')return {...m,content:`分析完成：${s.title||'(无标题)'}`,pendingId:undefined};
    if(s&&s.status==='failed')return {...m,content:'分析失败了，可去随手记重试或删除',pendingId:undefined};
    return m;
   }));
  },3000);
  return ()=>clearTimeout(t);
 },[messages]);
 useEffect(()=>{if(view==='schedule'){api.listTasks(selectedDate).then(r=>setDayTasks(r||[])).catch(()=>setDayTasks([]));}},[view,selectedDate]);
 function isUrl(s){s=(s||'').trim();return /^https?:\/\/\S+$/.test(s)&&!s.includes(' ');}
 function onPaste(e){const items=e.clipboardData?.items||[];for(const it of items){if(it.type.startsWith('image/')){const f=it.getAsFile();if(f){const r=new FileReader();r.onload=()=>setPendingImage({base64:String(r.result).split(',')[1],mime:it.type,preview:r.result});r.readAsDataURL(f);e.preventDefault();return;}}}}
 async function doSend(intent){
  const content=input.trim();const img=pendingImage;
  if((!content&&!img)||loading||selectedDate!==today)return;
  setLoading(true);setError('');setCreated([]);
  if(intent==='save'){
   setMessages(m=>[...m,{role:'user',content:img?'':content,image:img?img.preview:undefined}]);setInput('');setPendingImage(null);
   try{
    const payload=img?{type:'image',image:img,message:'[图片]'}:isUrl(content)?{type:'link',url:content,message:content}:{type:'text',content,message:content};
    const r=await api.saveSnippetDirect(payload);
    setMessages(m=>[...m,{role:'assistant',content:'存到随手记了，正在分析…',pendingId:r.id}]);
   }catch(e){setError(e.message||'存失败');}finally{setLoading(false);}return;
  }
  setMessages(m=>[...m,{role:'user',content,image:img?img.preview:undefined}]);setInput('');setPendingImage(null);
  let imgSnippetId=null;
  if(img){try{const sr=await api.saveSnippetDirect({type:'image',image:img,quiet:true});imgSnippetId=sr.id;}catch(e){}}
  try{
   const result=await api.chat(selectedDate,content,{intent,image:img?{base64:img.base64,mime:img.mime}:undefined,imageSnippetId:imgSnippetId});
   if(result.reply)setMessages(m=>[...m,{role:'assistant',content:result.reply}]);
   if(result.actions){
    const cr=result.actions.filter(a=>a.tool==='create_task'&&a.result&&a.result.ok).map(a=>a.result.task).filter(Boolean);
    if(cr.length)setCreated(cr);
   }
  }catch(e){setError(e.message||'这次没成功，可以再试。');}
  finally{setLoading(false);}
 }
 function reset(){setMessages([]);setInput('');setError('');setCreated([]);setPendingImage(null);}
 async function toggle(id){try{await api.toggleTask(id,selectedDate);const r=await api.listTasks(selectedDate);setDayTasks(r);}catch{}}
 function remove(id){customConfirm('确认删除这个任务？',async()=>{try{await api.deleteTask(id);const r=await api.listTasks(selectedDate);setDayTasks(r);}catch{}});}
 const isToday=selectedDate===today;
 const conflictSet=findConflicts(dayTasks);
 const lastIsUser=messages.length&&messages[messages.length-1].role==='user';
 async function doAutoSort(){const untimed=dayTasks.filter(t=>!t.time);if(untimed.length<2)return;setAutoSorting(true);try{await api.autoSort(selectedDate,untimed.map(t=>({id:t.id,title:t.title})));const r=await api.listTasks(selectedDate);setDayTasks(r||[]);}catch{}setAutoSorting(false);}
 function drop(targetId){if(!dragId||dragId===targetId)return;const ids=dayTasks.filter(t=>!t.time).map(t=>t.id);const from=ids.indexOf(dragId),to=ids.indexOf(targetId);if(from<0||to<0)return;ids.splice(from,1);ids.splice(to,0,dragId);setDragId(null);api.applyOrder(selectedDate,ids).then(()=>{api.listTasks(selectedDate).then(r=>setDayTasks(r||[]));});}
 function customConfirm(msg,fn){setConfirmState({open:true,message:msg,onConfirm:()=>{setConfirmState({open:false});fn();}});}
 const tabs=[['chat','全部聊天'],['schedule','日程'],['info','随手记'],['microstep','小步记录']];
 return <section className="plan-view">
  <div className="conv-top"><div className="plan-dango"><Dango happy={created.length>0} motion={false}/></div><div className="conv-top-text"><span className="eyebrow">和团子 · {isToday?'今天':selectedDate}{demoMode&&<strong className="demo-tag"> · 示例模式</strong>}</span><div className="conv-date"><input type="date" value={selectedDate} max={today} onChange={e=>e.target.value&&onGoChat&&onGoChat(e.target.value)}/><button className="text-button" onClick={()=>onGoChat?onGoChat(today):loadDate(today)}>今天</button></div></div></div>
  <div className="conv-tabs">{tabs.map(([k,label])=><button key={k} className={`conv-tab ${view===k?'active':''}`} onClick={()=>setView(k)}>{label}</button>)}</div>
  {view==='chat'?<div className="chat-area">
   {messages.length===0&&!loading&&<div className="chat-empty"><p className="muted">{isToday?'例如：今天下午三点写 PPT 大纲，明天健身。也可以粘一段文字或链接给团子。':'这一天没有对话记录。'}</p></div>}
   {messages.map((m,i)=><ChatBubble key={i} m={m}/>)}
   {loading&&<div className="bubble-row dango"><div className="bubble-avatar"><Dango motion={false}/></div><div className="bubble bubble-dango typing">团子在想想…</div></div>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div ref={endRef}/>
  </div>:view==='schedule'?<div className="queue-wrap"><div className="queue-head">{dayTasks.some(t=>!t.time)&&dayTasks.length>0&&!autoSorting&&<button className="text-button" onClick={doAutoSort}>自动排序</button>}{autoSorting&&<span className="muted">排序中…</span>}</div><div className="queue-list">{dayTasks.length===0?<div className="cal-empty"><Dango sleep/><h3>{isToday?'今天还没有安排。':selectedDate+' 没有安排。'}</h3>{isToday&&<p className="muted">回「全部聊天」跟团子说要做什么。</p>}</div>:dayTasks.map((tk,i)=><div className={`task-row ${tk.time?'timed':'untimed'} ${tk.done?'done':''}`} key={tk.id} draggable={!tk.time} onDragStart={!tk.time?()=>setDragId(tk.id):undefined} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(tk.id)}><span className="queue-idx">{i+1}</span><div className="task-when">{typeMark(tk)}{tk.time?<span className="time-pill"><Icon name="clock" size={11}/>{tk.time}</span>:<span className="flex-tag">灵活</span>}</div><div className="task-body"><strong>{tk.title}</strong>{conflictSet.has(tk.id)&&<span className="conflict-badge"><Icon name="close" size={11}/>时间冲突</span>}</div><button className="task-check" onClick={()=>toggle(tk.id)} aria-label={tk.done?'标记未完成':'标记完成'}><Icon name={tk.done?'check':'minus'} size={14}/></button><button className="task-delete" onClick={()=>remove(tk.id)} aria-label="删除"><Icon name="close" size={14}/></button></div>)}</div></div>:view==='info'?<SnippetsView hideSidebar hideSearch date={selectedDate} onOpen={id=>onGoSnippet(id,location.pathname+location.search)}/>:<div className="cal-empty"><Dango sleep/><h3>还没有小步记录。</h3><p className="muted">这部分功能在路上。</p></div>}
  {view==='chat'&&created.length>0&&!loading&&<div className="when-plan"><div className="when-head"><span className="when-layer">✓ 已加入日历</span><div className="when-actions"><button className="text-button" onClick={()=>onGoCalendar&&onGoCalendar()}>去日历<Icon name="arrow" size={14}/></button><button className="text-button" onClick={reset}>再说一句</button></div></div><ul className="when-list">{created.map((t,i)=><li key={i}><span className="when-time">{t.recurrence?'↻ '+freqLabel(t.recurrence):(t.time||'灵活')}</span><span className="when-item">{t.title}</span></li>)}</ul></div>}
  {view==='chat'&&isToday&&<form className="chat-input" onSubmit={e=>{e.preventDefault();doSend('auto');}}>
   {pendingImage&&<div className="paste-preview"><img src={pendingImage.preview} alt="待发送图片"/><button type="button" className="paste-preview-x" onClick={()=>setPendingImage(null)} aria-label="移除图片"><Icon name="close" size={13}/></button></div>}
   <textarea value={input} onChange={e=>setInput(e.target.value)} onPaste={onPaste} placeholder={lastIsUser?'团子还在想…':'和团子说，或者贴点东西给它…（可粘贴图片）'} rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend('auto');}}}/>
   <div className="chat-input-actions">
    <button type="button" className="chat-btn chat-btn-save" disabled={loading||(!input.trim()&&!pendingImage)} onClick={()=>doSend('save')}>存</button>
    <button type="submit" className="chat-btn chat-btn-send" disabled={loading||(!input.trim()&&!pendingImage)}>发送</button>
   </div>
  </form>}
  <ConfirmModal {...confirmState} onCancel={()=>setConfirmState({open:false})}/>
 </section>;
}
function todayStr(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function ChatBubble({m}){
 if(m.role==='user'){
  let imgSrc=null,caption='';
  if(m.image){imgSrc=m.image;caption=m.content||'';}
  else if(typeof m.content==='string'&&m.content.startsWith('img:')){
   const nl=m.content.indexOf('\n');imgSrc=api.snippetImageUrl(nl<0?m.content.slice(4):m.content.slice(4,nl));if(nl>=0)caption=m.content.slice(nl+1);
  }
  if(imgSrc)return <div className="bubble-row mine"><div className="bubble bubble-user bubble-image">{caption&&<span className="bubble-image-caption">{caption}</span>}<img src={imgSrc} alt=""/></div></div>;
  return <div className="bubble-row mine"><div className="bubble bubble-user">{m.content}</div></div>;
 }
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
 const[pendingImage,setPendingImage]=useState(null);
 const endRef=useRef(null);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth'});},[messages,loading]);
 function isUrl(s){s=(s||'').trim();return /^https?:\/\/\S+$/.test(s)&&!s.includes(' ');}
 function onPaste(e){const items=e.clipboardData?.items||[];for(const it of items){if(it.type.startsWith('image/')){const f=it.getAsFile();if(f){const r=new FileReader();r.onload=()=>setPendingImage({base64:String(r.result).split(',')[1],mime:it.type,preview:r.result});r.readAsDataURL(f);e.preventDefault();return;}}}}
 async function doSend(intent){
  const content=input.trim();const img=pendingImage;
  if((!content&&!img)||loading)return;
  setLoading(true);
  if(intent==='save'){
   setMessages(m=>[...m,{role:'user',content:img?'[图片]':content}]);setInput('');setPendingImage(null);
   try{const payload=img?{type:'image',image:img}:isUrl(content)?{type:'link',url:content}:{type:'text',content};const r=await window.tada?.send?.({intent:'save',message:content,image:img});setMessages(m=>[...m,{role:'assistant',content:r&&r.id?`存到随手记了，正在分析…（id ${r.id}）`:'存失败了。'}]);}
   catch(e){setMessages(m=>[...m,{role:'assistant',content:'存失败了。'}]);}finally{setLoading(false);}return;
  }
  setMessages(m=>[...m,{role:'user',content:img?`[图片] ${content}`.trim():content}]);setInput('');setPendingImage(null);
  try{const result=await window.tada?.send?.({intent,message:content,image:img})||await window.tada.chat(content);if(result.reply)setMessages(m=>[...m,{role:'assistant',content:result.reply}]);else if(result.error)setMessages(m=>[...m,{role:'assistant',content:result.reply||'团子暂时连不上，等一下再试。'}]);}
  catch(e){setMessages(m=>[...m,{role:'assistant',content:'团子暂时连不上，等一下再试。'}]);}
  finally{setLoading(false);}
 }
 return <div className="pet-chat">
  <div className="pet-chat-header"><span>Tada!</span><button className="pet-chat-close" onClick={()=>window.tada?.closeChat()} aria-label="关闭"><Icon name="close" size={16}/></button></div>
  <div className="pet-chat-messages">{messages.length===0?<div className="pet-chat-empty"><p>和团子说点什么吧～（可粘贴图片）</p></div>:messages.map((m,i)=><div key={i} className={`pet-chat-bubble ${m.role}`}>{m.content}</div>)}{loading&&<div className="pet-chat-bubble assistant">团子在想想…</div>}<div ref={endRef}/></div>
  {pendingImage&&<div className="paste-preview pet-paste-preview"><img src={pendingImage.preview} alt="待发送"/><button type="button" className="paste-preview-x" onClick={()=>setPendingImage(null)}><Icon name="close" size={13}/></button></div>}
  <form className="pet-chat-input" onSubmit={e=>{e.preventDefault();doSend('auto');}}>
   <input value={input} onChange={e=>setInput(e.target.value)} onPaste={onPaste} placeholder="说点什么…" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();doSend('auto');}}}/>
   <div className="pet-chat-actions"><button type="button" disabled={loading||(!input.trim()&&!pendingImage)} onClick={()=>doSend('save')}>存</button><button type="button" disabled={loading||(!input.trim()&&!pendingImage)} onClick={()=>doSend('chat')}>聊</button><button type="submit" disabled={loading||(!input.trim()&&!pendingImage)}><Icon name="arrow" size={14}/></button></div>
  </form>
 </div>;
}
createRoot(document.getElementById('root')).render(view==='pet'?<PetOnly/>:view==='desktop-chat'?<PetChat/>:<App/>);
