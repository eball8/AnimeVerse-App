import { useEffect, useState } from 'react';
import { getTickets, subscribeTickets, syncTicketReplies } from '../services/reportService';
import type { LocalTicket } from '../services/reportService';

/**
 * يرجع تذاكر بلاغات هذا الجهاز ويتحدّث تلقائياً.
 * مع sync = true يجلب ردود الإدارة دورياً وعند العودة للتطبيق.
 */
export const useReportTickets = (sync = false): LocalTicket[] => {
  const [list, setList] = useState<LocalTicket[]>(() => getTickets());

  useEffect(() => subscribeTickets(setList), []);

  useEffect(() => {
    if (!sync) return;
    syncTicketReplies();
    const iv = window.setInterval(syncTicketReplies, 120000);
    const onVis = () => {
      if (document.visibilityState === 'visible') syncTicketReplies();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [sync]);

  return list;
};
