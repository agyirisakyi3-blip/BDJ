import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Application error:', error && error.message ? error.message : String(error));
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card card">
            <span className="brand-mark" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
            <h3>Une erreur est survenue</h3>
            <p>L'application a rencontre un probleme inattendu. Vos donnees locales sont conservees sur cet appareil.</p>
            <div className="btn-row">
              <button className="primary-btn" type="button" onClick={this.handleReload}>Recharger l'application</button>
              <button className="ghost-btn" type="button" onClick={this.handleReset}>Reessayer</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}