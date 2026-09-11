import { FormEvent, useState } from 'react'
import { Check, LockKeyhole, Radio } from 'lucide-react'

export type AccountUser = { id: string; email: string; displayName: string; avatar?: string }
export type AccountState = { servers: unknown[]; messages: unknown[]; profile: Record<string, unknown> }

export default function AuthScreen({ onAuthenticated }: { onAuthenticated: (payload: { user: AccountUser; state: AccountState }) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errorPulse, setErrorPulse] = useState(0)
  const [success, setSuccess] = useState(false)

  function changeMode() {
    setMode(value => value === 'login' ? 'register' : 'login')
    setError(''); setPassword(''); setSuccess(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`/api/account/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName, email, password }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Não foi possível entrar')
      if (mode === 'register') { setSuccess(true); await new Promise(resolve => window.setTimeout(resolve, 850)) }
      onAuthenticated(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar')
      setErrorPulse(value => value + 1)
    } finally { setBusy(false) }
  }

  return <main className="auth-page">
    <div className="auth-orb auth-orb-one"/><div className="auth-orb auth-orb-two"/>
    <section className="auth-brand"><div className="auth-logo"><span>S</span><strong>Screenly</strong></div><h1>Sua comunidade,<br/>no seu servidor.</h1><p>Converse, compartilhe e mantenha seus dados sob seu controle.</p><small><Radio/> SERVIDOR LOCAL</small></section>
    <section className={`auth-card ${success ? 'auth-success' : ''}`}>
      {success ? <div className="auth-success-content"><div><Check/></div><span>CONTA CRIADA</span><h2>Tudo pronto!</h2><p>Abrindo seus servidores…</p></div> : <div className="auth-form-transition" key={mode}>
        <div className="auth-lock"><LockKeyhole/></div><span>{mode === 'login' ? 'BEM-VINDO DE VOLTA' : 'CRIAR CONTA'}</span><h2>{mode === 'login' ? 'Entre no Screenly' : 'Comece sua comunidade'}</h2><p>{mode === 'login' ? 'Use sua conta para acessar seus servidores e mensagens.' : 'Seus dados serão armazenados neste servidor.'}</p>
        <form className={error ? 'auth-form has-error' : 'auth-form'} key={errorPulse} onSubmit={submit}>
          {mode === 'register'&&<label>Nome de exibição<input autoFocus maxLength={32} autoComplete="name" value={displayName} onChange={event=>setDisplayName(event.target.value)} placeholder="Como devemos chamar você?"/></label>}
          <label>E-mail<input autoFocus={mode==='login'} type="email" maxLength={254} autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="voce@exemplo.com"/></label>
          <label>Senha<input type="password" minLength={8} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={event=>setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres"/></label>
          <small className="auth-error" aria-live="polite">{error}</small><button disabled={busy||!email||password.length<8||(mode==='register'&&!displayName.trim())}>{busy?'Aguarde…':mode==='login'?'Entrar':'Criar conta'}</button>
        </form>
        <button className={mode === 'login' ? 'auth-switch auth-register-link' : 'auth-switch'} onClick={changeMode}>{mode==='login'?'Ainda não tem conta? Cadastre-se':'Já tem uma conta? Entre'}</button>
      </div>}
    </section>
  </main>
}
