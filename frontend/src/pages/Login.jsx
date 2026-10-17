import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import useAuthStore from '../store';
import toast from 'react-hot-toast';
import { Lock, Phone } from 'lucide-react';

function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('auth/login/', {
        phone_number: phone,
        password: password
      });
      setUser(res.data.user);
      toast.success('Muvaffaqiyatli kirdi!');
      navigate('/');
    } catch (err) {
      toast.error('Telefon raqami yoki maxfiy so\'z noto\'g\'ri.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', backgroundColor: 'var(--bg-color)', padding: '24px'
    }}>
      <div style={{
        backgroundColor: 'var(--surface)', padding: '40px', borderRadius: '16px',
        boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: '400px',
        border: '1px solid var(--border)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: '8px' }}>Avto Xizmat</h1>
          <p style={{ color: 'var(--text-muted)' }}>Xush kelibsiz! Iltimos, hisobingizga kiring.</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Telefon raqami</label>
            <div style={{ position: 'relative' }}>
              <Phone size={20} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="+998901234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px 12px 10px 40px',
                  borderRadius: '8px', border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-color)', color: 'var(--text-main)',
                  outline: 'none', fontSize: '1rem'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Maxfiy so'z</label>
            <div style={{ position: 'relative' }}>
              <Lock size={20} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px 12px 10px 40px',
                  borderRadius: '8px', border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-color)', color: 'var(--text-main)',
                  outline: 'none', fontSize: '1rem'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px', borderRadius: '8px',
              backgroundColor: 'var(--primary)', color: 'white', border: 'none',
              fontWeight: 600, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1, transition: 'background 0.2s'
            }}
          >
            {loading ? 'Kirilmoqda...' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
