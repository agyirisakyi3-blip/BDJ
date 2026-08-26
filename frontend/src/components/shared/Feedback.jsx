import { memo } from 'react';
import { useApp } from '../../contexts/AppContext';

export default memo(function Feedback() {
  const { feedback } = useApp();
  if (!feedback) return null;
  return (
    <div className={'feedback ' + feedback.type} role="status" aria-live="polite">
      {feedback.msg}
    </div>
  );
});
