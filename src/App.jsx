import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Plus, Trash2, X, Edit2, ArrowRight, Check, AlertCircle, Users, Lock, LogOut, Loader2, User, Scissors, Settings, PlusCircle, MinusCircle, Sparkles, ChevronLeft, ChevronRight, Ban, CalendarX2, Repeat, RefreshCw, Undo2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
// 我已經幫你把鑰匙填回去了，這次一定會通！
const firebaseConfig = {
  apiKey: "AIzaSyCDOVJVAgNsASlX-WFC4NKP5m5RNQca1CE",
  authDomain: "project-3599415044521146884.firebaseapp.com",
  projectId: "project-3599415044521146884",
  storageBucket: "project-3599415044521146884.firebasestorage.app",
  messagingSenderId: "293814476826",
  appId: "1:293814476826:web:3b3b38fb05928b0e86b1a3"
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'default-app-id';

const DEFAULT_SERVICE_OPTIONS = ['剪髮', '染髮', '燙髮', '護髮', '洗髮', '頭皮護理', '造型', '諮詢'];

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
const formatDate = (date) => {
  const d = new Date(date);
  return [d.getFullYear(), (d.getMonth() + 1).toString().padStart(2, '0'), d.getDate().toString().padStart(2, '0')].join('-');
};

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // 日期邏輯
  const getWeekDays = (baseDate) => {
    const d = new Date(baseDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(d.setDate(diff));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const temp = new Date(monday);
      temp.setDate(monday.getDate() + i);
      days.push({
        dateObj: temp,
        dateStr: formatDate(temp),
        dayName: ['週一', '週二', '週三', '週四', '週五', '週六', '週日'][i],
        label: `${temp.getMonth() + 1}/${temp.getDate()}`,
        dayIndex: i 
      });
    }
    return days;
  };

  const currentWeekDays = getWeekDays(currentDate);
  const timeSlots = [];
  for (let i = 8 * 60 + 30; i <= 19 * 60; i += 30) timeSlots.push(`${Math.floor(i / 60).toString().padStart(2, '0')}:${(i % 60).toString().padStart(2, '0')}`);
  const allTimePoints = [...timeSlots, "19:30"];

  // 狀態
  const [user, setUser] = useState(null); 
  const [schedule, setSchedule] = useState({}); 
  const [loading, setLoading] = useState(true);
  const [serviceOptions, setServiceOptions] = useState(DEFAULT_SERVICE_OPTIONS);
  const weeklyOffDays = [1]; 
  const [specialOffDates, setSpecialOffDates] = useState(new Set());
  const [recurringItems, setRecurringItems] = useState([]); 
  
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isOffDayModalOpen, setIsOffDayModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false); 
  const [recDay, setRecDay] = useState(0); 
  const [recTime, setRecTime] = useState('10:00');
  const [recName, setRecName] = useState('');
  const [recService, setRecService] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetDateStr, setTargetDateStr] = useState(''); 
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [guestName, setGuestName] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [forceFull, setForceFull] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  
  const [alertMsg, setAlertMsg] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState({ show: false, message: '', onConfirm: null });
  const [isPwdConfirmOpen, setIsPwdConfirmOpen] = useState(false);
  const [pwdConfirmCallback, setPwdConfirmCallback] = useState(null); 
  const [pwdConfirmInput, setPwdConfirmInput] = useState('');
  const nameInputRef = useRef(null);

  // 初始化
  useEffect(() => {
    signInAnonymously(auth);
    onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubSchedule = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'schedule', 'masterSchedule'), (docSnap) => {
        setSchedule(docSnap.exists() ? docSnap.data().events || {} : {});
        setLoading(false); // 這裡會關掉轉圈圈
    });
    const unsubServices = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'services'), (docSnap) => {
        if(docSnap.exists() && docSnap.data().items) setServiceOptions(docSnap.data().items);
    });
    const unsubSettings = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general'), (docSnap) => { 
        if (docSnap.exists() && docSnap.data().specialOffDates) setSpecialOffDates(new Set(docSnap.data().specialOffDates)); 
    });
    const unsubRecurring = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'schedule', 'recurring'), (docSnap) => {
        if(docSnap.exists() && docSnap.data().items) setRecurringItems(docSnap.data().items);
    });
    return () => { unsubSchedule(); unsubServices(); unsubSettings(); unsubRecurring(); };
  }, [user]);

  useEffect(() => { if (serviceOptions.length > 0 && !serviceType) setServiceType(serviceOptions[0]); }, [serviceOptions]);

  // Alert Helpers
  const showAlert = (msg) => setAlertMsg(msg);
  const showConfirm = (message, onConfirm) => setConfirmConfig({ show: true, message, onConfirm });
  const requestPasswordConfirm = (callback) => { setPwdConfirmCallback(() => callback); setPwdConfirmInput(''); setIsPwdConfirmOpen(true); };

  // Data Logic
  const saveToFirestore = async (newSchedule) => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedule', 'masterSchedule'), { events: newSchedule }, { merge: true }); };
  const saveRecurringToFirestore = async (newItems) => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedule', 'recurring'), { items: newItems }, { merge: true }); };
  const saveSettingsToFirestore = async (newSpecialOffDates) => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'general'), { offDays: [1], specialOffDates: Array.from(newSpecialOffDates) }, { merge: true }); };

  const handleSlotClick = (dateStr, dayIndex, time) => {
    if (!isAdmin) return; 
    const isWeeklyOff = weeklyOffDays.includes(dayIndex);
    const isSpecialOff = specialOffDates.has(dateStr);
    if (isWeeklyOff || isSpecialOff) { showAlert('此為公休日，無法安排行程。'); return; }
    setTargetDateStr(dateStr); 
    setStartTime(time); setGuestName(''); setServiceType(serviceOptions[0]); setForceFull(false); setEditingEventId(null);
    const timeIndex = timeSlots.indexOf(time);
    setEndTime(timeIndex !== -1 && timeIndex + 1 < allTimePoints.length ? allTimePoints[timeIndex + 1] : time);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!guestName.trim()) { showAlert('請輸入客人姓名'); return; }
    let newSchedule = { ...schedule };
    if (editingEventId) { 
        Object.keys(newSchedule).forEach(k => { if(newSchedule[k]) newSchedule[k] = newSchedule[k].filter(evt => typeof evt==='string' ? !evt.startsWith(editingEventId) : true); if(newSchedule[k].length===0) delete newSchedule[k]; }); 
    }
    
    const bookingId = generateId();
    const fullEventText = `${bookingId}___${guestName} - ${serviceType}`;
    const startIndex = timeSlots.indexOf(startTime);
    const targetEndIndex = allTimePoints.indexOf(endTime);
    
    if (startIndex !== -1 && targetEndIndex !== -1) {
       for (let i = startIndex; i < targetEndIndex; i++) {
         const slotId = `${targetDateStr}-${timeSlots[i]}`;
         const currentEvents = newSchedule[slotId] ? [...newSchedule[slotId]] : [];
         if (currentEvents.length < 2) {
           currentEvents.push(fullEventText);
           if (forceFull && currentEvents.length < 2) currentEvents.push('__LOCKED__');
           newSchedule[slotId] = currentEvents;
         }
       }
       setSchedule(newSchedule); setIsModalOpen(false); await saveToFirestore(newSchedule);
    }
  };