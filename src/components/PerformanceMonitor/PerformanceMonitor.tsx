import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { PerformanceMonitor as PerfMonitorUtils } from '../../utils/performance';
import styles from './PerformanceMonitor.module.css';

export const PerformanceMonitor: React.FC = () => {
  const { t } = useTranslation();
  const { showPerformanceMonitor } = useSettingsStore();
  const [fps, setFps] = useState(0);
  const [avgFps, setAvgFps] = useState(0);
  const [isVisible, setIsVisible] = useState(showPerformanceMonitor);
  const monitorRef = useRef<PerfMonitorUtils>(new PerfMonitorUtils());
  const requestRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setIsVisible(showPerformanceMonitor);
  }, [showPerformanceMonitor]);

  const animate = (time: number) => {
    monitorRef.current.update();
    if (time % 1000 < 20) { // Update UI roughly every second
      setFps(monitorRef.current.getFPS());
      setAvgFps(monitorRef.current.getAverageFPS());
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isVisible) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span>{t('performanceMonitor.title')}</span>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className={styles.closeBtn}
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          ×
        </button>
      </div>
      <div className={styles.content}>
        <div className={styles.item}>
          <span className={styles.label}>{t('performanceMonitor.fps')}</span>
          <span className={`${styles.value} ${fps < 30 ? styles.low : fps < 55 ? styles.medium : styles.high}`}>
            {fps}
          </span>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>{t('performanceMonitor.avgFps')}</span>
          <span className={styles.value}>{avgFps}</span>
        </div>
        {/* Memory and other stats could be added here */}
      </div>
    </div>
  );
};
