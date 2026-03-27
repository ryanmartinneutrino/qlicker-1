import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Collapse } from '@mui/material';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';

const POLL_INTERVAL = 15000;

export default function ConnectionStatus() {
  const { t } = useTranslation();
  const [isConnected, setIsConnected] = useState(true);
  const intervalRef = useRef(null);

  const checkConnection = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    if (!navigator.onLine) {
      setIsConnected(false);
      return;
    }
    try {
      await apiClient.get('/health', { timeout: 5000 });
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
    intervalRef.current = setInterval(checkConnection, POLL_INTERVAL);

    const handleOnline = () => checkConnection();
    const handleOffline = () => setIsConnected(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkConnection();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkConnection]);

  return (
    <Collapse in={!isConnected}>
      <Alert severity="warning" sx={{ borderRadius: 0 }}>
        {t('connection.serverUnavailable')}
      </Alert>
    </Collapse>
  );
}
