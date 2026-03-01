import { useState, useEffect, useCallback } from 'react';
import { Alert, Collapse } from '@mui/material';
import apiClient from '../../api/client';

const POLL_INTERVAL = 15000;

export default function ConnectionStatus() {
  const [isConnected, setIsConnected] = useState(true);

  const checkConnection = useCallback(async () => {
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
    const interval = setInterval(checkConnection, POLL_INTERVAL);

    const handleOnline = () => checkConnection();
    const handleOffline = () => setIsConnected(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnection]);

  return (
    <Collapse in={!isConnected}>
      <Alert severity="warning" sx={{ borderRadius: 0 }}>
        Unable to connect to the server. Some features may not be available.
      </Alert>
    </Collapse>
  );
}
