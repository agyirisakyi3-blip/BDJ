import { useApp } from '../../contexts/AppContext';

export default function Feedback() {
  const { feedback } = useApp();
  if (!feedback) return null;
  return (
    <div className={'feedback ' + feedback.type} role="status" aria-live="polite">
      {feedback.msg}
    </div>
  );
}
