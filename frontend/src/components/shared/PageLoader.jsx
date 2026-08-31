import { memo } from 'react';

export default memo(function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-label="Chargement">
      <div className="page-loader-inner">
        <div className="page-loader-ring" aria-hidden="true"></div>
        <p>Chargement...</p>
      </div>
    </div>
  );
});
