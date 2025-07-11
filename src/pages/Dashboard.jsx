import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import Chart from 'chart.js/auto';
import { toast } from 'react-toastify';
import emailjs from '@emailjs/browser';

function Dashboard() {
  const navigate = useNavigate();
  const [authLoading, setAuthLoading] = useState(true);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [expenseLoading, setExpenseLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [prevChartLoading, setPrevChartLoading] = useState(false);
  const [forecastChartLoading, setForecastChartLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [budget, setBudget] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [expenseData, setExpenseData] = useState({ name: '', amount: '', category: 'Food' });
  const [showBudgetInput, setShowBudgetInput] = useState(true);
  const [aiSuggestion, setAiSuggestion] = useState('Set a budget to get spending insights.');
  const [showPreviousSelector, setShowPreviousSelector] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [prevData, setPrevData] = useState(null);
  const [tempEmail, setTempEmail] = useState('');
  const [predictions, setPredictions] = useState({});
  const [categoryAlerts, setCategoryAlerts] = useState({});
  const [dailyAdvice, setDailyAdvice] = useState('Add expenses to receive daily spending advice.');
  const [chartData, setChartData] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const categoryChartRef = useRef(null);
  const dailyChartRef = useRef(null);
  const monthlyChartRef = useRef(null);
  const forecastChartRef = useRef(null);
  const prevChartRef = useRef(null);
  const chartInstances = useRef({ category: null, daily: null, monthly: null, forecast: null, previous: null });

  // Initialize EmailJS
  useEffect(() => {
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
    if (!publicKey) {
      console.error('EmailJS public key missing in .env');
      toast.error('EmailJS configuration error: Public key missing');
      return;
    }
    try {
      emailjs.init({
        publicKey: publicKey,
        blockHeadless: true,
        limitRate: { id: 'app', throttle: 10000 },
      });
      console.log('EmailJS initialized with public key:', publicKey);
    } catch (error) {
      console.error('EmailJS initialization failed:', error);
      toast.error('EmailJS initialization failed: ' + error.message);
    }
  }, []);

  // Detect online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user || user.isAnonymous) {
        navigate('/login');
      } else {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUsername(docSnap.data()?.username || 'User');
            setBudget(docSnap.data()?.budget || '');
            setShowBudgetInput(!docSnap.data()?.budget || docSnap.data()?.lastBudgetMonth !== new Date().getMonth());
          } else {
            console.warn('User document not found. Creating new document.');
            await setDoc(docRef, { username: user.displayName || 'User', email: user.email || '' });
            setUsername(user.displayName || 'User');
            setShowBudgetInput(true);
          }
          await checkForBudgetReset(user.uid, docSnap.exists() ? docSnap.data()?.email || user.email : user.email);
          await loadExpenses(user.uid);
          await predictExpenses(user.uid);
        } catch (error) {
          console.error('Firestore auth error:', error);
          if (error.code === 'unavailable') {
            setIsOffline(true);
            setAiSuggestion('You are offline. Set a budget to get insights when reconnected.');
            setDailyAdvice('You are offline. Add expenses when reconnected for advice.');
            setCategoryAlerts({});
            toast.error('You are offline. Some features may be unavailable.');
          } else {
            toast.error('Failed to load user data. Check Firebase configuration.');
          }
        } finally {
          setAuthLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Render charts
  useEffect(() => {
    if (chartData && categoryChartRef.current && dailyChartRef.current && monthlyChartRef.current && !chartLoading) {
      drawCharts(chartData.category, chartData.daily, chartData.monthly);
    }
  }, [chartData, chartLoading]);

  const logout = async () => {
    try {
      await auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to log out. Please try again.');
    }
  };

  const checkForBudgetReset = async (uid, email) => {
    setBudgetLoading(true);
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      const now = new Date();
      const currentMonth = now.getMonth();
      const lastMonth = docSnap.exists() ? docSnap.data()?.lastBudgetMonth : null;

      if (!docSnap.exists()) {
        await setDoc(docRef, { email, lastBudgetMonth: currentMonth, budget: 0 });
        setShowBudgetInput(true);
      } else if (lastMonth !== currentMonth) {
        setShowBudgetInput(true);
        await setDoc(docRef, {
          lastBudgetMonth: currentMonth,
          previousBudget: docSnap.data()?.budget || 0,
          email,
        }, { merge: true });
      } else {
        setShowBudgetInput(false);
        setBudget(docSnap.data()?.budget || '');
      }
    } catch (error) {
      console.error('Firestore checkForBudgetReset error:', error);
      if (error.code === 'unavailable') {
        setIsOffline(true);
        toast.error('You are offline. Budget data may not be updated.');
      } else {
        toast.error('Failed to load budget data. Check Firebase configuration.');
      }
    } finally {
      setBudgetLoading(false);
    }
  };

  const setUserBudget = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !budget || isNaN(budget) || budget <= 0) {
      toast.error('Please enter a valid budget amount.');
      return;
    }
    setBudgetLoading(true);
    try {
      await setDoc(doc(db, 'users', uid), { budget: parseFloat(budget) }, { merge: true });
      setShowBudgetInput(false);
      await loadExpenses(uid);
    } catch (error) {
      console.error('Firestore setUserBudget error:', error);
      if (error.code === 'unavailable') {
        setIsOffline(true);
        toast.error('You are offline. Budget will be saved when you reconnect.');
      } else {
        toast.error('Failed to set budget. Check Firebase configuration.');
      }
    } finally {
      setBudgetLoading(false);
    }
  };

  const loadExpenses = async (uid) => {
    setExpenseLoading(true);
    setChartLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const expensesRef = collection(db, 'users', uid, 'expenses');
      const q = query(expensesRef, where('timestamp', '>=', start));
      const snap = await getDocs(q);

      const list = [];
      let total = 0;
      const daily = {};
      const category = { Food: 0, Transport: 0, Entertainment: 0, Bills: 0, Other: 0 };
      const currentMonthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      const monthly = { [currentMonthKey]: 0 };

      if (!snap.empty) {
        snap.forEach((doc) => {
          const d = doc.data();
          if (d.amount && d.timestamp && d.category) {
            list.push({ id: doc.id, ...d });
            total += d.amount;
            const date = new Date(d.timestamp);
            const dailyKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            daily[dailyKey] = (daily[dailyKey] || 0) + d.amount;
            category[d.category] = (category[d.category] || 0) + d.amount;
            if (monthKey === currentMonthKey) {
              monthly[monthKey] = (monthly[monthKey] || 0) + d.amount;
            }
          }
        });
      }

      setExpenses(list);
      setTotalExpenses(total);
      setAiSuggestion(getSuggestion(budget, total));
      await calculateCategoryAlerts(category, uid);
      await calculateDailyAdvice(total, uid);
      setChartData({ category, daily, monthly });
    } catch (error) {
      console.error('Firestore loadExpenses error:', error);
      if (error.code === 'unavailable') {
        setIsOffline(true);
        setAiSuggestion('You are offline. Set a budget to get insights when reconnected.');
        setDailyAdvice('You are offline. Add expenses when reconnected for advice.');
        setCategoryAlerts({});
        toast.error('You are offline. Expense data may not be available.');
      } else {
        toast.error('Failed to load expenses. Check Firebase configuration.');
      }
    } finally {
      setExpenseLoading(false);
      setChartLoading(false);
    }
  };

  const addExpense = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || isOffline) {
      toast.error(isOffline ? 'You are offline. Expenses cannot be added.' : 'User not authenticated.');
      return;
    }
    const { name, amount, category } = expenseData;
    if (!name || !amount || isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid expense name and amount.');
      return;
    }

    setExpenseLoading(true);
    try {
      await addDoc(collection(db, 'users', uid, 'expenses'), {
        name,
        amount: parseFloat(amount),
        category,
        timestamp: Date.now(),
      });
      setExpenseData({ name: '', amount: '', category: 'Food' });
      await loadExpenses(uid);
      await predictExpenses(uid);
    } catch (error) {
      console.error('Firestore addExpense error:', error);
      if (error.code === 'unavailable') {
        setIsOffline(true);
        toast.error('You are offline. Expense will be synced when you reconnect.');
      } else {
        toast.error('Failed to add expense. Check Firebase configuration.');
      }
    } finally {
      setExpenseLoading(false);
    }
  };

  const getSuggestion = (budget, total) => {
    const b = parseFloat(budget);
    if (!b) return 'Set a budget to get spending insights.';
    if (total > b) return 'You’ve overspent. Consider reducing non-essential expenses.';
    if (total > b * 0.9) return "You're close to your limit. Consider saving more.";
    if (total < b * 0.5) return 'Great job! You are well below budget.';
    return 'You are spending moderately. Keep it up.';
  };

  const calculateCategoryAlerts = async (categoryData, uid) => {
    const b = parseFloat(budget);
    if (!b) {
      setCategoryAlerts({});
      return;
    }
    const alerts = {};
    const categories = ['Food', 'Transport', 'Entertainment', 'Bills', 'Other'];
    categories.forEach((cat) => {
      const spent = categoryData[cat] || 0;
      const percentage = (spent / (b / categories.length)) * 100;
      if (percentage >= 100) {
        alerts[cat] = `❗ You’ve overspent on ${cat}`;
      } else if (percentage >= 80) {
        alerts[cat] = `⚠ You’ve spent ${percentage.toFixed(0)}% of your ${cat} budget`;
      }
    });
    setCategoryAlerts(alerts);
  };

  const calculateDailyAdvice = async (total, uid) => {
    const b = parseFloat(budget);
    if (!b) {
      setDailyAdvice('Set a budget to receive daily spending advice.');
      return;
    }
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysLeft = daysInMonth - currentDay + 1;
    const remainingBudget = b - total;
    const dailyAllowance = remainingBudget / daysLeft;

    let advice;
    if (dailyAllowance < 0) {
      advice = `You're ₦${Math.abs(remainingBudget).toFixed(2)} above pace. Spend no more than ₦0/day to recover.`;
    } else if (dailyAllowance < b / daysInMonth * 0.5) {
      advice = `You're spending faster than planned. Keep daily spending under ₦${dailyAllowance.toFixed(2)} to stay on track.`;
    } else {
      advice = `You're on track! Keep spending under ₦${dailyAllowance.toFixed(2)}/day.`;
    }
    setDailyAdvice(advice);
  };

  const predictExpenses = async (uid) => {
    setPredictionLoading(true);
    setForecastChartLoading(true);
    try {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).getTime();
      const expensesRef = collection(db, 'users', uid, 'expenses');
      const q = query(expensesRef, where('timestamp', '>=', sixMonthsAgo));
      const snap = await getDocs(q);

      const categorySums = {};
      const monthlyCounts = {};
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.amount && d.timestamp && d.category) {
          const date = new Date(d.timestamp);
          const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          categorySums[d.category] = (categorySums[d.category] || 0) + d.amount;
          monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
        }
      });

      const predictions = {};
      let totalPredicted = 0;
      const categories = ['Food', 'Transport', 'Entertainment', 'Bills', 'Other'];
      categories.forEach((cat) => {
        const total = categorySums[cat] || 0;
        const avg = Object.keys(monthlyCounts).length > 0 ? total / Object.keys(monthlyCounts).length : 0;
        predictions[cat] = {
          predicted: avg,
          actual: expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
          suggestion: avg > 0 ? `You normally spend ₦${avg.toFixed(2)} on ${cat}. Consider adjusting to ₦${(avg * 0.9).toFixed(2)}.` : `No ${cat} spending recorded recently.`,
        };
        totalPredicted += avg;
      });

      predictions.summary = `Projected total spending for next month: ₦${totalPredicted.toFixed(2)}. Review category suggestions to optimize your budget.`;
      setPredictions(predictions);
      setTimeout(() => drawForecastChart(predictions), 100);
    } catch (error) {
      console.error('Firestore predictExpenses error:', error);
      if (error.code === 'unavailable') {
        setIsOffline(true);
        toast.error('You are offline. Predictions may not be available.');
      } else {
        toast.error('Failed to load expense predictions. Check Firebase configuration.');
      }
    } finally {
      setPredictionLoading(false);
      setForecastChartLoading(false);
    }
  };

  const drawCharts = (categoryData, dailyData, monthlyData) => {
    const catCtx = categoryChartRef.current?.getContext('2d');
    const dayCtx = dailyChartRef.current?.getContext('2d');
    const monthCtx = monthlyChartRef.current?.getContext('2d');

    if (chartInstances.current.category) chartInstances.current.category.destroy();
    if (chartInstances.current.daily) chartInstances.current.daily.destroy();
    if (chartInstances.current.monthly) chartInstances.current.monthly.destroy();

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 14, family: 'Arial', weight: 'bold' },
            color: '#1e3a8a',
            padding: 15,
            boxWidth: 20,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(30, 58, 138, 0.8)',
          titleFont: { size: 14, family: 'Arial', weight: 'bold' },
          bodyFont: { size: 12, family: 'Arial' },
          padding: 10,
          cornerRadius: 5,
          callbacks: {
            label: (context) => context.label === 'No Data' ? 'No expenses recorded' : `₦${context.raw.toFixed(2)}`,
          },
        },
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart',
      },
    };

    if (catCtx) {
      chartInstances.current.category = new Chart(catCtx, {
        type: 'pie',
        data: {
          labels: Object.keys(categoryData).length > 0 ? Object.keys(categoryData) : ['No Data'],
          datasets: [{
            data: Object.keys(categoryData).length > 0 ? Object.values(categoryData) : [1],
            backgroundColor: ['#3b82f6', '#10b981', '#fbbf24', '#ef4444', '#a78bfa'],
            borderColor: '#fff',
            borderWidth: 2,
          }],
        },
        options: {
          ...chartOptions,
          plugins: {
            ...chartOptions.plugins,
            title: {
              display: true,
              text: 'Category Breakdown',
              font: { size: 18, family: 'Arial', weight: 'bold' },
              color: '#1e3a8a',
              padding: { top: 10, bottom: 20 },
            },
          },
        },
      });
    }

    if (dayCtx) {
      const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const sortedDailyKeys = Object.keys(dailyData).sort((a, b) => new Date(a) - new Date(b));
      const sortedDailyValues = sortedDailyKeys.map(key => dailyData[key]);
      chartInstances.current.daily = new Chart(dayCtx, {
        type: 'line',
        data: {
          labels: sortedDailyKeys.length > 0 ? sortedDailyKeys : [today],
          datasets: [{
            label: 'Daily Spending',
            data: sortedDailyKeys.length > 0 ? sortedDailyValues : [0],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#1e3a8a',
          }],
        },
        options: {
          ...chartOptions,
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Amount (₦)', font: { size: 14, family: 'Arial', weight: 'bold' }, color: '#1e3a8a' },
              grid: { color: '#e5e7eb' },
              ticks: { font: { size: 12, family: 'Arial' }, color: '#1e3a8a' },
            },
            x: {
              title: { display: true, text: 'Date', font: { size: 14, family: 'Arial', weight: 'bold' }, color: '#1e3a8a' },
              grid: { display: false },
              ticks: {
                font: { size: 12, family: 'Arial' },
                color: '#1e3a8a',
                maxTicksLimit: 10,
                autoSkip: true,
              },
            },
          },
          plugins: {
            ...chartOptions.plugins,
            title: {
              display: true,
              text: 'Daily Spending',
              font: { size: 18, family: 'Arial', weight: 'bold' },
              color: '#1e3a8a',
              padding: { top: 10, bottom: 20 },
            },
          },
        },
      });
    }

    if (monthCtx) {
      const currentMonth = `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;
      chartInstances.current.monthly = new Chart(monthCtx, {
        type: 'bar',
        data: {
          labels: Object.keys(monthlyData).length > 0 ? Object.keys(monthlyData) : [currentMonth],
          datasets: [{
            label: 'Monthly Spending',
            data: Object.keys(monthlyData).length > 0 ? Object.values(monthlyData) : [0],
            backgroundColor: '#10b981',
            borderColor: '#10b981',
            borderWidth: 1,
          }],
        },
        options: {
          ...chartOptions,
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Amount (₦)', font: { size: 14, family: 'Arial', weight: 'bold' }, color: '#1e3a8a' },
              grid: { color: '#e5e7eb' },
              ticks: { font: { size: 12, family: 'Arial' }, color: '#1e3a8a' },
            },
            x: {
              title: { display: true, text: 'Month', font: { size: 14, family: 'Arial', weight: 'bold' }, color: '#1e3a8a' },
              grid: { display: false },
              ticks: {
                font: { size: 12, family: 'Arial' },
                color: '#1e3a8a',
                maxTicksLimit: 6,
                autoSkip: true,
              },
            },
          },
          plugins: {
            ...chartOptions.plugins,
            title: {
              display: true,
              text: 'Monthly Spending',
              font: { size: 18, family: 'Arial', weight: 'bold' },
              color: '#1e3a8a',
              padding: { top: 10, bottom: 20 },
            },
          },
        },
      });
    }
  };

  const drawForecastChart = (predictions) => {
    const ctx = forecastChartRef.current?.getContext('2d');
    if (chartInstances.current.forecast) chartInstances.current.forecast.destroy();
    if (ctx) {
      const categories = ['Food', 'Transport', 'Entertainment', 'Bills', 'Other'];
      chartInstances.current.forecast = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: categories,
          datasets: [
            {
              label: 'Predicted Spending',
              data: categories.map(cat => predictions[cat]?.predicted || 0),
              backgroundColor: '#3b82f6',
              borderColor: '#3b82f6',
              borderWidth: 1,
            },
            {
              label: 'Actual Spending',
              data: categories.map(cat => predictions[cat]?.actual || 0),
              backgroundColor: '#fbbf24',
              borderColor: '#fbbf24',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Amount (₦)', font: { size: 14, family: 'Arial', weight: 'bold' }, color: '#1e3a8a' },
              grid: { color: '#e5e7eb' },
              ticks: { font: { size: 12, family: 'Arial' }, color: '#1e3a8a' },
            },
            x: {
              title: { display: true, text: 'Category', font: { size: 14, family: 'Arial', weight: 'bold' }, color: '#1e3a8a' },
              grid: { display: false },
              ticks: {
                font: { size: 12, family: 'Arial' },
                color: '#1e3a8a',
                maxTicksLimit: 5,
                autoSkip: false,
              },
            },
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { size: 14, family: 'Arial', weight: 'bold' },
                color: '#1e3a8a',
                padding: 15,
                boxWidth: 20,
                usePointStyle: true,
              },
            },
            tooltip: {
              backgroundColor: 'rgba(30, 58, 138, 0.8)',
              titleFont: { size: 14, family: 'Arial', weight: 'bold' },
              bodyFont: { size: 12, family: 'Arial' },
              padding: 10,
              cornerRadius: 5,
              callbacks: {
                label: (context) => `₦${context.raw.toFixed(2)}`,
              },
            },
            title: {
              display: true,
              text: 'Expense Forecast',
              font: { size: 18, family: 'Arial', weight: 'bold' },
              color: '#1e3a8a',
              padding: { top: 10, bottom: 20 },
            },
          },
          animation: {
            duration: 1000,
            easing: 'easeOutQuart',
          },
        },
      });
    }
  };

  const drawPreviousChart = (dailyData) => {
    const ctx = prevChartRef.current?.getContext('2d');
    if (chartInstances.current.previous) chartInstances.current.previous.destroy();
    if (ctx) {
      const sortedDailyKeys = Object.keys(dailyData).sort((a, b) => new Date(a) - new Date(b));
      const sortedDailyValues = sortedDailyKeys.map(key => dailyData[key]);
      chartInstances.current.previous = new Chart(ctx, {
        type: 'line',
        data: {
          labels: sortedDailyKeys.length > 0 ? sortedDailyKeys : ['No Data'],
          datasets: [{
            label: 'Daily Spending',
            data: sortedDailyKeys.length > 0 ? sortedDailyValues : [0],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#1e3a8a',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Amount (₦)', font: { size: 14, family: 'Arial', weight: 'bold' }, color: '#1e3a8a' },
              grid: { color: '#e5e7eb' },
              ticks: { font: { size: 12, family: 'Arial' }, color: '#1e3a8a' },
            },
            x: {
              title: { display: true, text: 'Date', font: { size: 14, family: 'Arial', weight: 'bold' }, color: '#1e3a8a' },
              grid: { display: false },
              ticks: {
                font: { size: 12, family: 'Arial' },
                color: '#1e3a8a',
                maxTicksLimit: 10,
                autoSkip: true,
                callback: function(value, index, values) {
                  const date = new Date(sortedDailyKeys[index]);
                  if (index % 3 === 0 || index === 0 || index === values.length - 1) {
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }
                  return null;
                },
              },
            },
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { size: 14, family: 'Arial', weight: 'bold' },
                color: '#1e3a8a',
                padding: 15,
                boxWidth: 20,
                usePointStyle: true,
              },
            },
            tooltip: {
              backgroundColor: 'rgba(30, 58, 138, 0.8)',
              titleFont: { size: 14, family: 'Arial', weight: 'bold' },
              bodyFont: { size: 12, family: 'Arial' },
              padding: 10,
              cornerRadius: 5,
              callbacks: {
                label: (context) => `₦${context.raw.toFixed(2)}`,
              },
            },
            title: {
              display: true,
              text: `Spending for ${selectedMonth}`,
              font: { size: 18, family: 'Arial', weight: 'bold' },
              color: '#1e3a8a',
              padding: { top: 10, bottom: 20 },
            },
          },
          animation: {
            duration: 1000,
            easing: 'easeOutQuart',
          },
        },
      });
    }
  };

  const fetchPreviousData = async () => {
    if (!selectedMonth) {
      toast.error('Please select a month.');
      return;
    }
    setPrevChartLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = new Date(year, month - 1, 1).getTime();
      const end = new Date(year, month, 0, 23, 59, 59).getTime();

      const expensesRef = collection(db, 'users', uid, 'expenses');
      const q = query(expensesRef, where('timestamp', '>=', start), where('timestamp', '<=', end));
      const snap = await getDocs(q);

      let total = 0;
      const daily = {};
      const category = { Food: 0, Transport: 0, Entertainment: 0, Bills: 0, Other: 0 };
      const monthly = { [selectedMonth]: 0 };

      if (!snap.empty) {
        snap.forEach((doc) => {
          const d = doc.data();
          if (d.amount && d.timestamp && d.category) {
            total += d.amount;
            const date = new Date(d.timestamp);
            const dailyKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            daily[dailyKey] = (daily[dailyKey] || 0) + d.amount;
            category[d.category] = (category[d.category] || 0) + d.amount;
            monthly[monthKey] = (monthly[monthKey] || 0) + d.amount;
          }
        });
      }

      // Limit daily data to every 3rd day for display
      const sortedDailyKeys = Object.keys(daily).sort((a, b) => new Date(a) - new Date(b));
      const filteredDaily = {};
      sortedDailyKeys.forEach((key, index) => {
        if (index % 3 === 0 || index === 0 || index === sortedDailyKeys.length - 1) {
          filteredDaily[key] = daily[key];
        }
      });

      const aiSummary = await getPreviousMonthSuggestion(total, uid);
      setPrevData({ total, daily: filteredDaily, category, monthly, aiSummary });
      setTimeout(() => drawPreviousChart(filteredDaily), 100);
    } catch (error) {
      console.error('Firestore fetchPreviousData error:', error);
      if (error.code === 'unavailable') {
        setIsOffline(true);
        toast.error('You are offline. Previous month data may not be available.');
      } else {
        toast.error('Failed to load previous month data. Check Firebase configuration.');
      }
    } finally {
      setPrevChartLoading(false);
    }
  };

  const getPreviousMonthSuggestion = async (total, uid) => {
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      const prevBudget = userSnap.data()?.previousBudget || 0;
      const b = parseFloat(prevBudget);
      if (b === 0) return 'No budget set for the previous month.';
      if (total > b) return `You overspent by ₦${(total - b).toFixed(2)} last month. Consider cutting back on non-essentials.`;
      if (total > b * 0.9) return `You were within 10% of your ₦${b.toFixed(2)} budget last month. Try to save more.`;
      if (total < b * 0.5) return `Excellent! You spent only ₦${total.toFixed(2)} of your ₦${b.toFixed(2)} budget last month.`;
      return `You spent ₦${total.toFixed(2)} of your ₦${b.toFixed(2)} budget last month. Good job staying on track.`;
    } catch (error) {
      console.error('Firestore getPreviousMonthSuggestion error:', error);
      if (error.code === 'unavailable') {
        setIsOffline(true);
        return 'You are offline. Previous budget data unavailable.';
      }
      return 'Failed to load previous budget data.';
    }
  };

  const sendEmailReport = async (email) => {
    if (!email || isOffline) {
      toast.error(isOffline ? 'You are offline. Email reports cannot be sent.' : 'Please enter a valid email address.');
      return;
    }
    setEmailLoading(true);
    try {
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
      if (!serviceId || !templateId || !publicKey) {
        throw new Error('EmailJS configuration missing in .env');
      }
      const currentMonth = `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;
      let categoryBreakdown = 'Category Breakdown:\n';
      if (chartData?.category && Object.keys(chartData.category).length > 0) {
        for (const [cat, amount] of Object.entries(chartData.category)) {
          categoryBreakdown += `${cat}: ₦${amount.toFixed(2)}\n`;
        }
      } else {
        categoryBreakdown += 'No expenses recorded this month.\n';
      }

      const reportMessage = `
Your Spending Report for ${currentMonth}:
Total Spent: ₦${totalExpenses.toFixed(2)}
${categoryBreakdown}
AI Suggestion: ${aiSuggestion}
Daily Advice: ${dailyAdvice}
      `.trim();

      const templateParams = {
        to_email: email,
        to_name: auth.currentUser?.displayName || 'User',
        total_spent: totalExpenses.toFixed(2),
        budget: parseFloat(budget || 0).toFixed(2),
        message: reportMessage,
      };

      console.log('Sending email with params:', templateParams);

      const response = await emailjs.send(serviceId, templateId, templateParams);
      toast.success('Current month report sent to your email!');
      console.log('EmailJS response:', response);
    } catch (error) {
      console.error('EmailJS error:', error);
      toast.error('Failed to send current month report: ' + error.message);
    } finally {
      setEmailLoading(false);
    }
  };

  const sendPreviousMonthEmailReport = async () => {
    if (!prevData || !selectedMonth) {
      toast.error('No data available to send.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid || isOffline) {
      toast.error(isOffline ? 'You are offline. Email reports cannot be sent.' : 'User not authenticated.');
      return;
    }

    setEmailLoading(true);
    try {
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
      if (!serviceId || !templateId || !publicKey) {
        throw new Error('EmailJS configuration missing in .env');
      }
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      let email = userSnap.data()?.email || auth.currentUser?.email || tempEmail;

      const validRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !email.match(validRegex)) {
        toast.error('Please enter a valid email address.');
        return;
      }

      if (tempEmail && tempEmail !== userSnap.data()?.email) {
        await setDoc(doc(db, 'users', uid), { email: tempEmail }, { merge: true });
      }

      const templateParams = {
        to_email: email,
        to_name: auth.currentUser?.displayName || 'User',
        total_spent: prevData.total.toFixed(2),
        budget: parseFloat(userSnap.data()?.previousBudget || 0).toFixed(2),
        message: `Your Spending Report for ${selectedMonth}:\nTotal Spent: ₦${prevData.total.toFixed(2)}\nSummary: ${prevData.aiSummary}`,
      };

      console.log('Sending previous month email with params:', templateParams);

      const response = await emailjs.send(serviceId, templateId, templateParams);
      toast.success(`Report for ${selectedMonth} sent to your email!`);
      console.log('EmailJS response:', response);
    } catch (error) {
      console.error('EmailJS error:', error);
      toast.error('Failed to send previous month report: ' + error.message);
    } finally {
      setEmailLoading(false);
      setTempEmail('');
    }
  };

  const downloadCSV = async () => {
    setCsvLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid || isOffline) {
      toast.error(isOffline ? 'You are offline. CSV download unavailable.' : 'User not authenticated.');
      return;
    }
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'expenses'));
      let csv = 'Name,Amount,Category,Date\n';

      snap.forEach((doc) => {
        const d = doc.data();
        if (d.name && d.amount && d.category && d.timestamp) {
          const date = new Date(d.timestamp).toLocaleDateString();
          csv += `${d.name},${d.amount.toFixed(2)},${d.category},${date}\n`;
        }
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'expenses.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Firestore downloadCSV error:', error);
      if (error.code === 'unavailable') {
        setIsOffline(true);
        toast.error('You are offline. CSV download will be available when you reconnect.');
      } else {
        toast.error('Failed to download CSV. Check Firebase configuration.');
      }
    } finally {
      setCsvLoading(false);
    }
  };

  const downloadPreviousMonthCSV = async () => {
    if (!selectedMonth) {
      toast.error('Please select a month.');
      return;
    }
    setCsvLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid || isOffline) {
      toast.error(isOffline ? 'You are offline. CSV download unavailable.' : 'User not authenticated.');
      return;
    }
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = new Date(year, month - 1, 1).getTime();
      const end = new Date(year, month, 0, 23, 59, 59).getTime();

      const expensesRef = collection(db, 'users', uid, 'expenses');
      const q = query(expensesRef, where('timestamp', '>=', start), where('timestamp', '<=', end));
      const snap = await getDocs(q);

      let csv = 'Name,Amount,Category,Date\n';
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.name && d.amount && d.category && d.timestamp) {
          const date = new Date(d.timestamp).toLocaleDateString();
          csv += `${d.name},${d.amount.toFixed(2)},${d.category},${date}\n`;
        }
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses_${selectedMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Firestore downloadPreviousMonthCSV error:', error);
      if (error.code === 'unavailable') {
        setIsOffline(true);
        toast.error('You are offline. CSV download will be available when you reconnect.');
      } else {
        toast.error('Failed to download previous month CSV. Check Firebase configuration.');
      }
    } finally {
      setCsvLoading(false);
    }
  };

  if (authLoading) {
    return <div className="loader-wrapper"><div className="loader"></div><p>Checking authentication...</p></div>;
  }

  const hasReachedBudget = parseFloat(budget) > 0 && totalExpenses >= parseFloat(budget);

  return (
    <div className="container">
      <div className="header">
        <button onClick={logout} className="button button-danger" aria-label="Logout">Logout</button>
      </div>

      {isOffline && (
        <div className="offline-banner">
          <p>You are offline. Some features may be limited until you reconnect.</p>
        </div>
      )}

      <h1 className="title">Welcome, {username}</h1>

      {budgetLoading ? (
        <div className="loader-wrapper"><div className="loader"></div><p>Loading budget...</p></div>
      ) : showBudgetInput ? (
        <div className="section">
          <h2>Set Your Monthly Budget</h2>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="input"
            placeholder="Enter budget (₦)"
            aria-label="Monthly budget"
            disabled={isOffline}
          />
          <button onClick={setUserBudget} className="button button-blue" disabled={budgetLoading || isOffline}>
            {budgetLoading ? 'Setting Budget...' : isOffline ? 'Offline' : 'Set Budget'}
          </button>
        </div>
      ) : (
        <div className="section">
          <button onClick={() => setShowBudgetInput(true)} className="button button-danger" aria-label="Reset budget" disabled={isOffline}>
            Reset Budget
          </button>
        </div>
      )}

      <p className="budget-info">Budget: ₦{budget || '0'}</p>

      <div className="section">
        <h2>Add Expense</h2>
        <input
          type="text"
          placeholder="Name"
          value={expenseData.name}
          onChange={(e) => setExpenseData({ ...expenseData, name: e.target.value })}
          className="input"
          disabled={hasReachedBudget || expenseLoading || isOffline}
          aria-label="Expense name"
        />
        <input
          type="number"
          placeholder="Amount"
          value={expenseData.amount}
          onChange={(e) => setExpenseData({ ...expenseData, amount: e.target.value })}
          className="input"
          disabled={hasReachedBudget || expenseLoading || isOffline}
          aria-label="Expense amount"
        />
        <select
          value={expenseData.category}
          onChange={(e) => setExpenseData({ ...expenseData, category: e.target.value })}
          className="input"
          disabled={hasReachedBudget || expenseLoading || isOffline}
          aria-label="Expense category"
        >
          <option value="Food">Food</option>
          <option value="Transport">Transport</option>
          <option value="Entertainment">Entertainment</option>
          <option value="Bills">Bills</option>
          <option value="Other">Other</option>
        </select>
        {hasReachedBudget ? (
          <p className="budget-limit">You have reached your budget limit</p>
        ) : (
          <button onClick={addExpense} className="button button-green" disabled={expenseLoading || isOffline}>
            {expenseLoading ? 'Adding Expense...' : isOffline ? 'Offline' : 'Add Expense'}
          </button>
        )}
      </div>

      <div className="section">
        <h2>Expenses</h2>
        {expenseLoading ? (
          <div className="loader-wrapper"><div className="loader"></div><p>Loading expenses...</p></div>
        ) : expenses.length > 0 ? (
          <ul className="expense-list">
            {expenses.map((exp) => (
              <li key={exp.id}>
                {exp.name} - ₦{exp.amount.toFixed(2)} ({exp.category})
              </li>
            ))}
          </ul>
        ) : (
          <p>No expenses recorded this month.</p>
        )}
        <button onClick={downloadCSV} className="button button-yellow" disabled={csvLoading || isOffline}>
          {csvLoading ? 'Downloading CSV...' : isOffline ? 'Offline' : 'Download CSV'}
        </button>
      </div>

      <div className="section">
        <h2>Current Month Insights</h2>
        <p className="suggestion">{aiSuggestion}</p>
        <p className="advice">{dailyAdvice}</p>
        {Object.keys(categoryAlerts).map((cat) => (
          <p key={cat} className={categoryAlerts[cat].startsWith('❗') ? 'alert-red' : 'alert-yellow'}>
            {categoryAlerts[cat]}
          </p>
        ))}
        {chartLoading ? (
          <div className="loader-wrapper"><div className="loader"></div><p>Loading charts...</p></div>
        ) : (
          <>
            <div className="chart-container">
              <h3>Category Breakdown</h3>
              <canvas ref={categoryChartRef} height="300" aria-label="Category breakdown chart"></canvas>
            </div>
            <div className="chart-container">
              <h3>Daily Spending</h3>
              <canvas ref={dailyChartRef} height="300" aria-label="Daily spending chart"></canvas>
            </div>
            <div className="chart-container">
              <h3>Monthly Spending</h3>
              <canvas ref={monthlyChartRef} height="300" aria-label="Monthly spending chart"></canvas>
            </div>
            <button
              onClick={() => sendEmailReport(auth.currentUser?.email || tempEmail)}
              className="button button-green"
              disabled={emailLoading || isOffline}
              aria-label="Send current month report"
            >
              {emailLoading ? 'Sending Email...' : isOffline ? 'Offline' : 'Send Current Month Report'}
            </button>
          </>
        )}
      </div>

      <div className="section">
        <h2>Expense Forecast</h2>
        {predictionLoading || forecastChartLoading ? (
          <div className="loader-wrapper"><div className="loader"></div><p>Loading forecast chart...</p></div>
        ) : (
          <>
            <div className="chart-container">
              <canvas ref={forecastChartRef} height="300" aria-label="Expense forecast chart"></canvas>
            </div>
            {Object.keys(predictions).filter(k => k !== 'summary').map((cat) => (
              <p key={cat} className="suggestion">
                {predictions[cat].suggestion}
              </p>
            ))}
            <p className="suggestion">{predictions.summary}</p>
          </>
        )}
      </div>

      <div className="section">
        <h2>Previous Month Viewer</h2>
        <button onClick={() => setShowPreviousSelector(p => !p)} className="button button-blue" aria-label="Toggle month selector" disabled={isOffline}>
          {showPreviousSelector ? 'Hide Month Selector' : 'Select Previous Month'}
        </button>
        {showPreviousSelector && (
          <div className="input-group">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input"
              aria-label="Select previous month"
              disabled={isOffline}
            />
            <button onClick={fetchPreviousData} className="button button-green" disabled={prevChartLoading || isOffline}>
              {prevChartLoading ? 'Loading Data...' : isOffline ? 'Offline' : 'View Month'}
            </button>
          </div>
        )}

        {prevChartLoading ? (
          <div className="loader-wrapper"><div className="loader"></div><p>Loading previous month chart...</p></div>
        ) : prevData ? (
          <div className="prev-data-container">
            <p><strong>Total Spent in {selectedMonth}:</strong> ₦{prevData.total.toFixed(2)}</p>
            <p>{prevData.aiSummary}</p>
            <div className="chart-container">
              <canvas ref={prevChartRef} height="200" aria-label="Previous month spending chart"></canvas>
            </div>
            <div className="input-group">
              <input
                type="email"
                placeholder="Enter email for report"
                value={tempEmail}
                onChange={(e) => setTempEmail(e.target.value)}
                className="input"
                aria-label="Email for previous month report"
                disabled={isOffline}
              />
              <button onClick={sendPreviousMonthEmailReport} className="button button-green" disabled={emailLoading || isOffline}>
                {emailLoading ? 'Sending Email...' : isOffline ? 'Offline' : 'Send Report via Email'}
              </button>
              <button onClick={downloadPreviousMonthCSV} className="button button-yellow" disabled={csvLoading || isOffline}>
                {csvLoading ? 'Downloading CSV...' : isOffline ? 'Offline' : 'Download CSV'}
              </button>
            </div>
          </div>
        ) : selectedMonth && (
          <div className="prev-data-container">
            <p>No data for {selectedMonth}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;