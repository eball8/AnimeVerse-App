import { useEffect, useState } from 'react';
import { subscribeAccountStatus, subscribeStatusEvents } from '../services/accountStatusService';
import type { AccountStatus, StatusEvent } from '../services/accountStatusService';

export const useAccountStatus = (uid?: string): AccountStatus | null => {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  useEffect(() => {
    if (!uid) {
      setStatus(null);
      return;
    }
    return subscribeAccountStatus(uid, setStatus);
  }, [uid]);
  return status;
};

export const useStatusEvents = (uid?: string): StatusEvent[] => {
  const [items, setItems] = useState<StatusEvent[]>([]);
  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }
    return subscribeStatusEvents(uid, setItems);
  }, [uid]);
  return items;
};
