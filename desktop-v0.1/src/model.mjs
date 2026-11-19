export const initialState=()=>({version:1,draft:'',task:null,history:[],preferences:{motion:false,onTop:false},view:'home'});
const uid=()=>globalThis.crypto.randomUUID();
export function suggest(text){
  if(/作品集|简历|求职/.test(text))return ['打开一个空白文档','写下一个想展示的项目名','写一句这个项目帮助谁'];
  if(/读|阅读|书/.test(text))return ['把想读的书放到手边','翻到上次读到的那一页','只读眼前的第一段'];
  if(/整理|收拾|房间/.test(text))return ['选一个手边的小角落','把一件物品放回它的位置','看看要不要再收好一件'];
  if(/论文|报告|写/.test(text))return ['打开准备使用的文档','写下一句暂时的标题','记下一个想表达的要点'];
  return [`为「${text.slice(0,24)}」写下一个起点`,'把这个起点变成一个具体动作','尝试刚才写下的动作'];
}
export function transition(state,action){
  switch(action.type){
    case 'draft':return {...state,draft:action.value};
    case 'create':{
      const title=state.draft.trim();if(!title)return state;
      const steps=(action.manual?[action.manual]:suggest(title)).map(title=>({id:uid(),title,done:false,revisions:[]}));
      return {...state,task:{id:uid(),title,steps,index:0,status:'ready',createdAt:new Date().toISOString()},view:'home'};
    }
    case 'status':return state.task?{...state,task:{...state.task,status:action.value}}:state;
    case 'shrink':{
      if(!state.task)return state;
      const steps=state.task.steps.map((step,i)=>i!==state.task.index?step:{...step,revisions:[...step.revisions,step.title],title:step.revisions.length?'只把需要的东西放到手边，先停在这里。':step.title.startsWith('打开')?'先找到准备使用的文档入口':step.title.startsWith('把想读')?'先找到想读的那本书':'先写下一个关键词就好'});
      return {...state,task:{...state.task,steps,status:'ready'}};
    }
    case 'edit':{
      if(!state.task||!action.value.trim())return state;
      return {...state,task:{...state.task,steps:state.task.steps.map((s,i)=>i===state.task.index?{...s,title:action.value.trim(),revisions:[...s.revisions,s.title]}:s)}};
    }
    case 'complete':{
      if(!state.task||state.task.status!=='active')return state;
      const task={...state.task,steps:state.task.steps.map((s,i)=>i===state.task.index?{...s,done:true,completedAt:new Date().toISOString()}:s),status:'celebrating'};
      const current=task.steps[task.index];
      return {...state,task,history:state.history.some(h=>h.stepId===current.id)?state.history:[...state.history,{id:uid(),stepId:current.id,taskTitle:task.title,title:current.title,at:current.completedAt}]};
    }
    case 'next':{
      if(!state.task||state.task.status!=='celebrating')return state;
      const index=state.task.index+1;
      return {...state,task:{...state.task,index:index<state.task.steps.length?index:state.task.index,status:index<state.task.steps.length?'ready':'done'}};
    }
    case 'new':return state.task?{...state,task:{...state.task,status:'parked'},view:'compose',draft:''}:{...state,view:'compose',draft:''};
    case 'restore':return {...state,view:'home'};
    case 'preferences':return {...state,preferences:{...state.preferences,...action.value}};
    default:return state;
  }
}
