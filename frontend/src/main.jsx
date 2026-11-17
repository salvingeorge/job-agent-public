import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowRight, ArrowLeft, Upload, FileText, X, Check, CheckCheck, LoaderCircle, Download, Eye, PenLine, Plus, Layers, Link, ShieldCheck, RotateCcw} from 'lucide-react';
import './style.css';

async function api(path, options = {}) {
  const response = await fetch('/api' + path, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Something went wrong. Please try again.');
  }
  return response.json();
}
const json = body => ({method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
const types = ['Resume', 'Cover letter', 'Certificate', 'Other'];

function App() {
  const [documents, setDocuments] = useState([]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('text');
  const [job, setJob] = useState('');
  const [result, setResult] = useState(null);
  const [active, setActive] = useState('resume');
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState(false);
  const [passages, setPassages] = useState(0);
  const input = useRef();
  useEffect(() => { api('/session').then(data => {setDocuments(data.documents); setReady(data.ready); setLoaded(true);}).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    const handler = e => {if(e.key === 'Escape') setPreview(null);};
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  async function upload(files) {
    if (busy || !loaded) return;
    setError('');
    const failures = [];
    for (const file of Array.from(files)) {
      setBusy('Reading ' + file.name);
      try {
        const form = new FormData(); form.append('file', file);
        const document = await api('/documents', {method:'POST', body:form});
        setDocuments(items => [...items, document]);
        setResult(null);
      } catch(e) { failures.push(file.name + ' — ' + e.message); }
    }
    setBusy(''); setError(failures.join(' '));
    if(input.current) input.current.value = '';
  }
  async function remove(id) {
    setBusy('Removing document'); setError('');
    try { await api('/documents/' + id, {method:'DELETE'}); setDocuments(items => items.filter(item => item.id !== id)); setResult(null); }
    catch(e) {setError(e.message);} finally {setBusy('');}
  }
  async function index() {
    setBusy('Organizing your experience'); setError('');
    try {
      const data = await api('/index', json({labels:Object.fromEntries(documents.map(doc => [doc.id, doc.type]))}));
      setPassages(data.passages); setStep(1); setResult(null);
    } catch(e) {setError(e.message);} finally {setBusy('');}
  }
  async function generate() {
    setBusy('Writing your application'); setError('');
    try {const data = await api('/generate', json({text:job, mode})); setResult(data); setStep(2); setEditing(false);}
    catch(e) {setError(e.message);} finally {setBusy('');}
  }
  async function download() {
    setBusy('Preparing download');
    try {
      const response = await fetch('/api/export', json({text:result.documents[active]}));
      if(!response.ok) throw new Error('Download failed. Please try again.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href=url; link.download=active+'.docx'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch(e) {setError(e.message);} finally {setBusy('');}
  }
  async function reset() {
    setBusy('Clearing session');
    try {
      await api('/session', {method:'DELETE'});
      await api('/session');
      setDocuments([]); setResult(null); setJob(''); setStep(0); setError('');
    } catch(e) {setError(e.message);} finally {setBusy('');}
  }
  const titles = ['A little about you.', 'Find your next chapter.', 'Make it yours.'];
  const descriptions = ['Great applications start with your story. Add the documents that tell it.',
    'Bring a role you’re excited about. We’ll connect it to your experience.',
    'Your experience, tailored to the opportunity. Review the details before sending.'];
  return <div className="app">
    <header className="topbar"><a className="brand" href="/"><span className="brand-icon"><Layers size={21}/></span>paperwork<span className="brand-dot">.</span></a><span className="top-note">A thoughtful next step.</span><button className="quiet" disabled={!!busy} onClick={reset}><RotateCcw size={14}/>Start fresh</button></header>
    <main>
      <nav className="steps" aria-label="Application progress">{['Your documents', 'The opportunity', 'Your application'].map((label,i) => <React.Fragment key={label}>{i>0 && <span className="step-line"/>}<button disabled={i>step || !!busy} className={'step '+(i===step?'current':i<step?'done':'')} onClick={()=>setStep(i)} aria-current={i===step?'step':undefined}><span>{i<step?<Check size={13}/>:i+1}</span>{label}</button></React.Fragment>)}</nav>
      <section className="intro"><p className="eyebrow">{['YOUR EXPERIENCE, ALL IN ONE PLACE','A NEW POSSIBILITY','READY FOR YOUR NEXT CHAPTER'][step]}</p><h1>{titles[step]}</h1><p>{descriptions[step]}</p></section>
      {error && <div role="alert" className="error">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      <div className="workspace">
        <section className="primary-panel">
          {step===0 && <>
            <div className={'dropzone '+(drag?'drag':'')} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);upload(e.dataTransfer.files);}}>
              <span className="upload-symbol"><Upload size={25} strokeWidth={1.5}/></span><h2>Drop your documents here</h2><p>Your resume, past cover letters, certificates, and more.</p>
              <button className="button secondary" disabled={!!busy||!loaded} onClick={()=>input.current.click()}><Plus size={16}/>Choose files</button>
              <span className="file-hint">PDF, DOCX, TXT or MD · Up to 10 MB each</span>
              <input ref={input} type="file" multiple accept=".pdf,.docx,.txt,.md" hidden onChange={e=>upload(e.target.files)}/>
            </div>
            <div className="section-label"><h3>Your documents <span>{documents.length}</span></h3><p>Choose a type for each file</p></div>
            {documents.length===0?<div className="empty"><FileText size={22}/><div>Your story starts here.<small>Added documents will appear in this space.</small></div></div>:
              <div className="document-list">{documents.map(doc=><div className="document-row" key={doc.id}><span className="file-icon"><FileText size={20}/></span><div className="file-name"><strong>{doc.name}</strong><small>{Math.ceil(doc.size/1024)} KB · <span>Ready to index</span></small></div><select aria-label={'Type for '+doc.name} value={doc.type} disabled={!!busy} onChange={e=>setDocuments(items=>items.map(item=>item.id===doc.id?{...item,type:e.target.value}:item))}>{types.map(type=><option key={type}>{type}</option>)}</select><button className="icon-button" aria-label={'Preview '+doc.name} onClick={()=>setPreview(doc)}><Eye size={16}/></button><button className="icon-button" disabled={!!busy} aria-label={'Remove '+doc.name} onClick={()=>remove(doc.id)}><X size={16}/></button></div>)}</div>}
            <div className="panel-bottom"><span>{documents.length?documents.length+' of 12 documents added':'Add at least one document to continue'}</span><button className="button primary" onClick={index} disabled={!documents.length||!!busy}>Prepare my documents<ArrowRight size={16}/></button></div>
          </>}
          {step===1 && <div className="job-panel"><div className="panel-heading"><span className="file-icon"><FileText size={22}/></span><div><h2>The opportunity</h2><p>Add the job description or a link to the role.</p></div></div>
            <div className="tabs"><button className={mode==='text'?'selected':''} onClick={()=>{setMode('text');setJob('');}} disabled={!!busy}><FileText size={15}/>Paste description</button><button className={mode==='url'?'selected':''} onClick={()=>{setMode('url');setJob('');}} disabled={!!busy}><Link size={15}/>Use a link</button></div>
            <label className="field-label" htmlFor="job">{mode==='text'?'Job description':'Job posting URL'}</label>
            {mode==='text'?<textarea id="job" value={job} onChange={e=>setJob(e.target.value)} maxLength={30000} placeholder="Paste the role, responsibilities, and what they’re looking for…" disabled={!!busy}/>:<input id="job" type="url" value={job} onChange={e=>setJob(e.target.value)} placeholder="https://company.com/careers/your-next-role" disabled={!!busy}/>}
            <p className="field-help">{mode==='text'?job.length.toLocaleString()+' / 30,000 characters':'Some job sites block access. You can always paste the description instead.'}</p>
            <div className="included"><CheckCheck size={19}/><div><strong>One opportunity. Two tailored documents.</strong><p>A resume and cover letter, grounded in your uploaded experience.</p></div></div>
            {!ready&&<p className="notice">Your host needs to connect an AI model to enable generation.</p>}
            <div className="panel-bottom"><button className="quiet" onClick={()=>setStep(0)} disabled={!!busy}><ArrowLeft size={15}/>Documents</button><button className="button primary" onClick={generate} disabled={!!busy||!ready||job.trim().length<(mode==='text'?80:8)}>Create my application<ArrowRight size={16}/></button></div>
          </div>}
          {step===2 && result && <div className="results"><div className="result-toolbar"><div className="tabs">{['resume','cover_letter'].map(key=><button key={key} className={active===key?'selected':''} onClick={()=>setActive(key)}>{key==='resume'?'Resume':'Cover letter'}</button>)}</div><button className="quiet" onClick={()=>setEditing(!editing)}>{editing?<Eye size={15}/>:<PenLine size={15}/>} {editing?'Preview':'Edit text'}</button></div>
            {editing?<textarea className="document-editor" aria-label="Edit document" value={result.documents[active]} onChange={e=>setResult({...result,documents:{...result.documents,[active]:e.target.value}})}/>:<article className="paper">{result.documents[active].split('\n').map((line,i)=><p key={i}>{line||'\u00a0'}</p>)}</article>}
            <div className="panel-bottom"><span>Review names, dates, and claims before sending.</span><button className="button primary" onClick={download} disabled={!!busy||!result.documents[active].trim()}><Download size={16}/>Download Word</button></div></div>}
          {busy&&<div role="status" className="progress"><LoaderCircle className="spin" size={18}/><span>{busy}…</span></div>}
        </section>
        <aside>
          <div className="aside-card"><span className="aside-icon"><Layers size={23} strokeWidth={1.4}/></span><h2>{step===0?'A fuller picture of you.':'Your experience, connected.'}</h2><p>{step===0?'A few good documents give your application a stronger foundation.':'Your documents provide the evidence behind every application.'}</p>
          {step===0?<div className="tips">{[['Resume','Your experience, education, and skills.'],['Cover letters','Your voice and what motivates you.'],['Certificates & more','The details that make you stand out.']].map(([title,body])=><div key={title}><Check size={15}/><div><strong>{title}</strong><p>{body}</p></div></div>)}</div>:<div className="library">{documents.map(doc=><button key={doc.id} onClick={()=>setPreview(doc)}><FileText size={17}/><span>{doc.name}<small>{doc.type}</small></span><Eye size={14}/></button>)}<p className="indexed"><Check size={14}/>{passages} passages indexed</p></div>}
          </div>
          <div className="privacy"><ShieldCheck size={18}/><p>Held in your session. Relevant text is shared with the configured AI provider only when you generate.</p></div>
          {step===2&&result&&<details className="sources"><summary>View supporting passages</summary>{result.sources.map((source,i)=><div key={i}><strong>{source.source}</strong><p>{source.text}</p></div>)}</details>}
        </aside>
      </div>
      <footer><span>Made for your next chapter.</span><span>Take your experience further.</span></footer>
    </main>
    {preview&&<div className="modal-backdrop" onClick={()=>setPreview(null)}><section className="modal" role="dialog" aria-modal="true" aria-label="Document preview" onClick={e=>e.stopPropagation()}><div><h2>{preview.name}</h2><button className="icon-button" autoFocus aria-label="Close preview" onClick={()=>setPreview(null)}><X/></button></div><p className="field-help">Extracted text · {preview.type}</p><pre>{preview.text}</pre></section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
