import { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';

export default function AnnouncementsCard() {
  const { profile, apiCall } = useApp();
  const [list, setList] = useState([]);

  useEffect(() => {
    let active = true;
    if (!profile) return;
    apiCall({ action: 'announcements' })
      .then((res) => { if (active && res.ok) setList(res.announcements || []); })
      .catch(() => { if (active) setList([]); });
    return () => { active = false; };
  }, [profile, apiCall]);

  if (!profile || list.length === 0) return null;

  const pinned = list.filter((an) => an.pinned);
  const regular = list.filter((an) => !an.pinned);

  return (
    <section className="card block" id="announcements-card">
      <div className="block-head collapsible">
        <h3>Annonces</h3>
        <span className="pill">{list.length}</span>
      </div>
      <div className="block-body ann-body">
        {pinned.length > 0 && (
          <div className="ann-pinned-block">
            {pinned.map((an, i) => (
              <article key={i} className="ann-item ann-pinned">
                <span className="ann-pin">Épinglé</span>
                {an.title && <h4>{an.title}</h4>}
                {an.body && <p>{an.body}</p>}
                {an.postedOn && <span className="ann-meta">{an.postedOn}</span>}
              </article>
            ))}
          </div>
        )}
        {regular.length > 0 && (
          <div className="ann-list">
            {regular.map((an, i) => (
              <article key={i} className="ann-item">
                {an.title && <h4>{an.title}</h4>}
                {an.body && <p>{an.body}</p>}
                {an.postedOn && <span className="ann-meta">{an.postedOn}</span>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
