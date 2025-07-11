import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState({
    email: '',
    username: '',
    password: '',
    general: '',
  });
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    const newErrors = { email: '', username: '', password: '', general: '' };
    let isValid = true;

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required.';
      isValid = false;
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = 'Invalid email format.';
      isValid = false;
    }

    // Username validation
    const usernameRegex = /^[a-zA-Z0-9._-]{3,20}$/;
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required.';
      isValid = false;
    } else if (!usernameRegex.test(formData.username.trim())) {
      newErrors.username = 'Username must be 3–20 characters, alphanumeric, dots, dashes, or underscores.';
      isValid = false;
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required.';
      isValid = false;
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
      isValid = false;
    } else if (formData.password.length < 8) {
      newErrors.password = 'For better security, use 8+ characters with mixed case and numbers.';
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setErrors({ email: '', username: '', password: '', general: '' });

    try {
      const trimmedEmail = formData.email.trim();
      const trimmedUsername = formData.username.trim();
      const result = await createUserWithEmailAndPassword(auth, trimmedEmail, formData.password);
      await setDoc(doc(db, 'users', result.user.uid), {
        username: trimmedUsername,
        email: trimmedEmail,
        budget: 0,
        lastBudgetMonth: null,
        previousBudget: 0,
      });
      navigate('/dashboard');
    } catch (err) {
      console.error('Signup error:', err.code, err.message);
      let errorMsg = 'Signup failed. Please try again.';
      switch (err.code) {
        case 'auth/email-already-in-use':
          errorMsg = 'This email is already registered. Try logging in.';
          setErrors((prev) => ({ ...prev, email: errorMsg }));
          break;
        case 'auth/invalid-email':
          errorMsg = 'Invalid email format.';
          setErrors((prev) => ({ ...prev, email: errorMsg }));
          break;
        case 'auth/weak-password':
          errorMsg = 'Password is too weak. Use at least 6 characters.';
          setErrors((prev) => ({ ...prev, password: errorMsg }));
          break;
        case 'auth/operation-not-allowed':
          errorMsg = 'Email/password signup is disabled.';
          setErrors((prev) => ({ ...prev, general: errorMsg }));
          break;
        default:
          setErrors((prev) => ({ ...prev, general: errorMsg }));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '', general: '' }));
  };

  return (
    <div className="container">
      <form onSubmit={handleSignup} className="form">
        <h2>Sign Up</h2>
        {errors.general && <p className="error">{errors.general}</p>}

        <div>
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={handleChange}
            required
            aria-label="Username"
            aria-describedby="username-error"
          />
          {errors.username && <p className="error" id="username-error">{errors.username}</p>}
        </div>

        <div>
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
            aria-label="Email"
            aria-describedby="email-error"
          />
          {errors.email && <p className="error" id="email-error">{errors.email}</p>}
        </div>

        <div>
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
            aria-label="Password"
            aria-describedby="password-error"
          />
          {errors.password && <p className="error" id="password-error">{errors.password}</p>}
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign Up'}
        </button>

        <p className="link">
          Already have an account? <Link to="/">Login</Link>
        </p>
      </form>
    </div>
  );
}

export default Signup;