import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback: (reset: () => void) => ReactNode;
  children: ReactNode;
}

/** Impede que um erro numa tela derrube o app inteiro. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ROUTIG] erro de tela', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.reset) : this.props.children;
  }
}
