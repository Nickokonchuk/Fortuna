/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, RotateCcw, X, BookOpen, Volume2, VolumeX, Library } from 'lucide-react';

// --- Константи та Налаштування ---
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', 
  '#F7DC6F', '#BB8FCE', '#82E0AA', '#F1948A', '#85C1E9'
];

const FRICTION = 0.985; // Тертя
const MIN_VELOCITY = 0.001;

export default function App() {
  const [sectors, setSectors] = useState<string[]>(['1984', 'Маленький принц', 'Алхімік', 'Кобзар', 'Тигролови', 'Інтернат']);
  const [inputText, setInputText] = useState(sectors.join('\n'));
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [winnerCover, setWinnerCover] = useState<string | null>(null);
  const [isFetchingCover, setIsFetchingCover] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const lastSectorRef = useRef(-1);
  const requestRef = useRef<number | null>(null);

  // Використовуємо refs для аудіо, щоб вони були стабільними
  const tickPoolRef = useRef<HTMLAudioElement[]>([]);
  const poolIndexRef = useRef(0);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);

  // Ініціалізація аудіо
  useEffect(() => {
    const poolSize = 10;
    const pool: HTMLAudioElement[] = [];
    const tickUrl = 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3';
    
    for (let i = 0; i < poolSize; i++) {
      const audio = new Audio('/tick.mp3');
      audio.preload = 'auto';
      audio.onerror = () => {
        console.warn(`Failed to load /tick.mp3, trying fallback...`);
        if (audio.src.includes('/tick.mp3')) {
          audio.src = tickUrl;
        }
      };
      pool.push(audio);
    }
    tickPoolRef.current = pool;

    const win = new Audio('/win.mp3');
    win.preload = 'auto';
    win.onerror = () => {
      console.warn(`Failed to load /win.mp3, trying fallback...`);
      if (win.src.includes('/win.mp3')) {
        win.src = 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3';
      }
    };
    winAudioRef.current = win;

    return () => {
      tickPoolRef.current = [];
      winAudioRef.current = null;
    };
  }, []);

  // --- Логіка Аудіо ---
  const unlockAudio = useCallback(() => {
    if (isAudioUnlocked) return;
    
    // Використовуємо окремий порожній звук для розблокування аудіо-контексту,
    // щоб не переривати основні звуки колеса
    const silentSrc = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    const audio = new Audio(silentSrc);
    
    audio.play().then(() => {
      setIsAudioUnlocked(true);
      console.log('Audio context unlocked');
    }).catch(e => {
      console.warn('Audio unlock failed:', e);
    });
  }, [isAudioUnlocked]);

  const playTick = useCallback(() => {
    if (isMuted || tickPoolRef.current.length === 0) return;
    
    const audio = tickPoolRef.current[poolIndexRef.current];
    
    // Скидаємо час тільки якщо звук не в процесі завантаження/програвання
    // або використовуємо безпечний метод
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.4;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        // Ігноруємо помилку переривання, вона не критична для "тікання"
        if (e.name !== 'AbortError') {
          console.error('Tick play failed:', e);
        }
      });
    }
    
    poolIndexRef.current = (poolIndexRef.current + 1) % tickPoolRef.current.length;
  }, [isMuted]);

  const playWin = useCallback(() => {
    if (isMuted || !winAudioRef.current) return;
    const audio = winAudioRef.current;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.5;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        if (e.name !== 'AbortError') {
          console.error('Win play failed:', e);
        }
      });
    }
  }, [isMuted]);

  // Тестовий звук для розблокування аудіо в браузері
  const testSound = () => {
    unlockAudio();
    // Даємо невелику затримку, щоб встигло розблокуватись
    setTimeout(() => {
      playTick();
    }, 100);
  };

  // --- Малювання Колеса ---
  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 10;
    const sectorAngle = (2 * Math.PI) / sectors.length;

    ctx.clearRect(0, 0, size, size);

    sectors.forEach((sector, i) => {
      const angle = rotationRef.current + i * sectorAngle;
      
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, angle, angle + sectorAngle);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(angle + sectorAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'white';
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      
      // Обрізаємо довгі назви книг
      const displayText = sector.length > 25 ? sector.substring(0, 22) + '...' : sector;
      ctx.fillText(displayText, radius - 30, 7);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(center, center, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#2D3436';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.stroke();
  }, [sectors]);

  const fetchBookCover = async (title: string) => {
    setIsFetchingCover(true);
    setWinnerCover(null);
    try {
      const response = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1`);
      const data = await response.json();
      if (data.docs && data.docs.length > 0 && data.docs[0].cover_i) {
        const coverId = data.docs[0].cover_i;
        setWinnerCover(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`);
      }
    } catch (error) {
      console.error('Error fetching book cover:', error);
    } finally {
      setIsFetchingCover(false);
    }
  };

  // --- Анімація ---
  const animate = useCallback(() => {
    if (velocityRef.current > MIN_VELOCITY) {
      rotationRef.current += velocityRef.current;
      velocityRef.current *= FRICTION;

      const sectorAngle = (2 * Math.PI) / sectors.length;
      const currentSector = Math.floor(
        ((1.5 * Math.PI - rotationRef.current) % (2 * Math.PI) + (2 * Math.PI)) % (2 * Math.PI) / sectorAngle
      );

      if (currentSector !== lastSectorRef.current) {
        playTick();
        lastSectorRef.current = currentSector;
      }

      drawWheel();
      requestRef.current = requestAnimationFrame(animate);
    } else {
      setIsSpinning(false);
      velocityRef.current = 0;
      
      const sectorAngle = (2 * Math.PI) / sectors.length;
      const winningIndex = Math.floor(
        ((1.5 * Math.PI - rotationRef.current) % (2 * Math.PI) + (2 * Math.PI)) % (2 * Math.PI) / sectorAngle
      );
      
      const winningTitle = sectors[winningIndex];
      setWinner(winningTitle);
      fetchBookCover(winningTitle);
      playWin();
    }
  }, [sectors, drawWheel, playTick, playWin]);

  const handleSpin = () => {
    console.log('Spin requested. Audio unlocked:', isAudioUnlocked);
    if (isSpinning || sectors.length < 2) return;
    
    // Спроба розблокувати аудіо при першому кліку
    unlockAudio();

    setWinner(null);
    setIsSpinning(true);
    velocityRef.current = 0.4 + Math.random() * 0.4;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    const newSectors = inputText.split('\n').filter(s => s.trim() !== '');
    if (newSectors.length >= 2) {
      setSectors(newSectors);
    }
  }, [inputText]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  const closeModal = () => {
    setWinner(null);
    setWinnerCover(null);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex flex-col md:flex-row overflow-hidden">
      
      {/* Панель керування */}
      <aside className="w-full md:w-80 bg-white/80 backdrop-blur-xl border-b md:border-r border-slate-200 p-6 flex flex-col gap-6 z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-600 rounded-lg">
            <Library className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Бібліотека</h1>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Список книг (кожна з нового рядка)
          </label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full h-64 p-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all resize-none bg-white/50"
            placeholder="Введіть назви книг..."
          />
          <p className="text-[10px] text-slate-400 leading-tight">
            Додайте книги, які плануєте прочитати. Колесо допоможе обрати наступну випадковим чином.
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <button
            onClick={testSound}
            className="flex items-center justify-center gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors text-sm font-medium text-emerald-700"
          >
            <Volume2 className="w-4 h-4" />
            <span>Перевірити звук</span>
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isMuted ? 'Увімкнути звук' : 'Вимкнути звук'}</span>
          </button>
          
          <button
            onClick={() => {
              rotationRef.current = 0;
              velocityRef.current = 0;
              setWinner(null);
              drawWheel();
            }}
            className="flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Очистити колесо</span>
          </button>
        </div>
      </aside>

      {/* Основна зона */}
      <main className="flex-1 relative flex items-center justify-center p-4 md:p-12 bg-gradient-to-br from-emerald-50 via-white to-sky-50">
        
        <div className="relative flex flex-col items-center gap-8">
          {/* Вказівник */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 z-20">
            <div className="w-8 h-10 bg-emerald-600 clip-path-triangle shadow-lg"></div>
          </div>

          {/* Колесо */}
          <div className="relative p-6 bg-white rounded-full shadow-[0_30px_80px_rgba(0,0,0,0.12)] border-[12px] border-white">
            <canvas
              ref={canvasRef}
              width={700}
              height={700}
              className="max-w-full h-auto rounded-full"
            />
          </div>

          {/* Кнопка запуску */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={isSpinning}
            onClick={handleSpin}
            className={`
              group relative flex items-center gap-3 px-12 py-5 rounded-full text-white font-bold text-xl shadow-2xl transition-all
              ${isSpinning ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'}
            `}
          >
            <Play className={`w-6 h-6 ${isSpinning ? 'animate-pulse' : ''}`} />
            <span>{isSpinning ? 'Обираємо...' : 'ОБРАТИ КНИГУ'}</span>
          </motion.button>
        </div>

        {/* Модальне вікно результату */}
        <AnimatePresence>
          {winner && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 20 }}
                className="bg-white rounded-[2rem] p-10 md:p-14 shadow-2xl max-w-md w-full text-center relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-sky-500"></div>
                
                <div className="mb-6 inline-flex p-5 bg-emerald-50 rounded-full relative overflow-hidden w-32 h-44 items-center justify-center">
                  {isFetchingCover ? (
                    <div className="animate-pulse flex flex-col items-center gap-2">
                      <div className="w-12 h-12 bg-emerald-200 rounded-full"></div>
                      <div className="w-16 h-2 bg-emerald-200 rounded"></div>
                    </div>
                  ) : winnerCover ? (
                    <motion.img 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={winnerCover} 
                      alt={winner || ''}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover rounded-lg shadow-md"
                    />
                  ) : (
                    <BookOpen className="w-12 h-12 text-emerald-600" />
                  )}
                </div>

                <h2 className="text-xl font-bold text-slate-400 mb-2 uppercase tracking-widest">Ваш вибір:</h2>
                <div className="text-3xl md:text-4xl font-black text-slate-800 mb-10 leading-tight">
                  «{winner}»
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={closeModal}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                  >
                    Обрати іншу
                  </button>
                  <button
                    onClick={closeModal}
                    className="w-full py-3 text-slate-400 font-medium hover:text-slate-600 transition-colors"
                  >
                    Закрити
                  </button>
                </div>

                <button 
                  onClick={closeModal}
                  className="absolute top-6 right-6 p-2 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
      <style>{`
        .clip-path-triangle { clip-path: polygon(0% 0%, 100% 0%, 50% 100%); }
      `}</style>
    </div>
  );
}
