import React, { useState, useEffect } from 'react';

const API = 'http://localhost:4000/api';

function Header({user, onLogout}){
  return (
    <div className="header">
      <div className="logo">
        <div className="mark">LMS</div>
        <div>
          <div style={{fontWeight:700}}>TileLMS</div>
          <div style={{fontSize:12,color:'#94a3b8'}}>Learn beautifully</div>
        </div>
      </div>
      <div className="header-right">
        {user ? (
          <>
            <div style={{textAlign:'right'}}>
              <div style={{fontWeight:700}}>{user.name}</div>
              <div style={{fontSize:12,color:'#94a3b8'}}>{user.role}</div>
            </div>
            <button className="btn small" onClick={onLogout}>Logout</button>
          </>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
}

function TileCard({title, description, children}){
  return (
    <div className="card">
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

function Login({onLogin}){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [err,setErr]=useState('');
  const submit = async ()=>{
    try{
      const res = await fetch(API + '/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password})});
      const j = await res.json();
      if(res.ok){ onLogin(j); } else { setErr(j.error || 'Login failed') }
    }catch(e){ setErr('Network error') }
  };
  return (
    <div className="grid">
      <TileCard title="Login" description="Sign in to your TileLMS account">
        <div className="form">
          <input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button className="btn" onClick={submit}>Login</button>
          {err && <div className="notice">{err}</div>}
        </div>
      </TileCard>
      <Register onRegister={onLogin} />
    </div>
  );
}

function Register({onRegister}){
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [role,setRole]=useState('Student');
  const [err,setErr]=useState('');
  const submit = async ()=>{
    try{
      const res = await fetch(API + '/register', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,email,password,role})});
      const j = await res.json();
      if(res.ok){ onRegister(j); } else { setErr(j.error || 'Register failed') }
    }catch(e){ setErr('Network error') }
  };
  return (
    <TileCard title="Register" description="Create a new account">
      <div className="form">
        <input className="input" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} />
        <input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <select className="input" value={role} onChange={e=>setRole(e.target.value)}>
          <option>Student</option><option>Teacher</option>
        </select>
        <button className="btn" onClick={submit}>Register</button>
        {err && <div className="notice">{err}</div>}
      </div>
    </TileCard>
  );
}

function Home({user, token}){
  const [courses, setCourses] = useState([]);
  const [myCourses, setMyCourses] = useState([]);
  useEffect(()=>{
    fetch(API + '/courses').then(r=>r.json()).then(setCourses);
    if(token){
      fetch(API + '/my-courses', {headers:{Authorization:'Bearer '+token}}).then(r=>r.json()).then(setMyCourses);
    }
  }, [token]);
  return (
    <div>
      <div className="grid">
        {courses.map(c=>(
          <div key={c.id} className="card">
            <h3>{c.title}</h3>
            <p>{c.description}</p>
            <div className="meta">
              <div>Duration: {c.duration}</div>
              <div><EnrollButton courseId={c.id} token={token} /></div>
            </div>
          </div>
        ))}
      </div>
      <h3 style={{marginTop:20}}>My Courses</h3>
      <div className="grid">
        {myCourses.map(m=>(
          <div className="card" key={m.enrollmentId || m.id}>
            <h3>{m.course ? m.course.title : m.title}</h3>
            <p>{m.course ? m.course.description : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnrollButton({courseId, token}){
  const [state,setState]=useState('');
  const enroll = async ()=>{
    if(!token){ alert('Please login as student'); return; }
    const res = await fetch(API + '/enroll', {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+token}, body:JSON.stringify({courseId})});
    const j = await res.json();
    if(res.ok) setState('Enrolled'); else alert(j.error || 'Error');
  };
  return <button className="btn small" onClick={enroll}>{state || 'Enroll'}</button>
}

function Dashboard({user, token}){
  if(!user) return <div className="notice">Please login to view dashboard.</div>;
  return (
    <div>
      <h2>Welcome, {user.name}</h2>
      <div className="tiles-row" style={{marginTop:12}}>
        <TileCard title="Courses" description="Create or explore courses">
          <CourseManager token={token} user={user} />
        </TileCard>
        <TileCard title="Assignments" description="Create & submit assignments">
          <div className="form">
            <small>Open the Courses tile to manage assignments and submissions.</small>
          </div>
        </TileCard>
        <TileCard title="Forum" description="Discussions per course">
          <div className="form">
            <small>Visit a course to join the discussion.</small>
          </div>
        </TileCard>
        <TileCard title="Notifications" description="Latest updates">
          <Notifications token={token} />
        </TileCard>
      </div>
    </div>
  );
}

function CourseManager({token, user}){
  const [title,setTitle]=useState('');
  const [desc,setDesc]=useState('');
  const [dur,setDur]=useState('4 weeks');
  const [courses,setCourses]=useState([]);

  useEffect(()=>{ fetch(API + '/courses').then(r=>r.json()).then(setCourses); }, []);

  const create = async ()=>{
    if(user.role !== 'Teacher') return alert('Only teachers');
    const res = await fetch(API + '/courses', {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+token}, body:JSON.stringify({title,description:desc,duration:dur})});
    const j = await res.json();
    if(res.ok){ setCourses(prev=>[...prev,j]); setTitle(''); setDesc(''); alert('Course created') } else alert(j.error || 'Error');
  };

  return (
    <div>
      {user.role === 'Teacher' && (
        <div className="form">
          <input className="input" placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
          <input className="input" placeholder="Description" value={desc} onChange={e=>setDesc(e.target.value)} />
          <input className="input" placeholder="Duration" value={dur} onChange={e=>setDur(e.target.value)} />
          <button className="btn" onClick={create}>Create Course</button>
        </div>
      )}
      <div style={{marginTop:12}}>
        <h4>All Courses</h4>
        <div className="grid">
          {courses.map(c=>(
            <div className="card" key={c.id}>
              <h3>{c.title}</h3>
              <p>{c.description}</p>
              <div className="meta">
                <div>{c.duration}</div>
                <div><a className="btn small" href="#">Open</a></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Notifications({token}){
  const [notes,setNotes]=useState([]);
  useEffect(()=>{
    if(!token) return;
    fetch(API + '/notifications', {headers:{Authorization:'Bearer '+token}}).then(r=>r.json()).then(setNotes);
  }, [token]);
  return <div>{notes.map(n=> <div key={n.id} className="notice" style={{marginTop:8}}>{n.message} <div style={{fontSize:12,color:'#6b7280'}}>{new Date(n.date).toLocaleString()}</div></div>)}</div>
}

export default function App(){
  const [auth,setAuth]=useState(()=>{
    try{ return JSON.parse(localStorage.getItem('auth') || 'null'); }catch(e){ return null }
  });
  const [user,setUser]=useState(auth ? auth.user : null);
  const [token,setToken]=useState(auth ? auth.token : null);
  useEffect(()=>{ if(auth){ setUser(auth.user); setToken(auth.token); } else { setUser(null); setToken(null); } }, [auth]);
  const onLogin = (data)=>{
    localStorage.setItem('auth', JSON.stringify(data));
    setAuth(data);
  };
  const logout = ()=>{ localStorage.removeItem('auth'); setAuth(null); };
  return (
    <div>
      <Header user={user} onLogout={logout} />
      <div className="container">
        {!user ? <Login onLogin={onLogin} /> : (
          <div>
            <Dashboard user={user} token={token} />
            <div className="footer">TileLMS • Built for demo • Backend: Node/Express + lowdb</div>
          </div>
        )}
      </div>
    </div>
  );
}